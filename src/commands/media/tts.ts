// src/commands/media/tts.ts
// !tts <text> — generate a voice note from text using Fish Audio TTS
// with the owner's cloned voice (falls back to a default Fish voice).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const execFileAsync = promisify(execFile)

const FISH_TTS = '/home/hatch/workspace/custom-connectors/custom.legacy-fish-audio/bin/fish-tts'
// Owner's cloned voice ("T&A Demo Voice"). Overridable via FISH_VOICE_ID env.
const DEFAULT_VOICE_ID = '75e0b86e54f44df3b4b05d8f6adf2643'
const MAX_CHARS = 600

const handler = async (m: ParsedMessage, { sock }: CommandContext) => {
  const prefix = global.prefix || '!'
  const text = m.args.join(' ').trim()

  if (!text) {
    m.reply(
      `Give me something to say, Sir.\nUsage: *${prefix}tts <your text>*\nExample: *${prefix}tts hello everyone, welcome to the group*`
    )
    return
  }

  if (text.length > MAX_CHARS) {
    m.reply(`Too long for one voice note (max ${MAX_CHARS} characters). Split it into two messages.`)
    return
  }

  const voiceId = process.env.FISH_VOICE_ID || DEFAULT_VOICE_ID

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saadbot-tts-'))
  const mp3Path = path.join(dir, 'voice.mp3')
  const oggPath = path.join(dir, 'voice.ogg')

  try {
    await m.react('🎙️')
    await m.reply(`_Generating your voice note..._`)

    // 1. Fish Audio TTS -> mp3
    await execFileAsync('python3', [
      FISH_TTS,
      '--out', mp3Path,
      '--voice-id', voiceId,
      '--model', 's2.1-pro-free',
      '--text', text
    ], { timeout: 120000 })

    // 2. Convert mp3 -> ogg/opus (WhatsApp voice-note format)
    await execFileAsync('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', mp3Path,
      '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000',
      oggPath
    ], { timeout: 60000 })

    // 3. Send as voice note
    await sock.sendMessage(m.chat, {
      audio: fs.readFileSync(oggPath),
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true
    }, { quoted: m.message })

    console.log(`[tts] sent voice note to ${m.chat} (${text.length} chars)`)
  } catch (error) {
    console.error('Error in tts command:', error)
    m.reply('Could not generate the voice note right now. The speech service may be down — try again shortly.')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export default {
  pattern: /^(tts|speak|say|voice)$/i,
  handler,
  help: 'Generate a voice note from your text',
  usage: '!tts <text>',
  example: '!tts hello everyone',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
