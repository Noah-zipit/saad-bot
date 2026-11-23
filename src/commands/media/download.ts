import axios from 'axios'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

/**
 * !download — download a TikTok or Instagram video/photo into the chat.
 *
 *   !download <tiktok or instagram link>
 *
 * How it works: tries the public Cobalt API first (no key, handles both
 * platforms), and falls back to TikWM for TikTok. No media is saved on
 * disk — WhatsApp streams it straight from the source URL.
 *
 * Honest limits: Instagram sometimes refuses anonymous downloads
 * (login-only reels, private accounts, age-gated posts). When both
 * sources fail the command says so and suggests sending the file
 * directly instead of pretending it worked. This replaces the old
 * !instagram / !tiktok stubs, which only sent a mock "acknowledged"
 * message and never downloaded anything.
 */

interface MediaItem {
  url: string
  isVideo: boolean
}

function isVideoUrl(url: string): boolean {
  const clean = url.split('?')[0].toLowerCase()
  if (/\.(mp4|mov|webm|mkv)$/.test(clean)) return true
  if (/\.(jpg|jpeg|png|webp)$/.test(clean)) return false
  return true // Unknown extension — video is the common case for reels.
}

async function viaCobalt(link: string): Promise<MediaItem[]> {
  const res = await axios.post(
    'https://api.cobalt.tools/api/json',
    { url: link, videoQuality: '720', filenamePattern: 'basic' },
    { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, timeout: 30_000 }
  )
  const data = res.data as Record<string, any>
  if (data.status === 'error' || !data) throw new Error(data?.text || 'Cobalt rejected the link')
  if (data.status === 'picker' && Array.isArray(data.picker)) {
    return data.picker.slice(0, 3).map((item: any) => ({
      url: String(item.url),
      isVideo: isVideoUrl(String(item.url))
    })).filter((i: MediaItem) => !!i.url)
  }
  if (data.url) return [{ url: String(data.url), isVideo: isVideoUrl(String(data.url)) }]
  throw new Error('Cobalt returned no media')
}

async function viaTikwm(link: string): Promise<MediaItem[]> {
  const res = await axios.get('https://www.tikwm.com/api/', {
    params: { url: link },
    timeout: 30_000
  })
  const data = res.data?.data
  if (!data) throw new Error('TikWM returned nothing')
  if (data.play) return [{ url: String(data.play), isVideo: true }]
  if (Array.isArray(data.images) && data.images.length > 0) {
    return data.images.slice(0, 3).map((u: string) => ({ url: String(u), isVideo: false }))
  }
  throw new Error('TikWM found no playable media')
}

const handler = async (m: ParsedMessage, { sock, args }: CommandContext) => {
  const link = args[0]
  if (!link) {
    return m.reply(
      '*⬇️ DOWNLOAD*\n\n' +
      'Send a link with the command:\n*!download <tiktok or instagram link>*\n\n' +
      'Example: *!download https://www.tiktok.com/@user/video/123...*'
    )
  }
  const isTikTok = link.includes('tiktok.com') || link.includes('vt.tiktok.com')
  const isInstagram = link.includes('instagram.com') || link.includes('instagr.am')
  if (!isTikTok && !isInstagram) {
    return m.reply('That link is not TikTok or Instagram.\n\nUsage: *!download <tiktok or instagram link>*')
  }

  try {
    await m.reply(global.mess.wait)
    let items: MediaItem[] = []
    try {
      items = await viaCobalt(link)
    } catch (cobaltErr) {
      if (isTikTok) {
        items = await viaTikwm(link)
      } else {
        throw cobaltErr
      }
    }
    if (items.length === 0) throw new Error('No media found')

    for (const item of items) {
      if (item.isVideo) {
        await sock.sendMessage(m.chat, { video: { url: item.url }, caption: items.length > 1 ? undefined : 'Here you go 🎬' }, { quoted: m.message })
      } else {
        await sock.sendMessage(m.chat, { image: { url: item.url } }, { quoted: m.message })
      }
    }
  } catch (error) {
    console.error('Error in download command:', error)
    m.reply(
      'Could not download that link.\n\n' +
      (isInstagram
        ? 'Instagram blocks anonymous downloads for some posts (login-only reels, private or age-gated accounts). If this is your own reel, send the video file directly and the bot can handle it from there.'
        : 'The video may be private, removed, or region-locked. Check the link opens in your browser, then try again.')
    )
  }
}

export default {
  pattern: /^(download|dl)$/i,
  handler,
  help: 'Download a TikTok or Instagram video/photo (!download <link>)',
  usage: '!download <tiktok or instagram link>',
  example: '!download https://www.tiktok.com/@user/video/123...',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
