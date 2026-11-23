import type { ParsedMessage, CommandContext } from '../../core/types.js'

/**
 * !define <word> — English dictionary lookup.
 * Free dictionaryapi.dev, no key, no new dependency.
 */

interface DictionaryEntry {
  word?: string
  phonetic?: string
  meanings?: {
    partOfSpeech?: string
    definitions?: { definition?: string; example?: string }[]
  }[]
}

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  const word = (args[0] || '').trim().toLowerCase()
  if (!word) return m.reply('Give me a word to define.\n\nExample: *!define serendipity*')
  if (!/^[a-z-]+$/.test(word)) return m.reply('Give me a single English word (letters only).')

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(15000)
    })
    if (res.status === 404) return m.reply(`No definition found for "${word}". Check the spelling.`)
    if (!res.ok) throw new Error(`dictionary HTTP ${res.status}`)
    const data = (await res.json()) as DictionaryEntry[]
    const entry = data?.[0]
    if (!entry?.meanings?.length) return m.reply(`No definition found for "${word}".`)

    let text = `*📖 DEFINE — ${entry.word ?? word}*`
    if (entry.phonetic) text += `\n/${entry.phonetic}/`
    let shown = 0
    for (const meaning of entry.meanings) {
      for (const def of meaning.definitions ?? []) {
        if (shown >= 3) break
        text += `\n\n*${meaning.partOfSpeech ?? 'word'}:* ${def.definition ?? ''}`
        if (def.example) text += `\n_"${def.example}"_`
        shown++
      }
      if (shown >= 3) break
    }
    return m.reply(text)
  } catch (error) {
    console.error('Error in define command:', error)
    return m.reply('Dictionary service is not reachable right now. Try again in a bit.')
  }
}

export default {
  pattern: /^(define|meaning|dict)$/i,
  handler,
  help: 'Look up an English word (!define serendipity)',
  usage: '!define <word>',
  example: '!define serendipity',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
