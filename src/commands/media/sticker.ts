import { Sticker } from 'wa-sticker-formatter'
import { fileTypeFromBuffer } from 'file-type'
import type { ParsedMessage, CommandContext, MediaDownloadResult } from '../../core/types.js'
import { getStickerDefaults, parseNameArgs, rawArgsText } from '../../lib/stickerNames.js'
import { makeAnimatedSticker, addStickerMetadata } from '../../lib/animatedSticker.js'

type MediaMsg = { type: string; download?: () => Promise<MediaDownloadResult | null> }

function findMedia(m: ParsedMessage): MediaMsg | undefined {
  if (m.type === 'imageMessage' || m.type === 'videoMessage') return m
  if (m.quoted && (m.quoted.type === 'imageMessage' || m.quoted.type === 'videoMessage')) return m.quoted
  return undefined
}

/**
 * Convert image/video to sticker.
 *
 * Naming: !sticker My Pack | Ashar   (one-off override)
 * Or save names once with !setname and every sticker carries them.
 *
 * Animated media (GIFs/videos) is resized to a full 512x512 canvas at high
 * quality so it stays crisp instead of blurry.
 */
const handler = async (m: ParsedMessage, { sock, db }: CommandContext) => {
  try {
    const mediaMsg = findMedia(m)
    if (!mediaMsg) {
      return m.reply('Reply to an image or video to create a sticker, or send an image with caption *!sticker*')
    }

    // Show processing message
    await m.reply(global.mess.wait)

    // Download media
    const media = await mediaMsg.download?.()
    if (!media) {
      return m.reply('Failed to download media. Try again with a different image/video.')
    }

    // Animated detection: videos, GIFs and animated webp all keep their motion
    let isAnimated = mediaMsg.type === 'videoMessage'
    try {
      const ft = await fileTypeFromBuffer(media.buffer)
      if (ft && (ft.mime === 'image/gif' || ft.mime === 'image/webp' || ft.mime.startsWith('video'))) {
        isAnimated = true
      }
    } catch {
      // mime sniff failed — fall back to the message type
    }

    // Resolve names: inline override > saved defaults > built-in default
    const dataDir = (db as unknown as { dataDir?: string }).dataDir || process.env.DATA_DIR || 'data'
    const saved = getStickerDefaults(dataDir, m.sender)
    const inline = parseNameArgs(rawArgsText(m.body, m.prefix))
    const pack = (inline.pack || saved.pack).slice(0, 60)
    const author = (inline.author || saved.author).slice(0, 60)

    // Animated sources go through the purpose-built encoder: it keeps the
    // motion, stays under WhatsApp's ~500KB animated-sticker limit, and never
    // upscales small GIFs (upscaling was the blur). Static images keep the
    // wa-sticker-formatter path.
    let stickerBuffer: Buffer
    if (isAnimated) {
      const ext = mediaMsg.type === 'videoMessage' ? '.mp4' : '.gif'
      const raw = await makeAnimatedSticker(media.buffer, ext)
      // Stamp the pack name back in — the ffmpeg encoder never wrote EXIF,
      // which is why GIF stickers showed no name underneath.
      stickerBuffer = await addStickerMetadata(raw, { id: Date.now().toString(), pack, author })
    } else {
      const stickerOptions = {
        pack,
        author,
        type: 'default',
        categories: ['🌸', '⚔️'],
        id: Date.now().toString(),
        quality: 70
      }
      const sticker = new Sticker(media.buffer, stickerOptions as any)
      stickerBuffer = await sticker.toBuffer()
    }

    // Send sticker
    await sock.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m.message })


  } catch (error) {
    console.error('Error creating sticker:', error)
    m.reply('Failed to create sticker. A true martial artist would provide better materials.')
  }
}

export default {
  pattern: /^(s|sticker|stiker|seal)$/i,
  handler,
  help: 'Convert image/video to sticker (animated stays animated)',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
