// src/commands/media/image.ts — resend a quoted/sent image at full size
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { sock }: CommandContext) => {
  try {
    let mediaMsg: { type: string; download?: () => Promise<{ buffer?: Buffer } | null> } | undefined

    if (m.type === 'imageMessage') {
      mediaMsg = m
    } else if (m.quoted && m.quoted.type === 'imageMessage') {
      mediaMsg = m.quoted
    } else {
      return m.reply('🖼️ Reply to an image with *!image* (or send an image with caption *!image*) and I\'ll send it back at full size, no compression.')
    }

    await m.reply(global.mess.wait)

    const media = await mediaMsg.download?.()
    const buffer = (media as any)?.buffer as Buffer | undefined
    if (!buffer || !buffer.length) {
      return m.reply('❌ Could not download that image. Try again.')
    }

    // Send as a document so WhatsApp does not recompress it — true full size
    await sock.sendMessage(m.chat, {
      document: buffer,
      mimetype: 'image/jpeg',
      fileName: `saadbot-full-${Date.now()}.jpg`,
      caption: '🖼️ Full-size image (uncompressed)'
    }, { quoted: m.message })
  } catch (error) {
    console.error('image error:', error)
    m.reply('❌ Failed to process that image.')
  }
}

export default {
  pattern: /^(image|fullimage|hdimage)$/i,
  handler,
  help: 'Resend a quoted image at full size (no compression)',
  usage: '!image (reply to an image)',
  example: '!image',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
