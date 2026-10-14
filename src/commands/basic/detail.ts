// src/commands/basic/detail.ts
// !detail <topic> — search Wikipedia for brand/history/topic information.
import axios from 'axios'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const SUMMARY_URL = (title: string) =>
  `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
const SEARCH_URL = (q: string) =>
  `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`

const MAX_LEN = 1500

interface WikiSummary {
  title?: string
  description?: string
  extract?: string
  content_urls?: { desktop?: { page?: string } }
  type?: string
}

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  const prefix = global.prefix || '!'
  const query = args.join(' ').trim()

  if (!query) {
    m.reply(
      `Give me a topic to look up, Sir.\nUsage: *${prefix}detail <brand / topic>*\nExample: *${prefix}detail Apple*\nExample: *${prefix}detail Mughal Empire*`
    )
    return
  }

  try {
    let data: WikiSummary | null = null

    // 1. Try the exact title first
    try {
      const res = await axios.get<WikiSummary>(SUMMARY_URL(query), {
        timeout: 15000,
        headers: { 'User-Agent': 'SaadBot/2.0 (WhatsApp info command)' }
      })
      if (res.data && res.data.type !== 'disambiguation') data = res.data
    } catch {
      // fall through to search
    }

    // 2. Fall back to Wikipedia search for the best-matching page
    if (!data) {
      const search = await axios.get(SEARCH_URL(query), {
        timeout: 15000,
        headers: { 'User-Agent': 'SaadBot/2.0 (WhatsApp info command)' }
      })
      const hit = search.data?.query?.search?.[0]
      if (!hit?.title) {
        m.reply(`No page found for *${query}* on Wikipedia. Try different wording, or use *${prefix}ai* to ask me instead.`)
        return
      }
      try {
        const res = await axios.get<WikiSummary>(SUMMARY_URL(hit.title), {
          timeout: 15000,
          headers: { 'User-Agent': 'SaadBot/2.0 (WhatsApp info command)' }
        })
        data = res.data
      } catch {
        m.reply(`Found *${hit.title}* but could not load its details right now. Try again shortly.`)
        return
      }
    }

    const title = data.title || query
    const desc = data.description ? `_${data.description}_\n\n` : ''
    let extract = (data.extract || '').trim()
    if (extract.length > MAX_LEN) {
      extract = extract.slice(0, MAX_LEN).replace(/\s+\S*$/, '') + '…'
    }
    const link = data.content_urls?.desktop?.page
      ? `\n\nRead more: ${data.content_urls.desktop.page}`
      : ''

    m.reply(`*${title}*\n${desc}${extract}${link}`)
  } catch (error) {
    console.error('Error in detail command:', error)
    m.reply(
      `Could not look up *${query}* right now — the search service is unreachable. Try again later, or use *${prefix}ai* to ask me directly.`
    )
  }
}

export default {
  pattern: /^(detail|details|brand|history|lookup)$/i,
  handler,
  help: 'Search Wikipedia for details about a brand, company, or topic',
  usage: '!detail <topic>',
  example: '!detail Apple',
  tags: ['basic'],
  group: false,
  admin: false,
  owner: false
}
