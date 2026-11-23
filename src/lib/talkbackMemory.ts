// Per-chat talkback conversation memory — the "small db" for !talkback.
// Same JSON-at-repo-root pattern as talkbackStore.ts: no new dependency,
// no external database. Each chat keeps its own turn history so the AI
// reply can remember what was just said in that chat.
// Caps: last 12 messages (6 turns) and ~6,000 chars total, so history
// never grows without bound and never blows the model's context.
// The key is NEVER stored here — the API key lives only in the
// environment (see talkbackAi.ts).
import { promises as fs } from 'node:fs'
import path from 'node:path'

const HISTORY_FILE = path.resolve(process.cwd(), 'talkback-history.json')
const MAX_MESSAGES = 12
const MAX_CHARS = 6000

export type TalkbackTurn = { role: 'user' | 'assistant'; content: string }

async function readAll(): Promise<Record<string, TalkbackTurn[]>> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, TalkbackTurn[]>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function trim(history: TalkbackTurn[]): TalkbackTurn[] {
  let kept = history.slice(-MAX_MESSAGES)
  let chars = kept.reduce((n, t) => n + t.content.length, 0)
  while (kept.length > 2 && chars > MAX_CHARS) {
    const dropped = kept.shift()
    chars -= dropped?.content.length ?? 0
  }
  return kept
}

export async function getTalkbackHistory(chat: string): Promise<TalkbackTurn[]> {
  const all = await readAll()
  return Array.isArray(all[chat]) ? all[chat] : []
}

export async function appendTalkbackTurn(chat: string, user: string, assistant: string): Promise<void> {
  const all = await readAll()
  const history = trim([...(all[chat] ?? []), { role: 'user' as const, content: user }, { role: 'assistant' as const, content: assistant }])
  all[chat] = history
  await fs.writeFile(HISTORY_FILE, JSON.stringify(all, null, 2))
}

export async function clearTalkbackHistory(chat: string): Promise<void> {
  const all = await readAll()
  delete all[chat]
  await fs.writeFile(HISTORY_FILE, JSON.stringify(all, null, 2))
}
