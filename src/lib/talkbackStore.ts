// Per-chat talkback store — mirrors lib/globalFlags.ts.
// Each bot instance keeps its own data/ dir, so a per-instance DB setting
// cannot carry a toggle across instances. This small JSON file at the repo
// root is the single source of truth for which chats have talkback on.
// Default: OFF everywhere — talkback only runs where someone turned it on.
import { promises as fs } from 'node:fs'
import path from 'node:path'

const TALKBACK_FILE = path.resolve(process.cwd(), 'talkback-chats.json')

async function readChats(): Promise<Record<string, boolean>> {
  try {
    const raw = await fs.readFile(TALKBACK_FILE, 'utf8')
    return JSON.parse(raw) as Record<string, boolean>
  } catch {
    return {}
  }
}

export async function isTalkbackEnabled(chat: string): Promise<boolean> {
  const chats = await readChats()
  return chats[chat] === true
}

export async function setTalkbackEnabled(chat: string, enabled: boolean): Promise<void> {
  const chats = await readChats()
  if (enabled) {
    chats[chat] = true
  } else {
    delete chats[chat]
  }
  await fs.writeFile(TALKBACK_FILE, JSON.stringify(chats, null, 2))
}
