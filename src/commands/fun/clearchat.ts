import type { ParsedMessage, CommandContext } from '../../core/types.js'

// Braille pattern blank (U+2800) renders as invisible in WhatsApp.
// A tall block of it in a single message pushes previous chat out of view
// without flooding the chat with many messages (which risks a WhatsApp spam flag).
const BLANK_LINE = '⠀'.repeat(1)

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  try {
    const repeat = Math.min(Math.max(parseInt(args[0] ?? '1', 10) || 1, 1), 3)

    for (let i = 0; i < repeat; i++) {
      // 160 invisible lines is plenty to scroll a full screen away
      const block = Array.from({ length: 160 }, () => BLANK_LINE).join('\n')
      await m.reply(`*CLEARING CHAT...*\n${block}\n*Chat cleared. You're welcome.*`)
    }

  } catch (error) {
    console.error('Error in clearchat command:', error)
    m.reply('Something went wrong while clearing the chat.')
  }
}

export default {
  pattern: /^(clearchat|blankspam|clearspam)$/i,
  handler,
  help: 'Pushes previous messages out of view with a blank block (1–3 blocks)',
  usage: '!clearchat [1-3]',
  example: '!clearchat',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
