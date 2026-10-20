import type { ParsedMessage, CommandContext } from '../../core/types.js'

const handler = async (m: ParsedMessage, { db, args }: CommandContext) => {
  const v = (args[0] || '').toLowerCase()
  if (v === 'on' || v === 'off') {
    await db.setSetting('antiViewOnce', { enabled: v === 'on' })
    m.reply(
      v === 'on'
        ? '*👁 Anti view-once enabled*\n\n' +
          'From now on, any view-once photo, video or voice note sent to the bot is automatically saved and re-sent here as a normal, viewable message.\n\n' +
          '_Tip: you can also reveal a single view-once on demand — reply to it with *!vv*._'
        : '*👁 Anti view-once disabled*\n\n' +
          'View-once media will no longer be auto-saved. You can still reveal one manually by replying to it with *!vv*.'
    )
    return
  }
  const cur = (await db.getSetting('antiViewOnce'))?.enabled !== false
  m.reply(
    `*👁 Anti view-once is currently ${cur ? 'ON' : 'OFF'}*\n\n` +
    (cur
      ? 'View-once photos, videos and voice notes sent to the bot are auto-saved and re-sent as normal messages.'
      : 'Auto-saving is off.') +
    '\n\nReply to any view-once message with *!vv* to reveal it on demand.\n\nUsage: !antiviewonce on|off'
  )
}

export default {
  pattern: /^(antiviewonce|antivo)$/i,
  handler,
  help: 'Toggle auto-saving of view-once media (photos, videos, voice notes)',
  usage: '!antiviewonce on|off',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
