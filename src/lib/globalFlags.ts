// Global flags shared across BOTH bot instances.
//
// Each instance (port 3000 / 3001) keeps its own data/ dir, so a
// per-instance DB setting cannot silence something everywhere.
// This small JSON file at the repo root is the single source of truth
// for owner-level global toggles like the welcome kill switch.
import { promises as fs } from 'node:fs'
import path from 'node:path'

const FLAGS_FILE = path.resolve(process.cwd(), 'global-flags.json')

async function readFlags(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(FLAGS_FILE, 'utf8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Default true — welcomes flow unless the owner explicitly kills them. */
export async function isWelcomeGloballyEnabled(): Promise<boolean> {
  const flags = await readFlags()
  return flags.welcomeGlobal !== false
}

export async function setWelcomeGloballyEnabled(enabled: boolean): Promise<void> {
  const flags = await readFlags()
  flags.welcomeGlobal = enabled
  await fs.writeFile(FLAGS_FILE, JSON.stringify(flags, null, 2))
}
