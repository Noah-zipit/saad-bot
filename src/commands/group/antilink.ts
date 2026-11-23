import type { ParsedMessage, CommandContext } from '../../core/types.js'

/**
 * !antilink on/off — group-admin toggle for invite-link protection.
 * Flips the same group.settings.antiLink flag that !settings antilink
 * already toggles; the enforcement (delete + warn) lives in the staged
 * messageHandler hook, so this command alone does nothing until that
 * hook is approved too. Non-admins posting a chat.whatsapp.com invite
 * link get the message deleted when the bot is a group admin.
 */

const handler = async (m: ParsedMessage, { db, args }: CommandContext) => {
  if (!m.isGroup) {
    return m.reply('This command only works in groups.')
  }

  const sub = (args[0] || '').toLowerCase()
  const group = db.getGroup(m.chat)

  if (!sub) {
    return m.reply(
      `*🔗 ANTILINK*\n\nStatus: ${group.settings.antiLink ? 'ON ✅' : 'OFF ❌'}\n\n` +
      'When ON, invite links posted by non-admins are deleted.\n\n' +
      '*!antilink on* — turn it on\n*!antilink off* — turn it off'
    )
  }

  if (sub !== 'on' && sub !== 'off') {
    return m.reply('Use *!antilink on* or *!antilink off*.')
  }

  const enabled = sub === 'on'
  db.updateGroup(m.chat, { 'settings.antiLink': enabled })
  return m.reply(
    enabled
      ? '🔗 *Antilink ON*\n\nInvite links from non-admins will be deleted. (The bot needs admin rights in this group to delete messages.)'
      : '🔗 *Antilink OFF*\n\nInvite links are allowed again.'
  )
}

export default {
  pattern: /^(antilink|anti-link)$/i,
  handler,
  help: 'Block WhatsApp invite links from non-admins (!antilink on/off)',
  usage: '!antilink [on/off]',
  example: '!antilink on',
  tags: ['group'],
  group: true,
  admin: true,
  owner: false
}
