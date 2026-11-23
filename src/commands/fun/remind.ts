import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { addReminder, listReminders, deleteReminder, formatDue } from '../../lib/reminderStore.js'

/**
 * !remind — set a reminder the bot delivers in this chat.
 *
 *   !remind 30m call mom back
 *   !remind 2h check the bot logs
 *   !remind 1d pay the bill
 *   !remind 09:30 morning meeting
 *   !reminders          — list your pending reminders
 *   !reminddel 2        — delete #2 from that list
 *
 * Storage: <DATA_DIR>/reminders.json. Delivery is via the ticker in
 * src/lib/reminderStore.ts, which needs one wiring line in src/index.ts
 * (see that file's header) — applied only when Ashar approves this.
 * Reminders live only while the bot process runs; a restart does not
 * lose saved reminders, but one that comes due while the bot is down
 * fires on the next ticker pass after it is back.
 */

function parseWhen(raw: string): number | null {
  const now = new Date()
  // Relative: 30m, 2h, 1d, or combos like 1h30m.
  const rel = raw.match(/^((?:\d+\s*[mhd])+)$/i)
  if (rel) {
    let ms = 0
    for (const [, n, unit] of raw.matchAll(/(\d+)\s*([mhd])/gi)) {
      const v = parseInt(n, 10)
      ms += unit.toLowerCase() === 'm' ? v * 60_000 : unit.toLowerCase() === 'h' ? v * 3_600_000 : v * 86_400_000
    }
    if (ms > 0) return Date.now() + ms
    return null
  }
  // Absolute clock time HH:MM — next occurrence (today, else tomorrow).
  const clock = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (clock) {
    const hh = parseInt(clock[1], 10)
    const mm = parseInt(clock[2], 10)
    if (hh > 23 || mm > 59) return null
    const target = new Date(now)
    target.setHours(hh, mm, 0, 0)
    if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1)
    return target.getTime()
  }
  return null
}

const USAGE =
  '*⏰ REMIND*\n\n' +
  '*!remind 30m <text>* — remind in 30 minutes\n' +
  '*!remind 2h <text>* — remind in 2 hours\n' +
  '*!remind 1d <text>* — remind in 1 day\n' +
  '*!remind 09:30 <text>* — remind at 09:30 (PKT)\n' +
  '*!reminders* — list your pending reminders\n' +
  '*!reminddel <number>* — delete one'

const handler = async (m: ParsedMessage, { db }: CommandContext) => {
  const dataDir = (db as unknown as { dataDir?: string }).dataDir || process.env.DATA_DIR || 'data'
  const cmd = (m.command || '').toLowerCase()

  try {
    if (cmd === 'reminders') {
      const list = listReminders(dataDir, m.sender)
      if (list.length === 0) return m.reply('You have no pending reminders.\n\nSet one with *!remind 30m <text>*')
      const lines = list.map((r, i) => `${i + 1}. ${formatDue(r.dueAt)} — ${r.text}`).join('\n')
      return m.reply(`*⏰ YOUR REMINDERS*\n\n${lines}\n\nDelete one with *!reminddel <number>*`)
    }

    if (cmd === 'reminddel') {
      const n = parseInt(m.args[0] || '', 10)
      const list = listReminders(dataDir, m.sender)
      if (!n || n < 1 || n > list.length) {
        return m.reply('Give the number from *!reminders*.\n\nExample: *!reminddel 2*')
      }
      const ok = deleteReminder(dataDir, m.sender, list[n - 1].id)
      return m.reply(ok ? `Deleted reminder #${n}.` : 'Could not delete that reminder.')
    }

    // !remind <when> <text>
    if (m.args.length < 2) return m.reply(USAGE)
    const dueAt = parseWhen(m.args[0])
    if (!dueAt) return m.reply(`Could not understand the time "${m.args[0]}".\n\n${USAGE}`)
    const text = m.args.slice(1).join(' ').slice(0, 500)
    addReminder(dataDir, { user: m.sender, chat: m.chat, text, dueAt })
    return m.reply(`⏰ Reminder set for *${formatDue(dueAt)}* (PKT):\n${text}`)
  } catch (error) {
    console.error('Error in remind command:', error)
    m.reply('Something went wrong while saving that reminder.')
  }
}

export default {
  pattern: /^(remind|reminders|reminddel)$/i,
  handler,
  help: 'Set a reminder the bot delivers in this chat (!remind 30m <text>)',
  usage: '!remind 30m <text> | !remind 09:30 <text> | !reminders | !reminddel <number>',
  example: '!remind 30m call mom back',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
