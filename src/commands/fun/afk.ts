import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { getAfk, setAfk, clearAfk, formatAfkSince } from '../../lib/afkStore.js'

/**
 * !afk [reason] — mark yourself away; the bot tells anyone who tags you,
 * and welcomes you back when you speak again (hook in messageHandler).
 *
 *   !afk eating dinner     — go AFK with a reason
 *   !afk                  — go AFK with no reason
 *   !afk off              — come back early
 *   !afk                  — (while AFK) shows your current AFK status
 * Sending any normal message also clears AFK automatically.
 */

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  try {
    const sub = (args[0] || '').toLowerCase()

    if (sub === 'off') {
      const was = await clearAfk(m.sender)
      return m.reply(was ? 'Welcome back! Your AFK is cleared.' : 'You were not AFK.')
    }

    const current = await getAfk(m.sender)
    if (args.length === 0) {
      if (current) {
        return m.reply(
          `💤 *You are AFK*${current.reason ? `\n${current.reason}` : ''}\n_Since ${formatAfkSince(current.since)}_\n\nSend any message to come back, or *!afk off*.`
        )
      }
      await setAfk(m.sender, '')
      return m.reply('💤 You are now AFK. Anyone who tags you will be told.\nSend any message to come back.')
    }

    await setAfk(m.sender, args.join(' '))
    return m.reply(`💤 You are now AFK: ${args.join(' ')}\nAnyone who tags you will be told. Send any message to come back.`)
  } catch (error) {
    console.error('Error in afk command:', error)
    m.reply('Something went wrong while setting AFK.')
  }
}

export default {
  pattern: /^(afk)$/i,
  handler,
  help: 'Mark yourself away so taggers are told (!afk eating dinner)',
  usage: '!afk [reason] | !afk off',
  example: '!afk eating dinner',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
