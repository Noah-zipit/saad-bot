// AFK store (staged) — mirrors lib/talkbackStore.ts.
// One repo-root JSON file is the single source of truth, so both bot
// instances see the same AFK state. Default: nobody is AFK.
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface AfkEntry {
  reason: string
  since: number
}

const AFK_FILE = path.resolve(process.cwd(), 'afk-users.json')

async function readAfk(): Promise<Record<string, AfkEntry>> {
  try {
    const raw = await fs.readFile(AFK_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, AfkEntry>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeAfk(all: Record<string, AfkEntry>): Promise<void> {
  await fs.writeFile(AFK_FILE, JSON.stringify(all, null, 2))
}

export async function getAfk(user: string): Promise<AfkEntry | null> {
  const all = await readAfk()
  return all[user] ?? null
}

export async function setAfk(user: string, reason: string): Promise<void> {
  const all = await readAfk()
  all[user] = { reason: reason.slice(0, 200), since: Date.now() }
  await writeAfk(all)
}

export async function clearAfk(user: string): Promise<boolean> {
  const all = await readAfk()
  if (!all[user]) return false
  delete all[user]
  await writeAfk(all)
  return true
}

/** "14:32" today, or "12 Nov, 14:32" for older entries (Asia/Karachi). */
export function formatAfkSince(since: number): string {
  const d = new Date(since)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }
  const time = d.toLocaleString('en-GB', opts)
  if (sameDay) return time
  const day = d.toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short' })
  return `${day}, ${time}`
}
