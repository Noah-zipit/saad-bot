// Card pool for the !cards game (staged) — snob.gg-style collectible cards:
// packs, trading, duels, leaderboard. All names and stats are original to
// this bot; no card data was copied from any other game or bot.
// Rarities: Common 70% / Rare 20% / Epic 8% / Legendary 2% per pack slot.

export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary'

export interface CardDef {
  id: string
  name: string
  emoji: string
  rarity: Rarity
  power: number
}

export const RARITY_EMOJI: Record<Rarity, string> = {
  Common: '⚪',
  Rare: '🔵',
  Epic: '🟣',
  Legendary: '🟡'
}

export const CARDS: CardDef[] = [
  // Commons (power 10–22)
  { id: 'ember-fox', name: 'Ember Fox', emoji: '🦊', rarity: 'Common', power: 18 },
  { id: 'moss-turtle', name: 'Moss Turtle', emoji: '🐢', rarity: 'Common', power: 12 },
  { id: 'pebble-golem', name: 'Pebble Golem', emoji: '🪨', rarity: 'Common', power: 15 },
  { id: 'dew-sprite', name: 'Dew Sprite', emoji: '✨', rarity: 'Common', power: 14 },
  { id: 'cinder-rat', name: 'Cinder Rat', emoji: '🐀', rarity: 'Common', power: 11 },
  { id: 'breeze-falcon', name: 'Breeze Falcon', emoji: '🦅', rarity: 'Common', power: 22 },
  { id: 'thorn-vine', name: 'Thorn Vine', emoji: '🌿', rarity: 'Common', power: 16 },
  { id: 'mud-puppy', name: 'Mud Puppy', emoji: '🐶', rarity: 'Common', power: 13 },
  { id: 'glow-moth', name: 'Glow Moth', emoji: '🦋', rarity: 'Common', power: 17 },
  { id: 'frost-hare', name: 'Frost Hare', emoji: '🐇', rarity: 'Common', power: 20 },
  { id: 'sand-crab', name: 'Sand Crab', emoji: '🦀', rarity: 'Common', power: 19 },
  { id: 'echo-bat', name: 'Echo Bat', emoji: '🦇', rarity: 'Common', power: 21 },
  // Rares (power 33–48)
  { id: 'tide-serpent', name: 'Tide Serpent', emoji: '🐍', rarity: 'Rare', power: 38 },
  { id: 'storm-crow', name: 'Storm Crow', emoji: '🐦‍⬛', rarity: 'Rare', power: 42 },
  { id: 'iron-boar', name: 'Iron Boar', emoji: '🐗', rarity: 'Rare', power: 35 },
  { id: 'lunar-wolf', name: 'Lunar Wolf', emoji: '🐺', rarity: 'Rare', power: 48 },
  { id: 'blaze-panther', name: 'Blaze Panther', emoji: '🐆', rarity: 'Rare', power: 45 },
  { id: 'crystal-owl', name: 'Crystal Owl', emoji: '🦉', rarity: 'Rare', power: 40 },
  { id: 'venom-spider', name: 'Venom Spider', emoji: '🕷️', rarity: 'Rare', power: 33 },
  { id: 'frost-bear', name: 'Frost Bear', emoji: '🐻‍❄️', rarity: 'Rare', power: 44 },
  { id: 'solar-hawk', name: 'Solar Hawk', emoji: '🦅', rarity: 'Rare', power: 47 },
  { id: 'shadow-cat', name: 'Shadow Cat', emoji: '🐈‍⬛', rarity: 'Rare', power: 36 },
  // Epics (power 62–78)
  { id: 'phoenix-reborn', name: 'Phoenix Reborn', emoji: '🔥', rarity: 'Epic', power: 68 },
  { id: 'kraken-deep', name: 'Kraken Deep', emoji: '🐙', rarity: 'Epic', power: 72 },
  { id: 'thunder-dragon', name: 'Thunder Dragon', emoji: '🐉', rarity: 'Epic', power: 78 },
  { id: 'frost-queen', name: 'Frost Queen', emoji: '❄️', rarity: 'Epic', power: 65 },
  { id: 'void-reaper', name: 'Void Reaper', emoji: '💀', rarity: 'Epic', power: 75 },
  { id: 'storm-titan', name: 'Storm Titan', emoji: '⛈️', rarity: 'Epic', power: 70 },
  { id: 'golden-griffin', name: 'Golden Griffin', emoji: '🦁', rarity: 'Epic', power: 62 },
  { id: 'abyss-leviathan', name: 'Abyss Leviathan', emoji: '🌊', rarity: 'Epic', power: 74 },
  // Legendaries (power 90–100)
  { id: 'celestial-dragon', name: 'Celestial Dragon', emoji: '🐲', rarity: 'Legendary', power: 95 },
  { id: 'star-phoenix', name: 'Star Phoenix', emoji: '🌟', rarity: 'Legendary', power: 92 },
  { id: 'time-warden', name: 'Time Warden', emoji: '⏳', rarity: 'Legendary', power: 98 },
  { id: 'void-emperor', name: 'Void Emperor', emoji: '👑', rarity: 'Legendary', power: 100 },
  { id: 'sun-goddess', name: 'Sun Goddess', emoji: '☀️', rarity: 'Legendary', power: 90 },
  { id: 'moon-sovereign', name: 'Moon Sovereign', emoji: '🌙', rarity: 'Legendary', power: 93 }
]

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(
  CARDS.map(c => [c.id, c])
)

/** Find a card by id or by (partial, case-insensitive) name. */
export function findCard(query: string): CardDef | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  return CARD_BY_ID[q] ?? CARDS.find(c => c.name.toLowerCase() === q) ?? CARDS.find(c => c.name.toLowerCase().includes(q))
}

function rollOne(): CardDef {
  const r = Math.random()
  const rarity: Rarity = r < 0.02 ? 'Legendary' : r < 0.10 ? 'Epic' : r < 0.30 ? 'Rare' : 'Common'
  const pool = CARDS.filter(c => c.rarity === rarity)
  return pool[Math.floor(Math.random() * pool.length)]
}

/** A pack is 3 cards, rolled independently by rarity odds. */
export function rollPack(): CardDef[] {
  return [rollOne(), rollOne(), rollOne()]
}

export function formatCard(c: CardDef, count?: number): string {
  const dup = count && count > 1 ? ` ×${count}` : ''
  return `${RARITY_EMOJI[c.rarity]} ${c.emoji} *${c.name}* — ${c.rarity}, ⚔️ ${c.power}${dup}`
}
