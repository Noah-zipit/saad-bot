import type { ParsedMessage, CommandContext } from '../../core/types.js'

/**
 * !qr <text> — turn text or a link into a QR code image.
 * Free api.qrserver.com image URL, no key, no new dependency.
 * The bot sends the QR as an image; nothing is stored anywhere.
 */

const handler = async (m: ParsedMessage, { sock, args }: CommandContext) => {
  const text = args.join(' ').trim()
  if (!text) {
    return m.reply('Give me text or a link to turn into a QR code.\n\nExample: *!qr https://example.com*')
  }
  if (text.length > 500) {
    return m.reply('That text is too long for a QR code (max 500 characters). Shorten it and try again.')
  }
  try {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=16&data=${encodeURIComponent(text)}`
    await sock.sendMessage(
      m.chat,
      { image: { url }, caption: `*🔳 QR CODE*\n\n${text.slice(0, 200)}` },
      { quoted: m.message }
    )
  } catch (error) {
    console.error('Error in qr command:', error)
    m.reply('Could not make that QR code. Try again in a bit.')
  }
}

export default {
  pattern: /^(qr|qrcode)$/i,
  handler,
  help: 'Make a QR code image from text or a link (!qr https://example.com)',
  usage: '!qr <text or link>',
  example: '!qr https://example.com',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
