import type { ParsedMessage, CommandContext } from '../../core/types.js'

/**
 * !quote / !fact — small daily-use fun commands, no network needed.
 * Local lists, so they work even when the bot's internet is flaky.
 */

const QUOTES = [
  'The best time to plant a tree was 20 years ago. The second best time is now.',
  'Do not wait to strike till the iron is hot, but make it hot by striking. — William Butler Yeats',
  'It always seems impossible until it is done. — Nelson Mandela',
  'Success is not final, failure is not fatal: it is the courage to continue that counts. — Winston Churchill',
  'The only way to do great work is to love what you do. — Steve Jobs',
  'Simplicity is the soul of efficiency. — Austin Freeman',
  'Action is the foundational key to all success. — Pablo Picasso',
  'What we think, we become. — Buddha',
  'Stay hungry, stay foolish. — Steve Jobs',
  'The future depends on what you do today. — Mahatma Gandhi',
  'Believe you can and you are halfway there. — Theodore Roosevelt',
  'Discipline equals freedom. — Jocko Willink'
]

const FACTS = [
  'Honey never spoils. Pots of honey found in ancient Egyptian tombs are still edible after 3,000 years.',
  'Octopuses have three hearts, and two of them stop beating when they swim.',
  'Bananas are berries, but strawberries are not — botanically speaking.',
  'The first computer bug was a real moth, found taped into a logbook in 1947.',
  'Hot water can freeze faster than cold water. It is called the Mpemba effect, and scientists still argue about why.',
  'Sharks existed before trees. By about 50 million years.',
  'Your brain generates enough electricity to power a small light bulb.',
  'There are more possible chess games than atoms in the observable universe.',
  'Wombat poop is cube-shaped. It is the only known animal that does this.',
  'The Eiffel Tower grows about 15 cm taller in summer as the iron expands.',
  'A day on Venus is longer than a year on Venus.',
  'Sea otters hold hands while sleeping so they do not drift apart.'
]

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)]
}

const handler = async (m: ParsedMessage) => {
  try {
    const cmd = (m.command || '').toLowerCase()
    if (cmd === 'fact') {
      return m.reply(`*💡 FACT*\n\n${pick(FACTS)}`)
    }
    return m.reply(`*💬 QUOTE*\n\n${pick(QUOTES)}`)
  } catch (error) {
    console.error('Error in quote/fact command:', error)
    m.reply('Something went wrong. Try again.')
  }
}

export default {
  pattern: /^(quote|fact)$/i,
  handler,
  help: 'Get a random quote (!quote) or a random fact (!fact)',
  usage: '!quote | !fact',
  example: '!quote',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
