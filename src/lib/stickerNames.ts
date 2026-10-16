import fs from 'node:fs'
import path from 'node:path'

/**
 * Per-user sticker pack/author name storage.
 * Stored per DATA_DIR (i.e. per bot instance) so the two instances never clash.
 */

export interface StickerNameDefaults {
  pack: string
  author: string
}

const DEFAULTS: StickerNameDefaults = { pack: 'Saad Bot', author: 'Saad Bot' }

function filePath(dataDir: string): string {
  return path.join(dataDir, 'sticker-names.json')
}

function readAll(dataDir: string): Record<string, StickerNameDefaults> {
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

function writeAll(dataDir: string, all: Record<string, StickerNameDefaults>): void {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(filePath(dataDir), JSON.stringify(all, null, 2))
}

export function getStickerDefaults(dataDir: string, sender: string): StickerNameDefaults {
  const all = readAll(dataDir)
  // A global '*' entry (set via `!setname all ...`) applies to every single
  // number and takes precedence over per-number saves.
  if (all['*']) return all['*']
  return all[sender] || { ...DEFAULTS }
}

/** Read the global (every-number) pack/author override, if one is set. */
export function getGlobalStickerDefaults(dataDir: string): StickerNameDefaults | undefined {
  return readAll(dataDir)['*']
}

/** True when a custom name was explicitly saved (per-sender or global override). */
export function hasCustomStickerNames(dataDir: string, sender: string): boolean {
  const all = readAll(dataDir)
  return Boolean(all['*'] || all[sender])
}

/** Set the global override: every number's stickers carry these names. */
export function setGlobalStickerDefaults(dataDir: string, pack: string, author: string): void {
  const all = readAll(dataDir)
  all['*'] = { pack, author }
  writeAll(dataDir, all)
}

/** Clear the global override; per-number saves (or defaults) take over again. */
export function clearGlobalStickerDefaults(dataDir: string): boolean {
  const all = readAll(dataDir)
  if (!all['*']) return false
  delete all['*']
  writeAll(dataDir, all)
  return true
}

export function setStickerDefaults(dataDir: string, sender: string, pack: string, author: string): void {
  const all = readAll(dataDir)
  all[sender] = { pack, author }
  writeAll(dataDir, all)
}

export function clearStickerDefaults(dataDir: string, sender: string): boolean {
  const all = readAll(dataDir)
  if (!all[sender]) return false
  delete all[sender]
  writeAll(dataDir, all)
  return true
}

/**
 * Parse a pack/author pair from raw text after the command.
 * Accepted forms:
 *   "My Pack | Ashar"   (pipe separator — allows spaces in names)
 *   "My Pack, Ashar"    (comma separator)
 *   "My Pack"           (pack only; author stays as-is)
 */
export function parseNameArgs(text: string): { pack?: string; author?: string } {
  const t = (text || '').trim()
  if (!t) return {}
  const pipeParts = t.split('|').map(s => s.trim()).filter(Boolean)
  if (pipeParts.length >= 2) {
    return { pack: pipeParts[0], author: pipeParts.slice(1).join(' | ') }
  }
  const commaParts = t.split(',').map(s => s.trim()).filter(Boolean)
  if (commaParts.length >= 2) {
    return { pack: commaParts[0], author: commaParts.slice(1).join(', ') }
  }
  return { pack: t }
}

/** Strip the leading "prefix + command" token from the message body, keeping raw arg text. */
export function rawArgsText(body: string, prefix: string): string {
  const rest = (body || '').slice(prefix.length).trim()
  const spaceIdx = rest.indexOf(' ')
  return spaceIdx === -1 ? '' : rest.slice(spaceIdx + 1).trim()
}
