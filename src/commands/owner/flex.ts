// src/commands/owner/flex.ts — owner-only flex card. Drops a sick "owner aura"
// image in the chat so everyone knows who built the machine.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
// src/commands/owner -> ../../scripts/flex-card.py
const GEN = path.join(__dirname, '../../scripts/flex-card.py')

const handler = async (m: ParsedMessage, { sock }: CommandContext) => {
  const out = path.join('/tmp', `flex-${Date.now()}.png`)
  try {
    await m.reply('⚡ _Summoning the aura..._')
    await execFileAsync('python3', [GEN, out], { timeout: 30000 })
    const buf = fs.readFileSync(out)
    await sock.sendMessage(
      m.chat,
      {
        image: buf,
        mimetype: 'image/png',
        caption: '👑 *ASHAR* — the owner has entered the chat.'
      },
      { quoted: m.message }
    )
  } catch (e) {
    console.error('flex error:', e)
    m.reply('❌ Aura failed to materialize. Try again.')
  } finally {
    try {
      fs.unlinkSync(out)
    } catch {
      /* already gone */
    }
  }
}

export default {
  pattern: /^(flex|aura|owner)$/i,
  handler,
  help: 'Drop the owner flex card (owner only)',
  usage: '!flex',
  example: '!flex',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
