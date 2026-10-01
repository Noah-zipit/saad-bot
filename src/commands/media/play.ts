// src/commands/media/play.ts — YouTube downloader via David Cyril API
import axios from 'axios'
import { isValidURL } from '../../core/utils.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import type { WAMessage } from '@whiskeysockets/baileys'

const API = 'https://apis.davidcyriltech.my.id/download'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

function extractYouTubeID(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  const match = url.match(regex)
  return match ? match[1] : null
}

// Resolve a name to a YouTube video URL by scraping search results
async function searchYouTube(query: string): Promise<string | null> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
  const res = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 20000 })
  const match = String(res.data).match(/"videoId":"([a-zA-Z0-9_-]{11})"/)
  return match ? `https://www.youtube.com/watch?v=${match[1]}` : null
}

interface DlResult {
  title: string
  thumbnail?: string
  download_url: string
}

async function fetchDownload(videoUrl: string, kind: 'video' | 'audio'): Promise<DlResult | null> {
  const endpoint = kind === 'video' ? `${API}/ytmp4` : `${API}/ytmp3`
  const res = await axios.get(endpoint, {
    params: { url: videoUrl },
    headers: { 'User-Agent': UA },
    timeout: 60000
  })
  const r = res.data?.result
  if (res.data?.success && r?.download_url) {
    return { title: r.title || 'Unknown', thumbnail: r.thumbnail, download_url: r.download_url }
  }
  return null
}

const handler = async (m: ParsedMessage, { sock, args }: CommandContext) => {
  if (!args[0]) {
    return m.reply('Usage: *!play <song/video name or YouTube URL>*\nAdd *video* or *audio* to skip the question.\nExample: *!play despacito audio*')
  }

  // Pull out an inline format keyword if present
  let format: 'video' | 'audio' | null = null
  const queryParts: string[] = []
  for (const a of args) {
    const t = a.toLowerCase()
    if (['video', 'mp4', '2'].includes(t)) format = 'video'
    else if (['audio', 'mp3', '1'].includes(t)) format = 'audio'
    else queryParts.push(a)
  }
  const query = queryParts.join(' ').trim()
  if (!query) return m.reply('Give me a song/video name or YouTube URL.')

  try {
    m.react('🔍')
    await m.reply('🔍 *Searching...*')

    // Resolve to a YouTube URL (direct link or name search)
    let videoUrl: string | null = null
    if (isValidURL(query) && extractYouTubeID(query)) {
      videoUrl = query
    } else if (isValidURL(query)) {
      return m.reply('❌ That URL is not a valid YouTube link.')
    } else {
      try {
        videoUrl = await searchYouTube(query)
      } catch (e) {
        console.error('play search error:', e)
      }
      if (!videoUrl) return m.reply('❌ Could not find anything for that name. Try a different search or paste a YouTube link.')
    }

    // If no format chosen yet, fetch metadata and ask video or audio
    let meta: DlResult | null = null
    if (!format) {
      meta = await fetchDownload(videoUrl, 'audio').catch(() => null)
      if (!meta) return m.reply('❌ Could not fetch that video. Try again later.')

      const askMsg = `🎵 *${meta.title}*\n\nDownload as *video* or *audio*?\n_Reply with "video" or "audio" (60s)_`
      if (meta.thumbnail) {
        await sock.sendMessage(m.chat, { image: { url: meta.thumbnail }, caption: askMsg }, { quoted: m.message })
      } else {
        await m.reply(askMsg)
      }

      const choice = await new Promise<'video' | 'audio' | null>((resolve) => {
        const listener = async (upsert: { messages: WAMessage[] }) => {
          for (const message of upsert.messages) {
            if (message.key.remoteJid !== m.chat || message.key.fromMe !== false) continue
            const text = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim().toLowerCase()
            const fromParticipant = (message.key.participant || (message as any).participant) as string | undefined
            if (fromParticipant !== undefined && fromParticipant !== m.sender) continue
            if (['video', 'mp4', '2'].includes(text)) { sock.ev.off('messages.upsert', listener); resolve('video'); return }
            if (['audio', 'mp3', '1'].includes(text)) { sock.ev.off('messages.upsert', listener); resolve('audio'); return }
          }
        }
        sock.ev.on('messages.upsert', listener)
        setTimeout(() => { sock.ev.off('messages.upsert', listener); resolve(null) }, 60000)
      })

      if (!choice) return m.reply('⏱️ Time is up. Run *!play* again when you decide.')
      format = choice
    }

    await m.reply(global.mess.wait)
    m.react(format === 'video' ? '📽️' : '🎵')

    const dl = meta && format === 'audio' ? meta : await fetchDownload(videoUrl, format)
    if (!dl) return m.reply('❌ Download failed. The API may be down — try again later.')

    if (format === 'video') {
      await sock.sendMessage(m.chat, {
        video: { url: dl.download_url },
        caption: `🎬 *${dl.title}*`,
        mimetype: 'video/mp4'
      }, { quoted: m.message })
    } else {
      await sock.sendMessage(m.chat, {
        audio: { url: dl.download_url },
        mimetype: 'audio/mp4',
        fileName: `${dl.title.replace(/[\\/:*?"<>|]/g, '')}.mp3`
      }, { quoted: m.message })
    }
  } catch (error) {
    console.error('play error:', error)
    m.reply('❌ Something went wrong while processing your request.')
  }
}

export default {
  pattern: /^(play|song|music|video|ytdl|yt|mp3|mp4)$/i,
  handler,
  help: 'Download audio/video from YouTube (URL or name)',
  usage: '!play <name or URL> [video|audio]',
  example: '!play despacito audio',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
