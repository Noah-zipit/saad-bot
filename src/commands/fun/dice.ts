import type { ParsedMessage, CommandContext } from '../../core/types.js'

/**
 * !roll / !dice / !coinflip — small dice and coin commands, no network.
 *
 *   !roll        — one 6-sided die
 *   !roll 20     — a number from 1 to 20
 *   !roll 2d20   — two 20-sided dice, with total
 *   !dice        — same as !roll
 *   !coinflip    — heads or tails
 */

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

const handler = async (m: ParsedMessage) => {
  const cmd = (m.command || '').toLowerCase()

  try {
    if (cmd === 'coinflip' || cmd === 'coin' || cmd === 'flip') {
      const result = Math.random() < 0.5 ? 'Heads' : 'Tails'
      return m.reply(`*🪙 COINFLIP*\n\n${result}!`)
    }

    // !roll / !dice
    const arg = (m.args[0] || '').trim().toLowerCase()

    if (!arg) {
      return m.reply(`*🎲 ROLL*\n\nYou rolled a *${rollDie(6)}* (1–6)`)
    }

    const ndm = arg.match(/^(\d{1,2})?d(\d{1,4})$/)
    if (ndm) {
      const count = parseInt(ndm[1] || '1', 10)
      const sides = parseInt(ndm[2], 10)
      if (count < 1 || count > 20) return m.reply('Roll at most 20 dice at once.\n\nExample: *!roll 2d20*')
      if (sides < 2 || sides > 1000) return m.reply('Dice need 2 to 1000 sides.\n\nExample: *!roll 2d20*')
      const rolls = Array.from({ length: count }, () => rollDie(sides))
      const total = rolls.reduce((a, b) => a + b, 0)
      const detail = count > 1 ? ` (${rolls.join(' + ')})` : ''
      return m.reply(`*🎲 ROLL ${count}d${sides}*\n\nYou rolled *${total}*${detail}`)
    }

    const max = parseInt(arg, 10)
    if (!Number.isNaN(max) && max >= 2 && max <= 1000000) {
      return m.reply(`*🎲 ROLL*\n\nYou rolled a *${rollDie(max)}* (1–${max})`)
    }

    return m.reply('I did not understand that roll.\n\n*!roll* — one die\n*!roll 20* — a number from 1 to 20\n*!roll 2d20* — two 20-sided dice')
  } catch (error) {
    console.error('Error in dice command:', error)
    m.reply('Something went wrong while rolling.')
  }
}

export default {
  pattern: /^(roll|dice|coinflip|coin|flip)$/i,
  handler,
  help: 'Roll dice or flip a coin (!roll 2d20, !coinflip)',
  usage: '!roll [NdM | max] | !dice | !coinflip',
  example: '!roll 2d20',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
