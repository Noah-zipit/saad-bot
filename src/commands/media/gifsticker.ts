import { Sticker } from 'wa-sticker-formatter'
import { fileTypeFromBuffer } from 'file-type'
import type { ParsedMessage, CommandContext, MediaDownloadResult } from '../../core/types.js'
import { getStickerDefaults, parseNameArgs, rawArgsText } from '../../lib/stickerNames.js'
import { makeAnimatedSticker, addStickerMetadata, validateAnimatedSticker, sourceToGifVideo } from '../../lib/animatedSticker.js'

type MediaMsg = { type: string; download?: () => Promise<MediaDownloadResult | null> }

function findMedia(m: ParsedMessage): MediaMsg | undefined {
  if (m.type === 'imageMessage' || m.type === 'videoMessage') return m
  if (m.quoted && (m.quoted.type === 'imageMessage' || m.quoted.type === 'videoMessage')) return m.quoted
  return undefined
}

/**
 * Turn a GIF (or short video) into a crisp animated sticker — no blur.
 *
 * Usage: reply to a GIF with !gif, or send a GIF with caption !gif
 * Naming: !gif My Pack | Ashar   (one-off override)
 * Or save names once with !setname and every sticker carries them.
 */
const handler = async (m: ParsedMessage, { sock, db }: CommandContext) => {
  try {
    const mediaMsg = findMedia(m)
    if (!mediaMsg) {
      return m.reply(
        'Reply to a GIF (or a short video) with *!gif* to turn it into an animated sticker.\n' +
        'Tip: send the GIF with the caption *!gif* instead.'
      )
    }

    await m.reply(global.mess.wait)

    const media = await mediaMsg.download?.()
    if (!media) {
      return m.reply('Failed to download that media. Try again with a different GIF.')
    }

    // Confirm it is actually something animated
    let animated = mediaMsg.type === 'videoMessage'
    try {
      const ft = await fileTypeFromBuffer(media.buffer)
      if (ft && (ft.mime === 'image/gif' || ft.mime === 'image/webp' || ft.mime.startsWith('video'))) {
        animated = true
      }
    } catch {
      // fall back to the message type
    }

    // Resolve names: inline override > saved defaults > built-in default
    const dataDir = (db as unknown as { dataDir?: string }).dataDir || process.env.DATA_DIR || 'data'
    const saved = getStickerDefaults(dataDir, m.sender)
    const inline = parseNameArgs(rawArgsText(m.body, m.prefix))
    const pack = (inline.pack || saved.pack).slice(0, 60)
    const author = (inline.author || saved.author).slice(0, 60)

    // Purpose-built animated encoder: keeps motion, stays under WhatsApp's
    // ~500KB animated-sticker limit, never upscales small GIFs (no blur).
    const ext = mediaMsg.type === 'videoMessage' ? '.mp4' : '.gif'
    let stickerBuffer: Buffer
    if (animated) {
      const raw = await makeAnimatedSticker(media.buffer, ext)
      // Stamp the pack name back in — the ffmpeg encoder never wrote EXIF,
      // which is why GIF stickers showed no name underneath.
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

    // Safety net (2026-10-16): never hand the phone a sticker it cannot
    // display. If the encoded sticker fails structural validation, fall
    // back to sending the source as a normal looping GIF — visible always
    // beats an invisible sticker.
    if (animated) {
      const check = validateAnimatedSticker(stickerBuffer)
      if (!check.ok || stickerBuffer.length > 512 * 1024) {
        console.warn(`[gif] sticker failed validation (${check.reason || 'oversize'}), falling back to gif video`)
        try {
          const gifVideo = await sourceToGifVideo(media.buffer, ext)
          await sock.sendMessage(m.chat, { video: gifVideo, gifPlayback: true }, { quoted: m.message })
          await m.reply('That one would not display as a sticker, so I sent it as a normal GIF instead.')
        } catch {
          await m.reply('Failed to turn that into a sticker. Make sure it is a GIF under ~10MB and try again.')
        }
        return
      }
    }

    await sock.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m.message })

    if (stickerBuffer.length > 490 * 1024) {      await m.reply(
        'That GIF is very long or very busy — even the smallest clean encode is over WhatsApp\'s animated-sticker size, so it may arrive as a static image. Try a shorter or calmer clip and it should animate.'
      )
    } else if (!animated) {
      await m.reply('That did not look animated, so it went out as a normal sticker. Reply to a real GIF for motion.')
    }
  } catch (error) {
    console.error('Error creating gif sticker:', error)
    m.reply('Failed to turn that into a sticker. Make sure it is a GIF under ~10MB and try again.')
  }
}

export default {
  pattern: /^(gif|gifsticker|gifs|animsticker)$/i,
  handler,
  help: 'Turn a GIF/short video into a crisp animated sticker (!gif)',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
