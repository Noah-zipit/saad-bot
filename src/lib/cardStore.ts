// Card-game player store (staged) — mirrors lib/reminderStore.ts.
// One repo-root JSON file (cards.json) is the single source of truth, so
// both bot instances see the same collections. Sync reads/writes keep it
// simple; the file stays small (one record per player).
import fs from 'node:fs'
import path from 'node:path'
import { CARDS, CARD_BY_ID, rollPack, type CardDef } from './cards.js'

export const PACK_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour between packs
export const PACK_COINS = 10 // coins earned for opening a pack
export const DUEL_WIN_COINS = 50
export const DUEL_LOSE_COINS = 10

export interface Player {
  user: string
  cards: Record<string, number> // card id -> copies owned
  coins: number
  wins: number
  losses: number
  lastPackAt: number
}

const CARDS_FILE = path.resolve(process.cwd(), 'cards.json')

function readPlayers(): Player[] {
  try {
    if (fs.existsSync(CARDS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'))
      if (Array.isArray(parsed)) return parsed.filter(p => p && typeof p.user === 'string')
    }
  } catch {
    // Corrupted file — start fresh rather than crash the command.
  }
  return []
}

function writePlayers(all: Player[]): void {
  fs.writeFileSync(CARDS_FILE, JSON.stringify(all, null, 2))
}

export function getPlayer(user: string): Player {
  const all = readPlayers()
  const found = all.find(p => p.user === user)
  if (found) return found
  return { user, cards: {}, coins: 0, wins: 0, losses: 0, lastPackAt: 0 }
}

export function savePlayer(player: Player): void {
  const all = readPlayers()
  const i = all.findIndex(p => p.user === player.user)
  if (i >= 0) all[i] = player
  else all.push(player)
  writePlayers(all)
}

/** Distinct cards owned. */
export function distinctCount(p: Player): number {
  return Object.keys(p.cards).length
}

/** Total card copies owned. */
export function totalCount(p: Player): number {
  return Object.values(p.cards).reduce((a, b) => a + b, 0)
}

/** Leaderboard score: collection breadth + duel wins + coins. */
export function score(p: Player): number {
  return distinctCount(p) * 25 + p.wins * 50 + p.coins
}

export function topPlayers(limit = 10): Player[] {
  return readPlayers()
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
}

/** The player's strongest owned card, if any. */
export function strongestCard(p: Player): CardDef | null {
  let best: CardDef | null = null
  for (const id of Object.keys(p.cards)) {
    const c = CARD_BY_ID[id]
    if (c && (!best || c.power > best.power)) best = c
  }
  return best
}

export function ownsCard(p: Player, cardId: string): boolean {
  return (p.cards[cardId] ?? 0) > 0
}

export function giveCard(p: Player, cardId: string): void {
  p.cards[cardId] = (p.cards[cardId] ?? 0) + 1
}

export function takeCard(p: Player, cardId: string): boolean {
  if (!ownsCard(p, cardId)) return false
  p.cards[cardId] -= 1
  if (p.cards[cardId] <= 0) delete p.cards[cardId]
  return true
}

export type PackResult =
  | { ok: true; cards: CardDef[] }
  | { ok: false; waitMs: number }

/** Open a pack: 3 cards + coins, or a cooldown wait if too soon. */
export function tryOpenPack(user: string): PackResult {
  const p = getPlayer(user)
  const waitMs = p.lastPackAt + PACK_COOLDOWN_MS - Date.now()
  if (waitMs > 0) return { ok: false, waitMs }
  const cards = rollPack()
  for (const c of cards) giveCard(p, c.id)
  p.coins += PACK_COINS
  p.lastPackAt = Date.now()
  savePlayer(p)
  return { ok: true, cards }
}

/** Swap one card each between two players. Both must own their card. */
export function tradeCards(fromUser: string, toUser: string, fromCardId: string, toCardId: string): boolean {
  if (fromUser === toUser || fromCardId === toCardId) return false
  const from = getPlayer(fromUser)
  const to = getPlayer(toUser)
  if (!ownsCard(from, fromCardId) || !ownsCard(to, toCardId)) return false
  takeCard(from, fromCardId)
  takeCard(to, toCardId)
  giveCard(from, toCardId)
  giveCard(to, fromCardId)
  savePlayer(from)
  savePlayer(to)
  return true
}

export { CARDS }
