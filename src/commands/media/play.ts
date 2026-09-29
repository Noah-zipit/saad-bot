// src/commands/media/play.ts
import { formatSize, isValidURL } from '../../core/utils.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import type { WAMessage } from '@whiskeysockets/baileys'
import axios from 'axios'

// Function to extract YouTube ID from URL
function extractYouTubeID(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  const match = url.match(regex)
  return match ? match[1] : null
}

const handler = async (m: ParsedMessage, { sock, args }: CommandContext) => {
  if (!args[0]) {
    return m.reply('Provide a song or video name to search for!')
  }

  const query = args.join(' ')

  try {
    // React to message
    m.react('🔍')

    // Inform user of progress
    const waitMsg = await m.reply('*🍁 Saad Bot is searching the heavenly archives...*')

    // Determine if it's a URL or a search term
    const isUrl = isValidURL(args[0])
    let videoId: string | null = isUrl ? extractYouTubeID(args[0]) : null

    // If not a URL, search for it
    if (!videoId) {
      try {
        // Make a search request to YouTube
        const searchUrl = `https://apis-keith.vercel.app/youtube/search?q=${encodeURIComponent(query)}`
        const searchResponse = await axios.get(searchUrl)

        if (!searchResponse.data?.status || !searchResponse.data?.result?.length) {
          return m.reply('❌ Saad Bot could not find any results for your query. Perhaps you misspoke?')
        }

        // Get the first result
        const firstResult = searchResponse.data.result[0]
        videoId = firstResult.videoId

      } catch (error) {
        console.error('Search error:', error)
        return m.reply('❌ Saad Bot encountered a error while searching. Try again later.')
      }
    }

    if (!videoId) {
      return m.reply('❌ Saad Bot could not extract a valid video ID. Ensure your query or URL is correct.')
    }

    // Get video details
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
    let videoDetails: any

    try {
      const detailsUrl = `https://apis-keith.vercel.app/youtube/details?url=${encodeURIComponent(videoUrl)}`
      const detailsResponse = await axios.get(detailsUrl)

      if (!detailsResponse.data?.status) {
        throw new Error('Failed to get video details')
      }

      videoDetails = detailsResponse.data.result
    } catch (error) {
      console.error('Details error:', error)
      return m.reply('❌ Saad Bot could not retrieve details for this video. The heavenly algorithm is obscured.')
    }

    // Format video info message
    const infoMessage = `
*༺ HEAVENLY ARCHIVE FOUND ༻*

🎵 *Title:* ${videoDetails.title || "Unknown"}
⏳ *Duration:* ${videoDetails.timestamp || videoDetails.duration || "Unknown"}
👀 *Views:* ${videoDetails.views || "Unknown"}
🌏 *Published:* ${videoDetails.ago || "Unknown"}
👤 *Channel:* ${videoDetails.author?.name || "Unknown"}

*Saad Bot can retrieve this in two forms:*
*1.* 🎵 *Audio* - Download as audio
*2.* 📽️ *Visual Command* - For observational training

_Reply with "1" or "2" to make your choice, user._
`

    // Send video details with thumbnail
    await sock.sendMessage(m.chat, {
      image: { url: videoDetails.thumbnail || videoDetails.image },
      caption: infoMessage
    }, { quoted: m.message })

    // Set up response collector for the user's choice
    const collector = await new Promise<{ choice: string; message: WAMessage } | null>((resolve) => {
      const listener = async (upsert: { messages: WAMessage[] }) => {
        for (const message of upsert.messages) {
          if (message.key.remoteJid !== m.chat || message.key.fromMe !== false) continue

          // Get the message content
          const responseText = message.message?.conversation ||
                              message.message?.extendedTextMessage?.text

          if (responseText !== '1' && responseText !== '2') continue

          // Check if it's from the same user
          const fromParticipant = (message.key.participant || (message as any).participant) as string | undefined
          if (fromParticipant !== undefined && fromParticipant !== m.sender) continue

          // Remove the listener to prevent duplicate responses
          sock.ev.off('messages.upsert', listener)
          resolve({ choice: responseText, message })
          return
        }
      }

      // Add the listener
      sock.ev.on('messages.upsert', listener)

      // Set a timeout to remove the listener
      setTimeout(() => {
        sock.ev.off('messages.upsert', listener)
        resolve(null)
      }, 60000) // 1 minute timeout
    })

    // If no response, return
    if (!collector) {
      return m.reply('⏱️ Time has elapsed. Saad Bot will not wait forever for indecisive users.')
    }

    // Get the user's choice
    const choice = collector.choice
    const responseMsg = collector.message

    // React to user's choice
    await sock.sendMessage(m.chat, {
      react: {
        text: choice === '1' ? '🎵' : '📽️',
        key: responseMsg.key
      }
    })

    // Send processing message
    const processingMsg = await m.reply(global.mess.wait)

    // Process based on user's choice
    if (choice === '1') {
      // Audio download
      try {
        // Try primary API
        const api1 = `https://apis-keith.vercel.app/download/dlmp3?url=${encodeURIComponent(videoUrl)}`
        const api2 = `https://apis.davidcyriltech.my.id/download/ytmp3?url=${encodeURIComponent(videoUrl)}`

        let downloadUrl: string | undefined

        try {
          const res1 = await axios.get(api1)
          if (res1.data?.status && res1.data?.result?.downloadUrl) {
            downloadUrl = res1.data.result.downloadUrl
          } else {
            throw new Error("Primary API failed")
          }
        } catch (error) {
          console.log("Trying backup API for audio...")
          const res2 = await axios.get(api2)
          if (res2.data?.success && res2.data?.result?.download_url) {
            downloadUrl = res2.data.result.download_url
          } else {
            throw new Error("Both APIs failed")
          }
        }

        // Send success message
        await sock.sendMessage(m.chat, {
          text: '✅ *Found it! Sending shortly...*',
          ...(processingMsg?.key ? { edit: processingMsg.key } : {})
        })

        if (!downloadUrl) {
          return m.reply('❌ Saad Bot could not get a download link for this audio.')
        }

        // Send audio
        await sock.sendMessage(m.chat, {
          audio: { url: downloadUrl },
          mimetype: 'audio/mp4',
          fileName: `${videoDetails.title}.mp3`
        }, { quoted: m.message })


      } catch (error) {
        console.error('Audio download error:', error)
        m.reply('❌ Saad Bot encountered a error while retrieving the audio. The celestial network appears disrupted.')
      }

    } else if (choice === '2') {
      // Video download
      try {
        // Try primary API
        const api1 = `https://apis-keith.vercel.app/download/dlmp4?url=${encodeURIComponent(videoUrl)}`
        const api2 = `https://apis.davidcyriltech.my.id/download/ytmp4?url=${encodeURIComponent(videoUrl)}`

        let downloadUrl: string | undefined

        try {
          const res1 = await axios.get(api1)
          if (res1.data?.status && res1.data?.result?.downloadUrl) {
            downloadUrl = res1.data.result.downloadUrl
          } else {
            throw new Error("Primary API failed")
          }
        } catch (error) {
          console.log("Trying backup API for video...")
          const res2 = await axios.get(api2)
          if (res2.data?.success && res2.data?.result?.download_url) {
            downloadUrl = res2.data.result.download_url
          } else {
            throw new Error("Both APIs failed")
          }
        }

        // Send success message
        await sock.sendMessage(m.chat, {
          text: '✅ *Visual command retrieved! Saad Bot will send it shortly...*',
          ...(processingMsg?.key ? { edit: processingMsg.key } : {})
        })

        if (!downloadUrl) {
          return m.reply('❌ Saad Bot could not get a download link for this video.')
        }

        // Send video
        await sock.sendMessage(m.chat, {
          video: { url: downloadUrl },
          caption: `*${videoDetails.title}*\n\n`,
          mimetype: 'video/mp4'
        }, { quoted: m.message })


      } catch (error) {
        console.error('Video download error:', error)
        m.reply('❌ Saad Bot encountered a error while retrieving the video. The celestial network appears disrupted.')
      }
    }

  } catch (error) {
    console.error('Error in play command:', error)
    m.reply('Saad Bot encountered a error while executing this command. Try again later.')
  }
}

export default {
  pattern: /^(play|song|music|video|ytdl|yt|mp3|mp4)$/i,
  handler,
  help: 'Download audio or video from YouTube',
  usage: '!play [song/video name or YouTube URL]',
  example: '!play despacito',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
