// src/commands/media/play.ts — Song downloader via local JioSaavn API (audio only)
// Fix: after search, shows numbered matches and lets the user pick the exact
// song with !play <number> instead of blindly taking the top result.
import axios from 'axios'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const API = process.env.JIOSAAVN_API || 'http://127.0.0.1:3100'
const PICK_TTL_MS = 5 * 60 * 1000

interface SaavnSong {
  id: string
  name: string
  duration?: number
  artists?: { primary?: { name: string }[] }
  album?: { name: string }
  image?: { quality: string; url: string }[]
  downloadUrl?: { quality: string; url: string }[]
}

/** chat -> { results, expiresAt } for the last !play search */
const pendingPicks = new Map<string, { results: SaavnSong[]; expiresAt: number }>()

async function searchSongs(query: string): Promise<SaavnSong[]> {
  const res = await axios.get(`${API}/api/search/songs`, {
    params: { query, limit: 5 },
    timeout: 20000
  })
  const results = res.data?.data?.results
  return Array.isArray(results) ? results : []
}

async function getSongDetails(id: string): Promise<SaavnSong | null> {
  const res = await axios.get(`${API}/api/songs/${id}`, { timeout: 20000 })
  const data = res.data?.data
  const song = Array.isArray(data) ? data[0] : data
  return song || null
}

function bestDownloadUrl(song: SaavnSong): string | null {
  const urls = song.downloadUrl
  if (!Array.isArray(urls) || !urls.length) return null
  const sorted = [...urls].sort((a, b) => parseInt(b.quality) - parseInt(a.quality))
  return sorted[0]?.url || null
}

function songTitle(song: SaavnSong): string {
  const artist = song.artists?.primary?.map(a => a.name).join(', ') || ''
  return [song.name, artist].filter(Boolean).join(' — ')
}

async function sendSong(m: ParsedMessage, { sock }: CommandContext, song: SaavnSong) {
  const details = await getSongDetails(song.id).catch(() => null)
  const full = details || song
  const url = bestDownloadUrl(full)
  if (!url) return m.reply('❌ Found the song but no download link is available.')

  const title = songTitle(full)
  const thumb = full.image?.length ? full.image[full.image.length - 1].url : undefined

  m.react('🎵')
  await m.reply(`🎵 *${title}*\n_Sending audio..._`)
  if (thumb) {
    await sock.sendMessage(m.chat, { image: { url: thumb }, caption: `🎵 *${title}*` }, { quoted: m.message }).catch(() => {})
  }

  await sock.sendMessage(m.chat, {
    audio: { url },
    mimetype: 'audio/mp4',
    fileName: `${title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80)}.m4a`
  }, { quoted: m.message })
}

const handler = async (m: ParsedMessage, ctx: CommandContext) => {
  const query = ctx.args.join(' ').trim()
  if (!query) {
    return m.reply('Usage: *!play <song name>*\nExample: *!play despacito*')
  }

  // User is picking one of the listed matches: !play <number>
  if (/^\d+$/.test(ctx.args[0]) && ctx.args.length === 1) {
    const pending = pendingPicks.get(m.chat)
    if (!pending || Date.now() > pending.expiresAt) {
      pendingPicks.delete(m.chat)
      return m.reply('⚠️ No recent search to pick from. Search first: *!play <song name>*')
    }
    const idx = parseInt(ctx.args[0], 10) - 1
    if (idx < 0 || idx >= pending.results.length) {
      return m.reply(`⚠️ Pick a number from 1 to ${pending.results.length}.`)
    }
    pendingPicks.delete(m.chat)
    return sendSong(m, ctx, pending.results[idx]).catch(() => m.reply('❌ Something went wrong while processing your request.'))
  }

  try {
    m.react('🔍')
    await m.reply('🔍 *Searching...*')

    const results = await searchSongs(query).catch(() => null)
    if (!results || !results.length) {
      return m.reply('❌ Could not find that song. Try a different name.')
    }

    if (results.length === 1) {
      return sendSong(m, ctx, results[0]).catch(() => m.reply('❌ Something went wrong while processing your request.'))
    }

    pendingPicks.set(m.chat, { results, expiresAt: Date.now() + PICK_TTL_MS })

    const list = results
      .map((s, i) => `*${i + 1}.* ${songTitle(s)}`)
      .join('\n')
    await m.reply(`🔎 *Pick the exact song:*\n\n${list}\n\nReply with *!play <number>* (valid for 5 min)`)
  } catch (error) {
    console.error('play error:', error)
    m.reply('❌ Something went wrong while processing your request.')
  }
}

export default {
  pattern: /^(play|song|music|mp3)$/i,
  handler,
  help: 'Search and download a song as audio (JioSaavn)',
  usage: '!play <song name>',
  example: '!play despacito',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
