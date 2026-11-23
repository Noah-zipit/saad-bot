import fs from 'node:fs'
import path from 'node:path'

/**
 * Per-user, per-pack pagination progress for !tgsticker.
 * Stored per DATA_DIR (i.e. per bot instance) so the two instances never clash.
 *
 * The bug it fixes: !tgsticker always sent stickers 0–9, so "run the command
 * again for the next 10" just re-sent the first 10. Now the command remembers
 * how far it got through each pack for each user.
 */

export interface TgstickerProgress {
  packName: string
  /** Number of stickers already sent in the current pass. */
  offset: number
  /** Total stickers seen in the pack at last run (packs can change). */
  total: number
  updatedAt: number
}

const FILE = 'tgsticker-progress.json'

function filePath(dataDir: string): string {
  return path.join(dataDir, FILE)
}

function readAll(dataDir: string): Record<string, TgstickerProgress> {
  try {
    const p = filePath(dataDir)
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (parsed && typeof parsed === 'object') return parsed
    }
  } catch {
    // corrupted or unreadable file — start fresh
  }
  return {}
}

function writeAll(dataDir: string, all: Record<string, TgstickerProgress>): void {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(filePath(dataDir), JSON.stringify(all, null, 2))
}

function key(sender: string, packName: string): string {
  return `${sender}::${packName.toLowerCase()}`
}

/** Where this user left off on this pack, or null when no pass is open. */
export function getProgress(dataDir: string, sender: string, packName: string): TgstickerProgress | null {
  const p = readAll(dataDir)[key(sender, packName)]
  return p && typeof p.offset === 'number' && p.offset > 0 ? p : null
}

/** Save how far through the pack the user has reached. */
export function saveProgress(dataDir: string, sender: string, packName: string, offset: number, total: number): void {
  const all = readAll(dataDir)
  all[key(sender, packName)] = { packName, offset, total, updatedAt: Date.now() }
  writeAll(dataDir, all)
}

/** Clear the saved position (pack finished, or a fresh run started). */
export function clearProgress(dataDir: string, sender: string, packName: string): void {
  const all = readAll(dataDir)
  const k = key(sender, packName)
  if (all[k]) {
    delete all[k]
    writeAll(dataDir, all)
  }
}
