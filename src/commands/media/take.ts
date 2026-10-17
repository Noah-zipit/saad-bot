import { Sticker } from 'wa-sticker-formatter'
import { fileTypeFromBuffer } from 'file-type'
import type { ParsedMessage, CommandContext, MediaDownloadResult } from '../../core/types.js'
import { getStickerDefaults, parseNameArgs, rawArgsText } from '../../lib/stickerNames.js'
import { makeAnimatedSticker, addStickerMetadata } from '../../lib/animatedSticker.js'

type MediaMsg = { type: string; download?: () => Promise<MediaDownloadResult | null> }

function findMedia(m: ParsedMessage): MediaMsg | undefined {
  const types = ['stickerMessage', 'imageMessage', 'videoMessage']
  if (types.includes(m.type)) return m
  if (m.quoted && types.includes(m.quoted.type)) return m.quoted
  return undefined
}

/**
 * True when the buffer is an animated webp (carries an ANIM chunk).
 * Used to decide whether a quoted sticker needs the animated metadata
 * path (which preserves motion) or the static re-encode path.
 */
function isAnimatedWebp(buf: Buffer): boolean {
  let off = 12
  while (off + 8 <= buf.length) {
    const fourcc = buf.subarray(off, off + 4).toString('latin1')
    if (fourcc === 'ANIM') return true
    if (!/^[\x20-\x7e]{4}$/.test(fourcc)) break
    const size = buf.readUInt32LE(off + 4)
    if (off + 8 + size > buf.length) break
    off += 8 + size + (size & 1)
  }
  return false
}

/**
 * !take — take a sticker (or any media) and put YOUR saved set name on it.
 *
 * Reply to someone's sticker with !take and it comes back with your pack
 * and author names (saved with !setname) instead of theirs. Also works on
 * plain images/videos like !sticker.
 *
 * Naming: !take My Pack | Ashar   (one-off override)
 * Or save names once with !setname and every !take carries them.
 */
const handler = async (m: ParsedMessage, { sock, db }: CommandContext) => {
  try {
    const mediaMsg = findMedia(m)
    if (!mediaMsg) {
      return m.reply(
        'Reply to a *sticker* with *!take* to re-send it with your own set name.\n' +
        'It also works on images/videos like *!sticker*.\n\n' +
        'Your names come from *!setname* — set them once and every !take carries them.'
      )
    }

    await m.reply(global.mess.wait)

    const media = await mediaMsg.download?.()
    if (!media) {
      return m.reply('Failed to download that media. Try again with a different one.')
    }

    // Resolve names: inline override > saved defaults > built-in default
    const dataDir = (db as unknown as { dataDir?: string }).dataDir || process.env.DATA_DIR || 'data'
    const saved = getStickerDefaults(dataDir, m.sender)
    const inline = parseNameArgs(rawArgsText(m.body, m.prefix))
    const pack = (inline.pack || saved.pack).slice(0, 60)
    const author = (inline.author || saved.author).slice(0, 60)

    let animated = false
    try {
      const ft = await fileTypeFromBuffer(media.buffer)
      if (ft) {
        animated =
          ft.mime === 'image/gif' ||
          ft.mime.startsWith('video') ||
          (ft.mime === 'image/webp' && isAnimatedWebp(media.buffer))
      }
    } catch {
      animated = mediaMsg.type === 'videoMessage'
    }

    let stickerBuffer: Buffer
    if (mediaMsg.type === 'stickerMessage' && !animated) {
      // Static sticker steal: re-encode with the new names.
      stickerBuffer = await new Sticker(media.buffer, {
        pack,
        author,
        type: 'default',
        categories: ['🌸', '⚔️'],
        id: Date.now().toString(),
        quality: 70
      } as any).toBuffer()
    } else if (mediaMsg.type === 'stickerMessage') {
      // Animated sticker steal: re-stamp names without re-encoding so the
      // motion survives untouched (also repairs the animation flag).
      stickerBuffer = await addStickerMetadata(media.buffer, {
        id: Date.now().toString(),
        pack,
        author
      })
    } else if (animated) {
      // Fresh media (GIF/video) → purpose-built animated encoder.
      const ext = mediaMsg.type === 'videoMessage' ? '.mp4' : '.gif'
      const raw = await makeAnimatedSticker(media.buffer, ext)
      stickerBuffer = await addStickerMetadata(raw, { id: Date.now().toString(), pack, author })
    } else {
      stickerBuffer = await new Sticker(media.buffer, {
        pack,
        author,
        type: 'default',
        categories: ['🌸', '⚔️'],
        id: Date.now().toString(),
        quality: 70
      } as any).toBuffer()
    }

    await sock.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m.message })
  } catch (error) {
    console.error('Error in take:', error)
    m.reply('Failed to take that. Make sure it is a sticker, image, or video under ~10MB and try again.')
  }
}

export default {
  pattern: /^(take|steal|wm)$/i,
  handler,
  help: 'Take a sticker and re-send it with your own set name (!take)',
  usage: '!take [pack name | author]  — reply to any sticker, image, or video. Names come from !setname.',
  example: '!take (reply to a sticker to put your name on it)',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
