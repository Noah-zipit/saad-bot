import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { db, args }: CommandContext) => {
  const v = (args[0] || '').toLowerCase()
  if (v === 'on' || v === 'off') {
    await db.setSetting('antiViewOnce', { enabled: v === 'on' })
    m.reply(
      `*👁 Anti view-once ${v === 'on' ? 'enabled' : 'disabled'}*\n\n` +
      `View-once photos, videos and voice notes sent to the bot will${
        v === 'on' ? ' be saved and re-sent as normal messages' : ' no longer be saved'
      }.`
    )
    return
  }
  const cur = (await db.getSetting('antiViewOnce'))?.enabled !== false
  m.reply(`*👁 Anti view-once is currently ${cur ? 'ON' : 'OFF'}*\n\nUsage: !antiviewonce on|off`)
}

export default {
  pattern: /^(antiviewonce|antivo)$/i,
  handler,
  help: 'Toggle saving of view-once media (photos, videos, voice notes)',
  usage: '!antiviewonce on|off',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
