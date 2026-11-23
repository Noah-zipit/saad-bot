// src/commands/media/pinterest.ts — search Pinterest for images by text and send them
// Same image-search backend as !img, but the query is biased to Pinterest
// and only images actually hosted on Pinterest (i.pinimg.com) are sent,
// so the results are genuinely Pinterest pictures, not random web images.
import { execFile } from 'child_process'
import axios from 'axios'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const SEARCH_BIN = '/opt/hatch/bin/image-search'
const MAX_IMAGES = 3

interface SearchResult {
  media_url?: string
  page_url?: string
  title?: string
}

const runSearch = (query: string): Promise<SearchResult[]> =>
  new Promise((resolve) => {
    execFile(
      SEARCH_BIN,
      [`pinterest ${query}`, '--max-results', String(MAX_IMAGES * 4)],
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([])
        try {
          const data = JSON.parse(String(stdout))
          resolve(Array.isArray(data?.results) ? data.results : [])
        } catch {
          resolve([])
        }
      }
    )
  })

// Pinterest serves the same image at several sizes: /474x/ is the preview,
// /originals/ is the full-resolution file. Prefer the original, fall back
// to the preview URL if it fails to download.
const upgradeToOriginal = (url: string): string =>
  url.replace(/^(https:\/\/i\.pinimg\.com\/)\d+x\//, '$1originals/')

const fetchImage = async (url: string): Promise<Buffer | null> => {
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 20000,
      maxContentLength: 15 * 1024 * 1024,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Accept: 'image/png,image/jpeg,image/gif,image/webp,image/*;q=0.5'
      }
    })
    const ct = String(res.headers?.['content-type'] || '')
    if (!/^image\//i.test(ct)) return null
    const buf = Buffer.from(res.data as ArrayBuffer)
    return buf.length ? buf : null
  } catch {
    return null
  }
}

const handler = async (m: ParsedMessage, { sock, args }: CommandContext) => {
  const query = (args || []).join(' ').trim()
  if (!query) {
    return m.reply(
      '📌 What should I find on Pinterest?\n\nUsage: *!pint* <search text>\nExample: *!pint weekend*'
    )
  }

  try {
    await m.reply(global.mess.wait)

    const results = await runSearch(query)
    // Only genuine Pinterest-hosted images count. If the Pinterest-biased
    // search came back empty, say so honestly instead of silently sending
    // unrelated web images under a Pinterest label.
    const pinUrls = results
      .map((r) => r.media_url)
      .filter((u): u is string => !!u && /^https:\/\/i\.pinimg\.com\//i.test(u))
    const unique = [...new Set(pinUrls)]

    if (!unique.length) {
      return m.reply('❌ No Pinterest images found for that search. Try different words, or use *!img* for a general web search.')
    }

    let sent = 0
    for (const url of unique) {
      if (sent >= MAX_IMAGES) break
      let buf = await fetchImage(upgradeToOriginal(url))
      if (!buf) buf = await fetchImage(url)
      if (!buf) continue
      await sock.sendMessage(
        m.chat,
        {
          image: buf,
          mimetype: 'image/jpeg',
          caption: `📌 *${query}* — from Pinterest`
        },
        { quoted: m.message }
      )
      sent++
    }

    if (!sent) {
      return m.reply('❌ Found Pinterest images but could not download them. Try again in a bit.')
    }
  } catch (error) {
    console.error('pinterest error:', error)
    m.reply('❌ Pinterest search failed. Try again in a bit.')
  }
}

export default {
  pattern: /^(pinterest|pin|pins|pint)$/i,
  handler,
  help: 'Search Pinterest for images by text and receive the pictures',
  usage: '!pint <search text>',
  example: '!pint weekend',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
