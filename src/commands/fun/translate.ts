import type { ParsedMessage, CommandContext } from '../../core/types.js'

/**
 * !translate <lang> <text> — translate any text.
 * Free Google Translate web endpoint, no key, no new dependency.
 * Language can be a 2-letter code (ur, en, es...) or a name (urdu, english...).
 */

const LANGS: Record<string, string> = {
  english: 'en', urdu: 'ur', spanish: 'es', french: 'fr', german: 'de',
  arabic: 'ar', hindi: 'hi', turkish: 'tr', portuguese: 'pt', italian: 'it',
  russian: 'ru', japanese: 'ja', chinese: 'zh', korean: 'ko', dutch: 'nl',
  persian: 'fa', farsi: 'fa', bengali: 'bn', punjabi: 'pa', sindhi: 'sd',
  pashto: 'ps', romanurdu: 'ur'
}

const USAGE =
  '*!translate <language> <text>*\n\n' +
  'Example: *!translate urdu I love you*\n' +
  'Example: *!translate es good morning*\n\n' +
  'Use a language name or a 2-letter code (ur, en, es, fr, de, ar, hi, tr).'

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  if (args.length < 2) return m.reply(USAGE)
  const langRaw = args[0].toLowerCase()
  const target = LANGS[langRaw] ?? (/^[a-z]{2,3}$/.test(langRaw) ? langRaw : null)
  if (!target) return m.reply(`I do not know the language "${args[0]}".\n\n${USAGE}`)
  const text = args.slice(1).join(' ').slice(0, 1000)
  if (!text) return m.reply(USAGE)

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`translate HTTP ${res.status}`)
    const data = (await res.json()) as unknown
    const sentences = (data as any[])?.[0]
    if (!Array.isArray(sentences)) throw new Error('unexpected translate response')
    const translated = sentences.map((s: any[]) => s?.[0] ?? '').join('').trim()
    const detected = (data as any[])?.[2] as string | undefined
    if (!translated) return m.reply('Could not translate that. Try different wording.')
    return m.reply(`*🌐 TRANSLATE${detected ? ` (${detected} → ${target})` : ''}*\n\n${translated}`)
  } catch (error) {
    console.error('Error in translate command:', error)
    return m.reply('Translation service is not reachable right now. Try again in a bit.')
  }
}

export default {
  pattern: /^(translate|tr|tarjuma)$/i,
  handler,
  help: 'Translate text (!translate urdu I love you)',
  usage: '!translate <language> <text>',
  example: '!translate urdu I love you',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
