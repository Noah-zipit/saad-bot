// src/commands/media/smp3.ts — Spotify link -> MP3 audio via JioSaavn match.
// Takes an open.spotify.com track link, resolves title + artist from the
// track page's og meta tags (no Spotify login needed), finds the matching
// track on JioSaavn (the bot's existing audio source), and sends it as audio.
import axios from 'axios'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const API = process.env.JIOSAAVN_API || 'http://127.0.0.1:3100'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

interface SaavnSong {
  id: string
  name: string
  duration?: number
  artists?: { primary?: { name: string }[] }
  album?: { name: string }
  image?: { quality: string; url: string }[]
  downloadUrl?: { quality: string; url: string }[]
}

interface SpotifyTrack {
  title: string
  artist: string
}

function extractTrackId(input: string): string | null {
  const link = input.trim()
  let m = link.match(/open\.spotify\.com\/(?:[a-z-]+\/)?track\/([A-Za-z0-9]{22})/i)
  if (m) return m[1]
  m = link.match(/spotify:track:([A-Za-z0-9]{22})/i)
  if (m) return m[1]
  return null
}

/** Resolve a Spotify track id to title + artist via the public track page og tags. */
async function resolveSpotifyTrack(id: string): Promise<SpotifyTrack | null> {
  try {
    const res = await axios.get(`https://open.spotify.com/track/${id}`, {
      headers: { 'User-Agent': UA },
      timeout: 20000
    })
    const html: string = res.data || ''
    const title = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)?.[1]
    const desc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)?.[1]
    if (title) {
      const artist = desc?.split('·')[0]?.trim() || ''
      return { title: title.trim(), artist }
    }
  } catch { /* fall through to oEmbed */ }

  // Fallback: oEmbed gives the title only (no artist)
  try {
    const res = await axios.get('https://open.spotify.com/oembed', {
      params: { url: `https://open.spotify.com/track/${id}` },
      timeout: 15000
    })
    if (res.data?.title) return { title: String(res.data.title), artist: '' }
  } catch { /* ignore */ }
  return null
}

async function searchSongs(query: string): Promise<SaavnSong[]> {
  const res = await axios.get(`${API}/api/search/songs`, {
    params: { query, limit: 10 },
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

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function matchScore(song: SaavnSong, track: SpotifyTrack): { title: number; artist: number } {
  const ct = norm(song.name || '')
  const t = norm(track.title)
  if (!t) return { title: 0, artist: 0 }
  let titleScore = 0
  if (ct === t) titleScore += 50
  else if (ct.includes(t) || t.includes(ct)) titleScore += 30
  else {
    const words = t.split(' ').filter(w => w.length > 2)
    const hit = words.filter(w => ct.includes(w)).length
    titleScore += words.length ? (hit / words.length) * 20 : 0
  }
  let artistScore = 0
  if (track.artist) {
    // artist signal: the artist fields OR the title ("... (By X)", "... (Originally Performed By X)")
    const ca = norm(song.artists?.primary?.map(a => a.name).join(' ') + ' ' + (song.name || ''))
    const parts = track.artist.split(/[,&]/).map(p => norm(p)).filter(p => p.length > 2)
    for (const p of parts) if (ca.includes(p)) artistScore += 15
  }
  return { title: titleScore, artist: artistScore }
}

const handler = async (m: ParsedMessage, { sock, args }: CommandContext) => {
  const input = args.join(' ').trim()
  const trackId = extractTrackId(input)
  if (!trackId) {
    return m.reply(
      'Usage: *!smp3 <spotify track link>*\n' +
      'Example: *!smp3 https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b*'
    )
  }

  try {
    m.react('🔍')
    await m.reply('🔍 *Reading Spotify link...*')

    const track = await resolveSpotifyTrack(trackId)
    if (!track) return m.reply('❌ Could not read that Spotify link. Check the link and try again.')

    const query = [track.title, track.artist].filter(Boolean).join(' ')
    const results = await searchSongs(query).catch(() => null)
    if (!results || !results.length) {
      return m.reply(`❌ Found "${track.title}" on Spotify but no matching audio source. Try *!play ${track.title}*.`)
    }

    let best: SaavnSong | null = null
    let bestScore = 0
    let bestArtistScore = 0
    for (const r of results) {
      const { title, artist } = matchScore(r, track)
      const s = title + artist
      if (s > bestScore) { bestScore = s; best = r; bestArtistScore = artist }
    }
    if (!best || bestScore < 20) {
      return m.reply(`❌ Found "${track.title}" on Spotify but couldn't match it to an audio source. Try *!play ${track.title}*.`)
    }
    // If Spotify named the artist but nothing we found carries their name,
    // the closest match is likely a cover/remix — say so instead of sending it.
    if (track.artist && bestArtistScore === 0) {
      return m.reply(
        `⚠️ Found "${track.title}" by ${track.artist} on Spotify, but my audio source only has covers/remixes of it.\n` +
        `Try *!play ${track.title}* to pick one yourself.`
      )
    }

    const details = await getSongDetails(best.id).catch(() => null)
    const song = details || best
    const url = bestDownloadUrl(song)
    if (!url) return m.reply('❌ Found the song but no download link is available.')

    const artist = song.artists?.primary?.map(a => a.name).join(', ') || ''
    const title = [song.name, artist].filter(Boolean).join(' — ')
    const thumb = song.image?.length ? song.image[song.image.length - 1].url : undefined

    m.react('🎵')
    await m.reply(`🎵 *${title}*\n_(from your Spotify link)_\nSending audio...`)
    if (thumb) {
      await sock.sendMessage(m.chat, { image: { url: thumb }, caption: `🎵 *${title}*` }, { quoted: m.message }).catch(() => {})
    }

    await sock.sendMessage(m.chat, {
      audio: { url },
      mimetype: 'audio/mp4',
      fileName: `${title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80)}.m4a`
    }, { quoted: m.message })
  } catch (error) {
    console.error('smp3 error:', error)
    m.reply('❌ Something went wrong while processing your request.')
  }
}

export default {
  pattern: /^(smp3|spmp3|spotmp3|spotifydl)$/i,
  handler,
  help: 'Download a Spotify track link as audio (matched via JioSaavn)',
  usage: '!smp3 <spotify track link>',
  example: '!smp3 https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
