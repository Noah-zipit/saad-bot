import fs from 'node:fs'
import path from 'node:path'
import type { WASocket } from '@whiskeysockets/baileys'

/**
 * Reminder storage + delivery ticker (staged).
 *
 * Reminders live in <DATA_DIR>/reminders.json as a flat list, so the
 * ticker can scan every user's reminders without knowing who is who.
 * Times are epoch millis; display formatting uses Asia/Karachi because
 * that is where the bot's users are.
 *
 * WIRING (one line, applied only when Ashar approves this in main chat):
 * in src/index.ts, next to startAiBridge(...):
 *   startReminderTicker(() => sockHolder.current, db.dataDir)
 * Without that line, !remind still saves and lists, but nothing fires
 * on its own — the ticker is the only part that sends on schedule.
 */

export interface Reminder {
  id: string
  user: string
  chat: string
  text: string
  dueAt: number
  createdAt: number
}

function filePath(dataDir: string): string {
  return path.join(dataDir, 'reminders.json')
}

export function readReminders(dataDir: string): Reminder[] {
  try {
    const p = filePath(dataDir)
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (Array.isArray(parsed)) return parsed.filter(r => r && typeof r.dueAt === 'number')
    }
  } catch {
    // Corrupted file — start fresh rather than crash the ticker.
  }
  return []
}

function writeReminders(dataDir: string, all: Reminder[]): void {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(filePath(dataDir), JSON.stringify(all, null, 2))
}

export function addReminder(dataDir: string, r: Omit<Reminder, 'id' | 'createdAt'>): Reminder {
  const all = readReminders(dataDir)
  const reminder: Reminder = {
    ...r,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now()
  }
  all.push(reminder)
  writeReminders(dataDir, all)
  return reminder
}

export function listReminders(dataDir: string, user: string): Reminder[] {
  return readReminders(dataDir)
    .filter(r => r.user === user)
    .sort((a, b) => a.dueAt - b.dueAt)
}

export function deleteReminder(dataDir: string, user: string, id: string): boolean {
  const all = readReminders(dataDir)
  const kept = all.filter(r => !(r.user === user && r.id === id))
  if (kept.length === all.length) return false
  writeReminders(dataDir, kept)
  return true
}

export function formatDue(dueAt: number): string {
  return new Date(dueAt).toLocaleString('en-GB', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}

let tickerStarted = false

/** Check every 30s and deliver due reminders. Safe to call once per process. */
export function startReminderTicker(
  getSock: () => WASocket | undefined | null,
  dataDir: string
): void {
  if (tickerStarted) return
  tickerStarted = true
  setInterval(async () => {
    try {
      const now = Date.now()
      const all = readReminders(dataDir)
      const due = all.filter(r => r.dueAt <= now)
      if (due.length === 0) return
      const sock = getSock()
      if (!sock) return
      const delivered = new Set<string>()
      for (const r of due) {
        try {
          await sock.sendMessage(r.chat, { text: `⏰ *Reminder*\n\n${r.text}` })
          delivered.add(r.id)
        } catch (err) {
          console.error('reminder deliver error:', err)
        }
      }
      if (delivered.size > 0) {
        writeReminders(dataDir, all.filter(r => !delivered.has(r.id)))
      }
    } catch (err) {
      console.error('reminder ticker error:', err)
    }
  }, 30 * 1000)
}
