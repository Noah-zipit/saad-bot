// src/commands/media/imgsearch.ts — search the web for images by text and send them
import { execFile } from 'child_process'
import axios from 'axios'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const SEARCH_BIN = '/opt/hatch/bin/image-search'
const MAX_IMAGES = 3

interface SearchResult {
  media_url?: string
  thumbnail_cdn_url?: string
  page_url?: string
  title?: string
}

const runSearch = (query: string): Promise<SearchResult[]> =>
  new Promise((resolve) => {
    execFile(
      SEARCH_BIN,
      [query, '--max-results', String(MAX_IMAGES * 2)],
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
    return m.reply('🔎 What should I search for?\n\nUsage: *!img* <search text>\nExample: *!img cute cats*')
  }

  try {
    await m.reply(global.mess.wait)

    const results = await runSearch(query)
    if (!results.length) {
      return m.reply('❌ No images found for that search. Try different words.')
    }

    const candidates: { url: string; title: string; source: string }[] = []
    for (const r of results) {
      const urls = [r.media_url, r.thumbnail_cdn_url].filter(
        (u): u is string => !!u && /^https?:\/\//i.test(u)
      )
      if (urls.length && candidates.length < MAX_IMAGES) {
        candidates.push({ url: urls[0], title: r.title || query, source: r.page_url || '' })
      }
    }

    let sent = 0
    for (const c of candidates) {
      const buf = await fetchImage(c.url)
      if (!buf) continue
      const caption =
        `🔎 *${query}*\n` +
        (c.title ? `📝 ${c.title.slice(0, 100)}\n` : '') +
        (c.source ? `🔗 ${c.source.slice(0, 120)}` : '')
      await sock.sendMessage(
        m.chat,
        { image: buf, mimetype: 'image/jpeg', caption: caption.trim() },
        { quoted: m.message }
      )
      sent++
      if (sent >= MAX_IMAGES) break
    }

    if (!sent) {
      return m.reply('❌ Found results but could not download the images. Try again in a bit.')
    }
  } catch (error) {
    console.error('imgsearch error:', error)
    m.reply('❌ Image search failed. Try again in a bit.')
  }
}

export default {
  pattern: /^(img|imgsearch|imagesearch|searchimg|pic|pics)$/i,
  handler,
  help: 'Search the web for images by text and receive the pictures',
  usage: '!img <search text>',
  example: '!img sunset over mountains',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
