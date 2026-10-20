// src/commands/media/logo.ts
// !logo [style] <text> — generate a logo image (PNG) from text.
// Styles: neon, gold, fire, ice, retro, gaming, script, bold.
// Without a style, picks a random one. "!logo styles" lists them.
// The style word is accepted as the FIRST or the LAST argument, and
// cool-font keys (luxury, bungee, pixel, future, army) are mapped to
// the logo style that uses that font — so a style word is never
// rendered as the logo text by accident.
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { LOGO_STYLES, renderLogoSvg, svgToPng, type LogoStyle } from '../../lib/logoFonts.js'

const MAX_CHARS = 30

// Cool-font keys that are not logo-style keys, mapped to the logo style
// that renders in that font. (neon, script, bold exist in both lists.)
const FONT_KEY_TO_STYLE: Record<string, string> = {
  bungee: 'fire', luxury: 'gold', future: 'ice', pixel: 'retro', army: 'gaming',
}

const resolveStyle = (word: string): LogoStyle | undefined => {
  const w = word.toLowerCase()
  const direct = LOGO_STYLES.find(s => s.key === w)
  if (direct) return direct
  const mapped = FONT_KEY_TO_STYLE[w]
  return mapped ? LOGO_STYLES.find(s => s.key === mapped) : undefined
}

const styleList = (): string =>
  LOGO_STYLES.map(s => `• *${s.key}* — ${s.name} (${s.font.label})`).join('\n')

const handler = async (m: ParsedMessage, { sock }: CommandContext) => {
  const prefix = global.prefix || '!'
  const raw = m.args.join(' ').trim()

  if (!raw) {
    m.reply(
      `Give me text for the logo, Sir.\n` +
      `Usage: *${prefix}logo <text>* or *${prefix}logo <style> <text>*\n` +
      `(the style can also go at the end, and font names like *luxury* or *pixel* work too)\n` +
      `Example: *${prefix}logo neon Saad* or *${prefix}logo Saad neon*\n\n*Styles:*\n${styleList()}`
    )
    return
  }

  if (/^styles?$/i.test(m.args[0])) {
    m.reply(`*Logo styles:*\n${styleList()}\n\nTry *${prefix}logo neon your name*`)
    return
  }

  let style = LOGO_STYLES[Math.floor(Math.random() * LOGO_STYLES.length)]
  let text = raw
  // Style word may lead ("!logo neon Saad") or trail ("!logo Saad neon").
  const leadStyle = resolveStyle(m.args[0])
  if (leadStyle) {
    if (m.args.length === 1) {
      m.reply(`Now give me the text, Sir.\nUsage: *${prefix}logo ${leadStyle.key} <text>* or *${prefix}logo <text> ${leadStyle.key}*`)
      return
    }
    style = leadStyle
    text = m.args.slice(1).join(' ').trim()
  } else if (m.args.length > 1) {
    const trailStyle = resolveStyle(m.args[m.args.length - 1])
    if (trailStyle) {
      style = trailStyle
      text = m.args.slice(0, -1).join(' ').trim()
    }
  }

  if (text.length > MAX_CHARS) {
    m.reply(`Keep it under ${MAX_CHARS} characters for a clean logo (yours was ${text.length}).`)
    return
  }

  await m.react('🎨')
  try {
    const png = await svgToPng(renderLogoSvg(style, text))
    await sock.sendMessage(m.chat, {
      image: png,
      mimetype: 'image/png',
      caption: `*${style.name}* logo — _${text}_\n\nTry another: *${prefix}logo <style> <text>*\nStyles: ${LOGO_STYLES.map(s => s.key).join(', ')}`,
    }, { quoted: m.message })
    console.log(`[logo] sent ${style.key} logo to ${m.chat} ("${text}")`)
  } catch (error) {
    console.error('Error in logo command:', error)
    m.reply('Could not render the logo right now. Try again in a moment.')
  }
}

export default {
  pattern: /^(logo|makelogo|logomaker)$/i,
  handler,
  help: 'Generate a logo image from your text',
  usage: '!logo [style] <text>',
  example: '!logo neon Saad',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
