import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { proto, generateWAMessageFromContent } from '@whiskeysockets/baileys'
import type { ParsedMessage } from '../core/types.js'
import { CARDS, CARD_BY_ID, formatCard, type CardDef } from './cards.js'
import { getPlayer, ownsCard, tradeCards, type Player } from './cardStore.js'
import { digitsOf, sameUser } from './jidUtils.js'

/**
 * Button trade flow — trading by tapping instead of typing
 * "!trade @user All Might | Son Goku".
 *
 *   !trade @user            -> list of YOUR cards, tap the one you give
 *   (or !trade @user <card> to skip that step)
 *                         -> list of THEIR cards, tap the one you want
 *                         -> the partner gets an Accept / Decline list
 *                         -> Accept executes the swap, Decline cancels it
 *
 * Interaction ids: trade:give:<cardId>, trade:want:<cardId>,
 * trade:accept, trade:decline, trade:cancel.
 *
 * WhatsApp list messages are the tap mechanism. If the server rejects a
 * list send (interactive messages are not allowed everywhere), the step
 * falls back to a numbered text menu and the user replies with a number.
 * State lives in memory only and expires after 5 minutes; a bot restart
 * cancels any pending trade.
 */

export type TradeStage = 'pick-give' | 'pick-want' | 'confirm'

export interface PendingTrade {
  initiator: string
  initiatorName: string
  initiatorChat: string
  partner: string
  giveCardId?: string
  wantCardId?: string
  stage: TradeStage
  mode: 'list' | 'menu'
  /** card ids in menu order (menu mode only) */
  menuOptions: string[]
  /** where the confirm goes: the group, or the partner's DM */
  confirmChat: string
  createdAt: number
}

const PENDING = new Map<string, PendingTrade>()
const TTL_MS = 5 * 60 * 1000
const RARITY_ORDER = ['Legendary', 'Epic', 'Rare', 'Common'] as const

const trunc = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function ownedCards(p: Player): { def: CardDef; count: number }[] {
  return Object.entries(p.cards)
    .map(([id, count]) => ({ def: CARD_BY_ID[id], count }))
    .filter(o => !!o.def)
    .sort((a, b) => b.def.power - a.def.power || a.def.name.localeCompare(b.def.name))
}

function findTradeFor(user: string): PendingTrade | undefined {
  for (const t of PENDING.values()) {
    if (sameUser(t.initiator, user)) return t
    if (t.stage === 'confirm' && sameUser(t.partner, user)) return t
  }
  return undefined
}

function partnerHasConfirm(partner: string): boolean {
  for (const t of PENDING.values()) {
    if (t.stage === 'confirm' && sameUser(t.partner, partner)) return true
  }
  return false
}

function expired(t: PendingTrade): boolean {
  return Date.now() - t.createdAt > TTL_MS
}

/**
 * Send a WhatsApp list message.
 *
 * Baileys 7 dropped the { text, buttonText, sections } shorthand, so the
 * list is built as raw proto and relayed directly. If the relay throws
 * (server rejects interactive messages, bad shape, ...), the caller falls
 * back to a numbered text menu.
 */
async function sendListMessage(
  sock: WASocket,
  chat: string,
  quoted: WAMessage | undefined,
  list: proto.Message.IListMessage
): Promise<void> {
  const content = proto.Message.fromObject({ listMessage: list })
  const waMsg = generateWAMessageFromContent(chat, content, {
    userJid: sock.user?.id ?? '',
    quoted
  })
  await sock.relayMessage(chat, waMsg.message!, { messageId: waMsg.key.id! })
}

async function sendText(sock: WASocket, chat: string, text: string): Promise<void> {
  await sock.sendMessage(chat, { text })
}

async function notifyBoth(
  sock: WASocket,
  t: PendingTrade,
  toInitiator: string,
  toPartner?: string
): Promise<void> {
  await sendText(sock, t.initiatorChat, toInitiator)
  if (toPartner && t.confirmChat !== t.initiatorChat) {
    await sendText(sock, t.confirmChat, toPartner)
  }
}

interface ListRow {
  title: string
  description: string
  rowId: string
}

interface ListSection {
  title: string
  rows: ListRow[]
}

function cardSections(
  owned: { def: CardDef; count: number }[],
  prefix: 'give' | 'want'
): ListSection[] {
  const sections: ListSection[] = []
  for (const rarity of RARITY_ORDER) {
    const rows: ListRow[] = owned
      .filter(o => o.def.rarity === rarity)
      .map(o => ({
        title: trunc(o.def.name, 24),
        description: trunc(
          `${o.def.rarity} · ⚔️ ${o.def.power}${o.count > 1 ? ` ×${o.count}` : ''} · ${o.def.series}`,
          72
        ),
        rowId: `trade:${prefix}:${o.def.id}`
      }))
    if (rows.length > 0) sections.push({ title: rarity, rows })
  }
  sections.push({
    title: 'Trade',
    rows: [{ title: '❌ Cancel trade', description: 'Stop this trade.', rowId: 'trade:cancel' }]
  })
  return sections
}

function menuText(
  heading: string,
  owned: { def: CardDef; count: number }[],
  footer: string
): { text: string; options: string[] } {
  const options = owned.map(o => o.def.id)
  const lines = owned.map(
    (o, i) => `${i + 1}. ${o.def.name} — ${o.def.rarity}, ⚔️ ${o.def.power}${o.count > 1 ? ` ×${o.count}` : ''}`
  )
  return {
    text: `${heading}\n\n${lines.join('\n')}\n\n0. Cancel\n\n${footer}`,
    options
  }
}

/**
 * Send a card-pick list; on failure fall back to a numbered text menu.
 * Returns the mode actually in use and the menu order (menu mode only).
 */
async function sendPick(
  sock: WASocket,
  chat: string,
  quoted: WAMessage | undefined,
  heading: string,
  buttonText: string,
  owned: { def: CardDef; count: number }[],
  prefix: 'give' | 'want'
): Promise<{ mode: 'list' | 'menu'; options: string[] }> {
  try {
    await sendListMessage(sock, chat, quoted, {
      title: '🔄 Card trade',
      description: heading,
      buttonText,
      footerText: 'Saad Bot',
      listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
      sections: cardSections(owned, prefix)
    })
    return { mode: 'list', options: [] }
  } catch (e) {
    console.error('[trade] list send failed, falling back to numbered menu:', e)
    const { text, options } = menuText(
      heading,
      owned,
      'Lists did not go through, so reply with the number of your pick.'
    )
    await sendText(sock, chat, text)
    return { mode: 'menu', options }
  }
}

async function sendConfirm(sock: WASocket, t: PendingTrade): Promise<void> {
  const give = CARD_BY_ID[t.giveCardId ?? '']
  const want = CARD_BY_ID[t.wantCardId ?? '']
  if (!give || !want) return
  const text =
    `*🔄 TRADE OFFER*\n\n` +
    `${t.initiatorName} offers:\n${formatCard(give)}\n\n` +
    `For your:\n${formatCard(want)}\n\n` +
    `Tap to answer. This offer expires in 5 minutes.`
  try {
    await sendListMessage(sock, t.confirmChat, undefined, {
      title: '🔄 Trade offer',
      description: text,
      buttonText: 'Answer',
      footerText: 'Saad Bot',
      listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
      sections: [
        {
          title: 'Trade offer',
          rows: [
            {
              title: '✅ Accept the trade',
              description: trunc(`You get ${give.name}`, 72),
              rowId: 'trade:accept'
            },
            { title: '❌ Decline', description: 'No cards change hands.', rowId: 'trade:decline' }
          ]
        }
      ]
    })
    t.mode = 'list'
    t.menuOptions = []
  } catch (e) {
    console.error('[trade] confirm list failed, falling back to numbered menu:', e)
    t.mode = 'menu'
    t.menuOptions = ['accept', 'decline']
    await sendText(
      sock,
      t.confirmChat,
      `${text}\n\nReply with the number:\n1. Accept the trade\n2. Decline`
    )
  }
}

/** Start the tap flow. presetGive skips the give-pick step. */
export async function startTradeFlow(
  m: ParsedMessage,
  sock: WASocket,
  partner: string,
  presetGiveId?: string
): Promise<void> {
  if (sameUser(partner, m.sender)) {
    await m.reply('You cannot trade with yourself.')
    return
  }
  if (partnerHasConfirm(partner)) {
    await m.reply('They already have a trade offer waiting. Give them a moment to answer it.')
    return
  }
  const me = getPlayer(m.sender)
  const them = getPlayer(partner)
  if (ownedCards(me).length === 0) {
    await m.reply('You have no cards yet. Open a *!pack* first.')
    return
  }
  if (ownedCards(them).length === 0) {
    await m.reply('They have no cards yet. They need to open a *!pack* first.')
    return
  }
  if (presetGiveId && !ownsCard(me, presetGiveId)) {
    await m.reply(`You do not own *${CARD_BY_ID[presetGiveId]?.name ?? presetGiveId}*. Check *!cards*.`)
    return
  }

  PENDING.delete(m.sender)
  const trade: PendingTrade = {
    initiator: m.sender,
    initiatorName: m.pushName,
    initiatorChat: m.chat,
    partner,
    giveCardId: presetGiveId,
    stage: presetGiveId ? 'pick-want' : 'pick-give',
    mode: 'list',
    menuOptions: [],
    confirmChat: m.isGroup ? m.chat : partner,
    createdAt: Date.now()
  }
  PENDING.set(m.sender, trade)

  if (presetGiveId) {
    await sendWantStep(sock, m, trade)
  } else {
    const { mode, options } = await sendPick(
      sock,
      m.chat,
      m.message,
      `*🔄 TRADE*\n\nTap the card you give to ${digitsOf(partner)}:`,
      'Choose card',
      ownedCards(me),
      'give'
    )
    trade.mode = mode
    trade.menuOptions = options
  }
}

async function sendWantStep(sock: WASocket, m: ParsedMessage, t: PendingTrade): Promise<void> {
  const them = getPlayer(t.partner)
  const owned = ownedCards(them)
  if (owned.length === 0) {
    PENDING.delete(t.initiator)
    await m.reply('They have no cards left to trade. Trade cancelled.')
    return
  }
  const { mode, options } = await sendPick(
    sock,
    t.initiatorChat,
    m.message,
    `Now tap the card you want from ${digitsOf(t.partner)}:`,
    'Choose card',
    owned,
    'want'
  )
  t.mode = mode
  t.menuOptions = options
}

type TradeAction =
  | { kind: 'give'; cardId: string }
  | { kind: 'want'; cardId: string }
  | { kind: 'accept' }
  | { kind: 'decline' }
  | { kind: 'cancel' }

/** Shared step logic for list taps and numbered-menu replies. */
async function advance(
  sock: WASocket,
  m: ParsedMessage,
  t: PendingTrade,
  action: TradeAction
): Promise<void> {
  const isInitiator = sameUser(m.sender, t.initiator)
  const isPartner = sameUser(m.sender, t.partner)

  if (action.kind === 'cancel') {
    if (!isInitiator && !isPartner) return
    PENDING.delete(t.initiator)
    if (isInitiator) {
      await notifyBoth(
        sock,
        t,
        'Trade cancelled.',
        'Trade cancelled — the other side called it off.'
      )
    } else {
      await notifyBoth(sock, t, 'They cancelled the trade.', 'Trade cancelled.')
    }
    return
  }

  if (action.kind === 'give' || action.kind === 'want') {
    if (!isInitiator || (action.kind === 'give' && t.stage !== 'pick-give') || (action.kind === 'want' && t.stage !== 'pick-want')) {
      await m.reply('That tap is not for you, or this trade has moved on.')
      return
    }
    if (action.kind === 'give') {
      const me = getPlayer(t.initiator)
      if (!ownsCard(me, action.cardId)) {
        await m.reply('You no longer own that card. Pick another one.')
        return
      }
      t.giveCardId = action.cardId
      t.stage = 'pick-want'
      await sendWantStep(sock, m, t)
      return
    }
    const them = getPlayer(t.partner)
    if (!ownsCard(them, action.cardId)) {
      await m.reply('They no longer own that card. Pick another one.')
      return
    }
    t.wantCardId = action.cardId
    t.stage = 'confirm'
    await sendConfirm(sock, t)
    await sendText(sock, t.initiatorChat, 'Offer sent. Waiting for them to accept or decline.')
    return
  }

  // accept / decline — partner only, confirm stage only
  if (!isPartner || t.stage !== 'confirm') {
    await m.reply('That tap is not for you, or this trade has moved on.')
    return
  }
  const give = CARD_BY_ID[t.giveCardId ?? '']
  const want = CARD_BY_ID[t.wantCardId ?? '']
  if (action.kind === 'decline' || !give || !want) {
    PENDING.delete(t.initiator)
    await notifyBoth(
      sock,
      t,
      'They declined the trade. No cards changed hands.',
      'Trade declined.'
    )
    return
  }
  const me = getPlayer(t.initiator)
  const them = getPlayer(t.partner)
  if (!ownsCard(me, give.id) || !ownsCard(them, want.id)) {
    PENDING.delete(t.initiator)
    await notifyBoth(
      sock,
      t,
      'Trade cancelled — one of the cards changed hands meanwhile.',
      'Trade cancelled — one of the cards changed hands meanwhile.'
    )
    return
  }
  if (!tradeCards(t.initiator, t.partner, give.id, want.id)) {
    PENDING.delete(t.initiator)
    await notifyBoth(sock, t, 'That trade could not be completed. Try again.', 'That trade could not be completed.')
    return
  }
  PENDING.delete(t.initiator)
  await notifyBoth(
    sock,
    t,
    `*🤝 TRADE DONE*\n\nYou gave ${formatCard(give)}\nYou got ${formatCard(want)}`,
    `*🤝 TRADE DONE*\n\nYou gave ${formatCard(want)}\nYou got ${formatCard(give)}`
  )
}

/** Route a list / button tap to the trade flow. Returns true when handled. */
export async function handleTradeInteraction(m: ParsedMessage, sock: WASocket): Promise<boolean> {
  const id = m.body.trim()
  if (!id.startsWith('trade:')) return false
  const t = findTradeFor(m.sender)
  if (!t) {
    await m.reply('That trade is no longer open. Start a new one with *!trade @user*.')
    return true
  }
  if (expired(t)) {
    PENDING.delete(t.initiator)
    await m.reply('That trade expired. Start a new one with *!trade @user*.')
    return true
  }
  const parts = id.split(':')
  const step = parts[1]
  if (step === 'give' && parts[2]) {
    await advance(sock, m, t, { kind: 'give', cardId: parts[2] })
  } else if (step === 'want' && parts[2]) {
    await advance(sock, m, t, { kind: 'want', cardId: parts[2] })
  } else if (step === 'accept') {
    await advance(sock, m, t, { kind: 'accept' })
  } else if (step === 'decline') {
    await advance(sock, m, t, { kind: 'decline' })
  } else if (step === 'cancel') {
    await advance(sock, m, t, { kind: 'cancel' })
  } else {
    return false
  }
  return true
}

/**
 * Route a plain-number reply while a trade is in numbered-menu mode.
 * Returns true when the reply was consumed by the trade flow.
 */
export async function handleTradeMenuReply(m: ParsedMessage, sock: WASocket): Promise<boolean> {
  const body = m.body.trim()
  if (!/^\d{1,2}$/.test(body)) return false
  const t = findTradeFor(m.sender)
  if (!t || t.mode !== 'menu') return false
  if (t.initiatorChat !== m.chat && t.confirmChat !== m.chat) return false
  if (expired(t)) {
    PENDING.delete(t.initiator)
    await m.reply('That trade expired. Start a new one with *!trade @user*.')
    return true
  }
  const n = parseInt(body, 10)
  if (n === 0) {
    await advance(sock, m, t, { kind: 'cancel' })
    return true
  }
  if (t.stage === 'confirm') {
    if (n === 1) await advance(sock, m, t, { kind: 'accept' })
    else if (n === 2) await advance(sock, m, t, { kind: 'decline' })
    else await m.reply('Reply *1* to accept or *2* to decline.')
    return true
  }
  const cardId = t.menuOptions[n - 1]
  if (!cardId) {
    await m.reply(`Reply with a number from the list, or *0* to cancel.`)
    return true
  }
  if (t.stage === 'pick-give') await advance(sock, m, t, { kind: 'give', cardId })
  else if (t.stage === 'pick-want') await advance(sock, m, t, { kind: 'want', cardId })
  else return false
  return true
}
