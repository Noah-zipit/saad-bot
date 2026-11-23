import { downloadMediaMessage } from '@whiskeysockets/baileys'
import type { WAMessage, WASocket } from '@whiskeysockets/baileys'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from './database.js'
import type { ParsedMessage, ParsedQuoted, MediaDownloadResult } from './types.js'
import {
  rawSenderJid,
  senderPnFromKey,
  resolveToPn,
  digitsOf,
  isLidJid,
  isPnJid,
  normalizePn,
  decodeJid,
  participantPn
} from '../lib/jidUtils.js'
import { unwrapViewOnceMessage, VIEW_ONCE_MEDIA_TYPES } from '../lib/viewOnce.js'
import { handleTradeInteraction, handleTradeMenuReply } from '../lib/tradeFlow.js'
import { isTalkbackEnabled } from '../lib/talkbackStore.js'
import { talkbackReply } from '../lib/talkbackReplies.js'
import { talkbackAiReply } from '../lib/talkbackAi.js'
import { getAfk, clearAfk, formatAfkSince } from '../lib/afkStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tmpDir = path.join(__dirname, '../../tmp')

/** console-backed stand-in for Baileys' ILogger (messageHandler has no pino logger of its own) */
function consoleLogger(): any {
  const logger: Record<string, any> = {}
  const methods: Record<string, 'debug' | 'info' | 'warn' | 'error'> = {
    trace: 'debug',
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error',
    fatal: 'error'
  }
  for (const [name, consoleMethod] of Object.entries(methods)) {
    logger[name] = (...args: unknown[]) => (console[consoleMethod] as (...a: unknown[]) => void)(...args)
  }
  logger.child = () => logger
  return logger
}

async function downloadToTmp(wamsg: WAMessage, type: string): Promise<MediaDownloadResult | null> {
  try {
    const buffer = await downloadMediaMessage(wamsg, 'buffer', {}, {
      logger: consoleLogger(),
      // No live re-upload channel here; surface a clear error instead of retrying blindly.
      reuploadRequest: async () => { throw new Error('media reupload not supported') }
    })

    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

    // Save to tmp folder
    const fileName = `${Date.now()}.${type.replace('Message', '')}`
    const filePath = path.join(tmpDir, fileName)

    fs.writeFileSync(filePath, buffer)

    return { buffer, fileName, filePath }
  } catch (e) {
    console.error('Error downloading media:', e)
    return null
  }
}

/**
 * Main message handler
 */
export async function handleMessage(message: WAMessage, sock: WASocket, db: Database): Promise<void> {
  // Check if this is a message
  if (!message.message) return

  // Parse the message
  const m = await parseMessage(message, sock)
  if (!m) return

  // Skip status broadcast messages
  if (m.key.remoteJid === 'status@broadcast') return

  // --- LID/PN identity canonicalization ---
  // Own-account messages (the bot's own sends, and messages the owner
  // sends from their phone) are always the bot account's owner. They must
  // never resolve through the key alternates: in a fromMe DM, remoteJidAlt
  // names the CHAT (the other party), not the sender — reading it used to
  // attribute the owner's messages to whoever they were talking to, so the
  // owner and that person shared one identity (one pack cooldown, one
  // collection). Everyone else canonicalizes key.participant ||
  // key.remoteJid to the PN form when WhatsApp's key alternates or the LID
  // mapping store can resolve it.
  const fromMe = !!message.key.fromMe
  const rawSender = fromMe && sock.user?.id
    ? decodeJid(sock.user.id) ?? ''
    : rawSenderJid(message)

  let sender: string
  let mappedPn: string | undefined
  if (fromMe) {
    sender = isPnJid(rawSender) ? normalizePn(rawSender) : rawSender
    mappedPn = isPnJid(sender) ? sender : undefined
  } else {
    const keyPn = senderPnFromKey(message)
    mappedPn = keyPn ?? (await resolveToPn(sock, rawSender)) ?? db.lookupPnByLid(rawSender)
    if (mappedPn) {
      // Remember the link so future messages resolve instantly and the user's
      // stored record (bans, warnings, premium) follows them across address forms.
      if (isLidJid(rawSender)) await db.linkLidPn(rawSender, mappedPn)
      sender = mappedPn
    } else {
      sender = rawSender
    }
  }

  m.senderRaw = rawSender
  m.senderPn = mappedPn
  m.sender = sender

  // Mentions and quoted senders arrive in raw form (often a LID) and must
  // go through the same resolution, or !duel / !trade see a stranger with
  // no cards where a known player stands.
  const canonicalJid = async (jid: string): Promise<string> => {
    if (isPnJid(jid)) return normalizePn(jid)
    if (isLidJid(jid)) return (await resolveToPn(sock, jid)) ?? db.lookupPnByLid(jid) ?? jid
    return jid
  }
  if (m.mentionedJid.length > 0) {
    m.mentionedJid = await Promise.all(m.mentionedJid.map(canonicalJid))
  }
  if (m.quoted) {
    m.quoted.sender = await canonicalJid(m.quoted.sender)
  }
  // Messages sent from the bot's own linked device are the owner's own hands.
  m.isOwner = isOwner(m.sender) || !!message.key.fromMe

  // Track message (canonical sender — stats follow the person, not the address form)
  await db.trackMessage(m.sender, m.chat)

  // Log incoming message
  console.log(`[MSG] ${m.pushName} (${digitsOf(m.sender)}): ${m.body || m.type}`)

  // Check maintenance mode
  const maintenanceMode = await db.getSetting('maintenanceMode')
  if (maintenanceMode?.enabled && !m.isOwner) {
    m.reply(`*Bot is under maintenance*\n\nReason: ${maintenanceMode.reason}\n\n_Please try again later._`)
    return
  }

  // Check if user is banned
  const user = db.getUser(m.sender)
  if (user.banned && !m.isOwner) {
    m.reply(`*Access Denied*\n\nYou have been banned from using this bot.\n\nReason: ${user.banReason || 'No reason given'}`)
    return
  }

  // --- Antilink (staged): enforces the existing group.settings.antiLink
  // toggle (!settings antilink on / !antilink on). Non-admins posting a
  // WhatsApp group invite link get the message deleted (bot must be admin
  // to delete) plus a warning. Admins and the owner are exempt. The
  // message is dropped here so it never reaches command handling.
  if (m.isGroup && !m.fromMe && !m.isOwner && m.body) {
    try {
      const group = db.getGroup(m.chat)
      if (group.settings.antiLink && /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i.test(m.body)) {
        const senderIsAdmin = await isAdmin(m.sender, m.chat, sock)
        if (!senderIsAdmin) {
          const botIsAdmin = await isBotAdmin(m.chat, sock)
          if (botIsAdmin) {
            await sock.sendMessage(m.chat, { delete: message.key })
            await sock.sendMessage(m.chat, {
              text: `⚠️ @${digitsOf(m.sender)} — group invite links are not allowed here.`,
              mentions: [m.sender]
            })
          } else {
            await m.reply('⚠️ Group invite links are not allowed here, but I need admin rights to delete them. Ask a group admin to make me admin.')
          }
          return
        }
      }
    } catch (e) {
      console.error('[antilink] failed:', e)
    }
  }

  // --- AFK (staged): auto-clear when the AFK user speaks again, and tell
  // people who tag an AFK user. Non-command messages only, so !afk itself
  // still manages its own state; own messages are skipped (no self-reply).
  const cmdPrefix = global.prefix || '!'
  const isCommandMsg = !!(m.body && m.body.startsWith(cmdPrefix))
  if (!m.fromMe && !isCommandMsg) {
    try {
      const mine = await getAfk(m.sender)
      if (mine) {
        await clearAfk(m.sender)
        await m.reply(`Welcome back, ${m.pushName}! You were AFK${mine.reason ? ` — ${mine.reason}` : ''}.`)
      } else if (m.mentionedJid.length > 0) {
        for (const jid of m.mentionedJid) {
          const afk = await getAfk(jid)
          if (afk) {
            await sock.sendMessage(m.chat, {
              text: `💤 *${digitsOf(jid)} is AFK*${afk.reason ? `\n${afk.reason}` : ''}\n_Since ${formatAfkSince(afk.since)}_`
            }, { quoted: message })
          }
        }
      }
    } catch (e) {
      console.error('[afk] failed:', e)
    }
  }

  // --- Anti view-once: save incoming view-once photos/videos/voice notes and
  // re-send them as normal messages so they stay viewable (owner asked for this).
  if (m.viewOnce && VIEW_ONCE_MEDIA_TYPES.includes(m.viewOnce.type)) {
    const avSetting = await db.getSetting('antiViewOnce')
    if (avSetting?.enabled !== false) {
      try {
        const mediaWamsg = { key: message.key, message: m.viewOnce.message } as WAMessage
        const dl = await downloadToTmp(mediaWamsg, m.viewOnce.type)
        if (dl) {
          const kind = m.viewOnce.type.replace('Message', '').toLowerCase()
          const note = `👁 *View-once saved* — from ${m.pushName}\n_This ${kind} was view-once; kept here as a normal message._`
          if (m.viewOnce.type === 'imageMessage') {
            await sock.sendMessage(m.chat, { image: dl.buffer, caption: note })
          } else if (m.viewOnce.type === 'videoMessage') {
            await sock.sendMessage(m.chat, { video: dl.buffer, caption: note })
          } else {
            const innerAudio = (m.viewOnce.message as Record<string, any>).audioMessage ?? {}
            await sock.sendMessage(m.chat, {
              audio: dl.buffer,
              mimetype: innerAudio.mimetype || 'audio/ogg; codecs=opus',
              ptt: true
            })
            await sock.sendMessage(m.chat, { text: note })
          }
          console.log(`[anti-viewonce] saved ${kind} from ${digitsOf(m.sender)} in ${m.chat}`)
        } else {
          // Visible instead of silent: the user thought the feature was dead.
          await sock.sendMessage(m.chat, {
            text: '👁 _View-once detected, but I could not fetch the media (it may have expired). Reply to it with *!vv* and I will try again._'
          })
          console.log(`[anti-viewonce] download failed for view-once from ${digitsOf(m.sender)} in ${m.chat}`)
        }
      } catch (e) {
        console.error('[anti-viewonce] failed:', e)
      }
    }
  }

  // Interactive replies (list / button taps) route to the trade flow
  // before anything else — they carry no command text.
  if (m.type === 'listResponseMessage' || m.type === 'buttonsResponseMessage') {
    try {
      if (await handleTradeInteraction(m, sock)) return
    } catch (e) {
      console.error('[trade-interaction] failed:', e)
    }
    return
  }

  // Numbered-menu replies for a trade in menu mode (plain "1", "2" ...)
  // are consumed here, before commands and talkback — and not gated on
  // !fromMe, since the owner's own phone taps count too.
  if ((m.type === 'conversation' || m.type === 'extendedTextMessage') && m.body) {
    try {
      if (await handleTradeMenuReply(m, sock)) return
    } catch (e) {
      console.error('[trade-menu] failed:', e)
    }
  }

  // Process command if this is a command
  const prefix = global.prefix || '!'
  if (m.body && m.body.startsWith(prefix)) {
    const [command, ...args] = m.body.slice(prefix.length).trim().split(/\s+/)

    // Get all plugins
    const plugins = global.plugins || {}

    // Find matching plugin for this command
    for (const pluginId in plugins) {
      const { pattern, handler, owner, admin, group, premium } = plugins[pluginId]

      if (pattern && pattern.test(command)) {
        // Bot mode gate: in private mode only the owner may use commands
        const botMode = (await db.getSetting('mode')) || 'public'
        if (botMode === 'private' && !m.isOwner) {
          m.reply('*🔒 Bot is in private mode*\n\nOnly the owner can use the bot right now.')
          return
        }

        // Check permissions
        if (owner && !m.isOwner) {
          m.reply('Only the owner can use this command.')
          return
        }

        if (premium && !user.isPremium) {
          m.reply('This command is for premium users.')
          return
        }

        if (admin) {
          m.isAdmin = await isAdmin(m.sender, m.chat, sock)
          if (!m.isAdmin) {
            m.reply('Only group admins can use this command.')
            return
          }
        }

        if (group && !m.isGroup) {
          m.reply('This command can only be used in groups.')
          return
        }

        try {
          // Track command usage
          await db.trackCommand(command, m.sender)

          // Execute the command handler
          await handler(m, { sock, args, db })
        } catch (e) {
          console.error('Error executing command:', e)
          m.reply(`Error: ${(e as Error).message}`)
        }

        break
      }
    }
  } else if (!m.fromMe && m.body && (m.type === 'conversation' || m.type === 'extendedTextMessage')) {
    // Talkback mode (staged): when a chat has !talkback on, the bot replies
    // to plain chat messages. Commands never reach here (they take the branch
    // above). Own messages are skipped so the bot can never reply to itself.
    // In groups it only answers when tagged or replied to, so it cannot
    // flood a busy group; in a DM it answers every message.
    try {
      if (await isTalkbackEnabled(m.chat)) {
        const botDigits = digitsOf(decodeJid(sock.user?.id ?? '') ?? '')
        const mentionedBot = botDigits
          ? m.mentionedJid.some(j => digitsOf(j) === botDigits)
          : false
        const quotedBot = botDigits && m.quoted
          ? digitsOf(m.quoted.sender) === botDigits
          : false
        if (!m.isGroup || mentionedBot || quotedBot) {
          // AI first (NVIDIA NIM, per-chat history); built-in replies
          // are the fallback when no key is set or the API call fails,
          // so talkback never goes silent because of an API problem.
          const aiReply = await talkbackAiReply(m.chat, m.body, m.pushName)
          await m.reply(aiReply ?? talkbackReply(m.body, m.pushName))
        }
      }
    } catch (e) {
      console.error('[talkback] failed:', e)
    }
  }
}

/**
 * Parse incoming WhatsApp message
 */
async function parseMessage(message: WAMessage, sock: WASocket): Promise<ParsedMessage | null> {
  const inner = message.message ?? {}
  const types = Object.keys(inner)

  const type = types[0] ?? ''
  let body = ''

  // Unwrap view-once messages so the inner media can be seen/downloaded.
  // The helper also peels ephemeralMessage wrappers (disappearing-message
  // chats), which used to make view-once detection silently miss everything.
  const viewOnce = unwrapViewOnceMessage(inner as Record<string, any>)

  if (type === 'conversation') {
    body = inner.conversation || ''
  } else if (type === 'extendedTextMessage') {
    body = inner.extendedTextMessage?.text || ''
  } else if (type === 'imageMessage') {
    body = inner.imageMessage?.caption || ''
  } else if (type === 'videoMessage') {
    body = inner.videoMessage?.caption || ''
  } else if (type === 'listResponseMessage') {
    // Tap on a list row (trade flow): the row id is the selection.
    body = inner.listResponseMessage?.singleSelectReply?.selectedRowId || ''
  } else if (type === 'buttonsResponseMessage') {
    body = inner.buttonsResponseMessage?.selectedButtonId || ''
  }

  const chat = decodeJid(message.key.remoteJid) ?? ''
  const fromMe = message.key.fromMe ?? undefined
  const isGroup = chat.endsWith('@g.us')

  // Mentions live on the inner message's contextInfo (not on the top-level key)
  const contextInfo =
    inner.extendedTextMessage?.contextInfo ??
    inner.imageMessage?.contextInfo ??
    inner.videoMessage?.contextInfo ??
    null
  const mentionedJid = (contextInfo?.mentionedJid ?? []).filter((j): j is string => !!j)

  // Get quoted message if any
  let quoted: ParsedQuoted | undefined
  let quotedMessage = inner.extendedTextMessage?.contextInfo?.quotedMessage
  // STAGED FIX: disappearing-message chats wrap the quoted message in an
  // ephemeralMessage envelope. Without peeling it, quotedType comes out
  // as "ephemeralMessage", no download is ever wired up, and commands
  // like !take / !sticker fail on quoted media in those chats.
  while (quotedMessage && Object.keys(quotedMessage)[0] === 'ephemeralMessage') {
    quotedMessage = (quotedMessage as Record<string, any>).ephemeralMessage?.message
  }
  if (type === 'extendedTextMessage' && quotedMessage) {
    const quotedType = Object.keys(quotedMessage)[0] ?? ''
    quoted = {
      message: quotedMessage,
      sender: decodeJid(inner.extendedTextMessage?.contextInfo?.participant) ?? '',
      type: quotedType
    }
    // Allow downloading quoted media (e.g. !sticker as a reply to an image),
    // including view-once media (e.g. !vv as a reply to a view-once message).
    // NOTE: stickerMessage MUST be in this list — !take's main use case is
    // replying to a sticker, and without it quoted.download stays undefined
    // and the command fails with "Failed to download that media."
    // NOTE: audioMessage is in this list so !vv can reveal a bare quoted
    // voice note (clients that strip the view-once wrapper in replies).
    if (quotedType === 'imageMessage' || quotedType === 'videoMessage' || quotedType === 'stickerMessage' || quotedType === 'audioMessage') {
      const quotedWamsg = { key: message.key, message: quotedMessage } as WAMessage
      quoted.download = () => downloadToTmp(quotedWamsg, quotedType)
    } else {
      const quotedVo = unwrapViewOnceMessage(quotedMessage as Record<string, any>)
      if (quotedVo) {
        const quotedWamsg = { key: message.key, message: quotedVo.message } as WAMessage
        quoted.download = () => downloadToTmp(quotedWamsg, quotedVo.type)
      }
    }
  }

  // Split out command parts when the body starts with the prefix
  const prefix = global.prefix || '!'
  let args: string[] = []
  let command: string | undefined
  if (body.startsWith(prefix)) {
    const parts = body.slice(prefix.length).trim().split(/\s+/)
    command = parts[0]
    args = parts.slice(1)
  }

  const m: ParsedMessage = {
    message,
    key: message.key,
    sender: rawSenderJid(message),
    senderRaw: rawSenderJid(message),
    senderPn: undefined,
    chat,
    fromMe,
    isGroup,
    pushName: message.pushName || 'Unknown',
    type,
    body,
    text: body,
    args,
    command,
    prefix,
    mentionedJid,
    quoted,
    viewOnce,
    isOwner: false,
    isAdmin: false,
    isBotAdmin: false,
    reply: (text: string) => sock.sendMessage(chat, { text }, { quoted: message }),
    react: (emoji: string) =>
      sock.sendMessage(chat, { react: { text: emoji, key: message.key } })
  }

  // Add download function for media messages
  if (['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage'].includes(type)) {
    m.download = () => downloadToTmp(message, type)
  }

  return m
}

/**
 * Check if user is an owner (digit comparison — LID/PN agnostic)
 */
export function isOwner(jid: string): boolean {
  return global.owner.some(o => digitsOf(o[0]) === digitsOf(jid))
}

/**
 * Check if user is an admin (matches participants by canonical digits,
 * so LID-addressed groups work the same as PN-addressed ones)
 */
export async function isAdmin(jid: string, groupJid: string, sock: WASocket): Promise<boolean> {
  if (!groupJid.endsWith('@g.us')) return false

  try {
    const groupMetadata = await sock.groupMetadata(groupJid)
    const participant = groupMetadata.participants.find(
      p => digitsOf(participantPn(p) ?? p.id) === digitsOf(jid)
    )
    return !!participant && (participant.admin === 'admin' || participant.admin === 'superadmin')
  } catch (e) {
    console.error('Error checking admin status:', e)
    return false
  }
}

/**
 * Check if bot is admin
 */
export async function isBotAdmin(groupJid: string, sock: WASocket): Promise<boolean> {
  if (!groupJid.endsWith('@g.us')) return false

  try {
    const groupMetadata = await sock.groupMetadata(groupJid)
    const botDigits = digitsOf(sock.user?.id ?? '')
    const participant = groupMetadata.participants.find(
      p => digitsOf(participantPn(p) ?? p.id) === botDigits
    )
    return !!participant && (participant.admin === 'admin' || participant.admin === 'superadmin')
  } catch (e) {
    console.error('Error checking bot admin status:', e)
    return false
  }
}
