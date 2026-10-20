// src/commands/media/fonts.ts
// Cool-font name generator.
// !fonts               — list the 8 cool font styles
// !fonts <text>        — preview sheet: your name in every font (one image)
// !font <style> <text> — render your name in one chosen style (IMG format)
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { COOL_FONTS, renderFontSvg, renderFontSheetSvg, svgToPng } from '../../lib/logoFonts.js'

const MAX_CHARS = 30

const fontList = (): string =>
  COOL_FONTS.map(f => `• *${f.key}* — ${f.label} (${f.desc})`).join('\n')

const handler = async (m: ParsedMessage, { sock }: CommandContext) => {
  const prefix = global.prefix || '!'
  const cmd = (m.command || 'fonts').toLowerCase()
  const args = m.args

  // !fonts with no text → list styles
  if ((cmd === 'fonts' || cmd === 'coolfont' || cmd === 'coolfonts') && args.length === 0) {
    m.reply(
      `*Cool font styles:*\n${fontList()}\n\n` +
      `*${prefix}fonts your name* — preview your name in ALL styles (one image)\n` +
      `*${prefix}font <style> your name* — render in one style`
    )
    return
  }

  // !font <style> <text>
  if (cmd === 'font' || cmd === 'fontstyle') {
    if (args.length < 2) {
      m.reply(
        `Pick a style and give me text, Sir.\n` +
        `Usage: *${prefix}font <style> <text>*\n` +
        `Example: *${prefix}font neon Saad*\n\n*Styles:*\n${fontList()}`
      )
      return
    }
    const cf = COOL_FONTS.find(f => f.key === args[0].toLowerCase())
    if (!cf) {
      m.reply(`No style named "${args[0]}", Sir.\n\n*Styles:*\n${fontList()}`)
      return
    }
    const text = args.slice(1).join(' ').trim()
    if (text.length > MAX_CHARS) {
      m.reply(`Keep it under ${MAX_CHARS} characters (yours was ${text.length}).`)
      return
    }
    await m.react('✒️')
    try {
      const png = await svgToPng(renderFontSvg(cf, text))
      await sock.sendMessage(m.chat, {
        image: png,
        mimetype: 'image/png',
        caption: `*${cf.label}* — _${text}_`,
      }, { quoted: m.message })
      console.log(`[font] sent ${cf.key} render to ${m.chat} ("${text}")`)
    } catch (error) {
      console.error('Error in font command:', error)
      m.reply('Could not render that right now. Try again in a moment.')
    }
    return
  }

  // !fonts <text> → preview sheet of all styles
  const text = args.join(' ').trim()
  if (text.length > MAX_CHARS) {
    m.reply(`Keep it under ${MAX_CHARS} characters (yours was ${text.length}).`)
    return
  }
  await m.react('🔤')
  try {
    const png = await svgToPng(renderFontSheetSvg(text))
    await sock.sendMessage(m.chat, {
      image: png,
      mimetype: 'image/png',
      caption: `Your name in all 8 styles — _${text}_\n\nLike one? Use *${prefix}font <style> ${text}*\nStyles: ${COOL_FONTS.map(f => f.key).join(', ')}`,
    }, { quoted: m.message })
    console.log(`[fonts] sent preview sheet to ${m.chat} ("${text}")`)
  } catch (error) {
    console.error('Error in fonts command:', error)
    m.reply('Could not render the preview right now. Try again in a moment.')
  }
}

export default {
  pattern: /^(fonts?|coolfonts?|fontstyle)$/i,
  handler,
  help: 'Render your name in cool fonts',
  usage: '!fonts <text> | !font <style> <text>',
  example: '!fonts Saad',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
