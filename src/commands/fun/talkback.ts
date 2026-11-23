// src/commands/fun/talkback.ts — talk-back mode with an on/off switch.
//   !talkback on   — the bot replies to chat messages in this chat
//   !talkback off  — silence; the bot only answers commands again
//   !talkback      — show the current status for this chat
// Aliases: !chatback, !talk
// In groups, changing the setting needs a group admin (same rule as
// !welcome). In a DM, the person chatting with the bot toggles it.
// Per-chat: turning it on in one group never affects any other chat.
import { isAdmin } from '../../core/messageHandler.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { isTalkbackEnabled, setTalkbackEnabled } from '../../lib/talkbackStore.js'
import { isTalkbackAiConfigured } from '../../lib/talkbackAi.js'
import { clearTalkbackHistory } from '../../lib/talkbackMemory.js'

const STATUS_TEXT = (enabled: boolean, scope: string) =>
  `*💬 TALKBACK*\n\n*Status (${scope}):* ${enabled ? 'ON ✅' : 'OFF ❌'}\n*Replies:* ${isTalkbackAiConfigured() ? 'AI (NVIDIA NIM)' : 'built-in replies (no AI key set)'}\n\n` +
  (enabled
    ? 'The bot will reply to chat messages here, remembering this chat\'s recent conversation.\nIn a group it answers when you tag it or reply to it, so it does not flood the group.'
    : 'The bot only answers commands here right now.') +
  `\n\n*!talkback on* — turn it on\n*!talkback off* — turn it off\n*!talkback clear* — forget this chat's conversation history`

const handler = async (m: ParsedMessage, { sock, args }: CommandContext) => {
  const sub = args[0]?.toLowerCase()
  const scope = m.isGroup ? 'this group' : 'this chat'

  if (!sub) {
    return m.reply(STATUS_TEXT(await isTalkbackEnabled(m.chat), scope))
  }

  if (sub === 'clear') {
    await clearTalkbackHistory(m.chat)
    return m.reply('Done — I have forgotten this chat\'s talkback conversation. Fresh start.')
  }

  if (sub !== 'on' && sub !== 'off') {
    return m.reply('Use *!talkback on*, *!talkback off*, or *!talkback clear*. Send *!talkback* to check the status.')
  }

  // Groups: only a group admin may flip the switch. DMs: the chatter may.
  if (m.isGroup) {
    const admin = await isAdmin(m.sender, m.chat, sock)
    if (!admin) {
      return m.reply(global.mess.only.admin)
    }
  }

  const enabled = sub === 'on'
  await setTalkbackEnabled(m.chat, enabled)

  return m.reply(
    enabled
      ? `*💬 Talkback ON ✅*\n\nI will now reply to chat messages in ${scope}.\nIn a group, tag me or reply to me and I will answer.\n\nTurn it off anytime with *!talkback off*.`
      : `*💬 Talkback OFF ❌*\n\nI will only answer commands in ${scope} now.\n\nTurn it back on with *!talkback on*.`
  )
}

export default {
  pattern: /^(talkback|chatback|talk)$/i,
  handler,
  help: 'Turn talk-back mode on/off: bot replies to chat messages with AI, remembering the chat (!talkback on/off/clear)',
  usage: '!talkback [on/off/clear]',
  example: '!talkback on',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
