import type { ParsedMessage, CommandContext } from '../../core/types.js'

/**
 * !8ball <question> — magic 8-ball. Local answers, no network.
 * (Different from !fortune, which reads a fortune + advice + lucky number.)
 */

const ANSWERS = [
  'It is certain.',
  'Without a doubt.',
  'Yes, definitely.',
  'Most likely.',
  'Yes.',
  'Signs point to yes.',
  'Ask again later.',
  'Better not tell you now.',
  'Cannot predict now.',
  'Concentrate and ask again.',
  'Do not count on it.',
  'My reply is no.',
  'Very doubtful.',
  'Outlook not so good.',
  'No.',
  'It is decidedly so.',
  'As I see it, yes.',
  'Reply hazy, try again.',
  'Outlook good.',
  'My sources say no.'
]

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  const question = args.join(' ').trim()
  if (!question) {
    return m.reply('Ask me a yes/no question.\n\nExample: *!8ball will it rain tomorrow?*')
  }
  const answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)]
  return m.reply(`*🎱 8-BALL*\n\nQ: ${question.slice(0, 300)}\nA: *${answer}*`)
}

export default {
  pattern: /^(8ball|eightball|magic8)$/i,
  handler,
  help: 'Ask the magic 8-ball a yes/no question (!8ball will it rain?)',
  usage: '!8ball <question>',
  example: '!8ball will it rain tomorrow?',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
