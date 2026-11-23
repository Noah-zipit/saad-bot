import type { ParsedMessage, CommandContext } from '../../core/types.js'

/**
 * !poll — a real WhatsApp poll in a group.
 *
 *   !poll Best day for the meetup? | Friday | Saturday | Sunday
 *
 * Uses Baileys' native poll message (members tap to vote, results
 * update live). Options are separated by "|": 2 to 12 of them.
 * If the native poll fails to send, it falls back to a plain-text
 * list so the vote can still happen by replying with a number.
 */

const handler = async (m: ParsedMessage, { sock, args }: CommandContext) => {
  if (!m.isGroup) {
    return m.reply('Polls only work in groups.\n\nUsage: *!poll Question? | Option 1 | Option 2*')
  }

  const parts = args.join(' ').split('|').map(p => p.trim()).filter(Boolean)
  const question = parts[0]
  const options = parts.slice(1)
  if (!question || options.length < 2) {
    return m.reply(
      '*📊 POLL*\n\n' +
      'Give a question and at least 2 options, separated by | :\n' +
      '*!poll Best day? | Friday | Saturday | Sunday*'
    )
  }
  if (options.length > 12) {
    return m.reply('WhatsApp polls allow at most 12 options — you gave ' + options.length + '.')
  }

  try {
    await sock.sendMessage(m.chat, {
      poll: { name: question.slice(0, 300), values: options.map(o => o.slice(0, 100)), selectableCount: 1 }
    }, { quoted: m.message })
  } catch (error) {
    console.error('Error sending poll, falling back to text:', error)
    const lines = options.map((o, i) => `${i + 1}. ${o}`).join('\n')
    await m.reply(`📊 *${question}*\n\n${lines}\n\nReply with the option number to vote.`)
  }
}

export default {
  pattern: /^(poll|vote)$/i,
  handler,
  help: 'Create a poll in this group (!poll Question? | Option 1 | Option 2)',
  usage: '!poll Question? | Option 1 | Option 2  (2–12 options)',
  example: '!poll Best day? | Friday | Saturday',
  tags: ['group'],
  group: true,
  admin: false,
  owner: false
}
