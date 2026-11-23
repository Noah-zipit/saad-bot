import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { digitsOf } from '../../lib/jidUtils.js'
import {
  findCard,
  formatCard,
  RARITY_EMOJI,
  CARDS,
  type CardDef
} from '../../lib/cards.js'
import {
  getPlayer,
  savePlayer,
  tryOpenPack,
  tradeCards,
  strongestCard,
  distinctCount,
  totalCount,
  score,
  topPlayers,
  ownsCard,
  DUEL_WIN_COINS,
  DUEL_LOSE_COINS
} from '../../lib/cardStore.js'

/**
 * Snob.gg-style card game (staged) — collectible cards, packs, trading,
 * duels, leaderboard. Original 36-card pool in src/lib/cards.ts; player
 * collections live in a repo-root cards.json (src/lib/cardStore.ts).
 *
 *   !cards              — your collection
 *   !cards <name>       — details for one card
 *   !pack / !draw       — open a pack (3 cards, 1-hour cooldown, +10 coins)
 *   !trade (reply to someone) <my card> | <their card>
 *   !trade @user <my card> | <their card>
 *   !duel @user         — strongest-card battle (or reply to their message)
 *   !cardlb             — leaderboard
 *
 * No external API, no key, no new dependency.
 */

function formatWait(ms: number): string {
  const mins = Math.ceil(ms / 60_000)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m}m`
}

function sortOwned(p: ReturnType<typeof getPlayer>): { def: CardDef; count: number }[] {
  return Object.entries(p.cards)
    .map(([id, count]) => ({ def: CARDS.find(c => c.id === id)!, count }))
    .filter(x => x.def)
    .sort((a, b) => b.def.power - a.def.power)
}

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  const cmd = (m.command || '').toLowerCase()

  try {
    // ---- !cards [name] ----
    if (cmd === 'cards') {
      const query = args.join(' ').trim()
      if (query) {
        const card = findCard(query)
        if (!card) return m.reply(`No card called "${query.slice(0, 100)}".\n\nSee your collection with *!cards*.`)
        const p = getPlayer(m.sender)
        const owned = p.cards[card.id] ?? 0
        return m.reply(
          `${formatCard(card)}\n\nYou own: *${owned}*${owned === 0 ? '\nGet it from a *!pack* or a *!trade*.' : ''}`
        )
      }
      const p = getPlayer(m.sender)
      if (totalCount(p) === 0) {
        return m.reply(
          `*🃏 YOUR CARDS*\n\nYour collection is empty.\nOpen your first pack with *!pack* — it is free, once an hour.`
        )
      }
      const owned = sortOwned(p)
      const lines = owned.slice(0, 12).map(o => formatCard(o.def, o.count)).join('\n')
      const more = owned.length > 12 ? `\n...and ${owned.length - 12} more` : ''
      return m.reply(
        `*🃏 ${m.pushName}'s CARDS*\n\n` +
        `📦 ${totalCount(p)} cards (${distinctCount(p)}/${CARDS.length} unique)  •  🪙 ${p.coins} coins\n` +
        `⚔️ Duels: ${p.wins} won, ${p.losses} lost\n\n${lines}${more}\n\n` +
        `*!pack* for more  •  *!trade* to swap  •  *!duel @user* to battle`
      )
    }

    // ---- !pack / !draw ----
    if (cmd === 'pack' || cmd === 'draw') {
      const result = tryOpenPack(m.sender)
      if (!result.ok) {
        return m.reply(
          `⏳ Your next pack is ready in *${formatWait(result.waitMs)}*.\n\nPacks are free, once an hour. Meanwhile, try *!duel @user* or *!trade*.`
        )
      }
      const lines = result.cards.map(c => formatCard(c)).join('\n')
      const best = result.cards.reduce((a, b) => (b.power > a.power ? b : a))
      const lucky = best.rarity === 'Epic' || best.rarity === 'Legendary' ? `\n\n${RARITY_EMOJI[best.rarity]} Nice pull — a ${best.rarity}!` : ''
      return m.reply(`*🎴 PACK OPENED* (+10 🪙)\n\n${lines}${lucky}`)
    }

    // ---- !trade ----
    if (cmd === 'trade') {
      const partner = m.mentionedJid[0] ?? m.quoted?.sender
      if (!partner) {
        return m.reply(
          'Trade with a reply or a tag.\n\n' +
          'Reply to their message with:\n*!trade Ember Fox | Tide Serpent*\n\n' +
          'Or tag them:\n*!trade @user Ember Fox | Tide Serpent*\n\n' +
          'You give the first card, they give the second. Both must own their card.'
        )
      }
      let rest = args.join(' ').trim()
      if (m.mentionedJid.length > 0) rest = rest.replace(/^@\S+\s*/, '')
      const parts = rest.split('|').map(s => s.trim())
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return m.reply('Use two card names separated by | .\n\nExample: *!trade Ember Fox | Tide Serpent*')
      }
      const myCard = findCard(parts[0])
      const theirCard = findCard(parts[1])
      if (!myCard) return m.reply(`I do not know a card called "${parts[0].slice(0, 100)}".`)
      if (!theirCard) return m.reply(`I do not know a card called "${parts[1].slice(0, 100)}".`)
      const me = getPlayer(m.sender)
      const them = getPlayer(partner)
      if (!ownsCard(me, myCard.id)) return m.reply(`You do not own *${myCard.name}*. Check *!cards*.`)
      if (!ownsCard(them, theirCard.id)) {
        return m.reply(`They do not own *${theirCard.name}*, so this trade cannot happen.`)
      }
      if (!tradeCards(m.sender, partner, myCard.id, theirCard.id)) {
        return m.reply('That trade could not be completed. Check both cards and try again.')
      }
      return m.reply(
        `*🤝 TRADE DONE*\n\nYou gave ${formatCard(myCard)}\nYou got ${formatCard(theirCard)}`
      )
    }

    // ---- !duel ----
    if (cmd === 'duel' || cmd === 'battle') {
      const partner = m.mentionedJid[0] ?? m.quoted?.sender
      if (!partner) {
        return m.reply('Tag someone or reply to their message to duel them.\n\nExample: *!duel @user*')
      }
      if (partner === m.sender) return m.reply('You cannot duel yourself.')
      const me = getPlayer(m.sender)
      const them = getPlayer(partner)
      const myCard = strongestCard(me)
      const theirCard = strongestCard(them)
      if (!myCard) return m.reply('You have no cards yet. Open a *!pack* first.')
      if (!theirCard) return m.reply('They have no cards yet. They need to open a *!pack* first.')
      // Power decides, with a small luck swing so the underdog sometimes wins.
      const myRoll = myCard.power + Math.floor(Math.random() * 11)
      const theirRoll = theirCard.power + Math.floor(Math.random() * 11)
      const iWon = myRoll !== theirRoll ? myRoll > theirRoll : myCard.power >= theirCard.power
      me.coins += iWon ? DUEL_WIN_COINS : DUEL_LOSE_COINS
      them.coins += iWon ? DUEL_LOSE_COINS : DUEL_WIN_COINS
      if (iWon) { me.wins += 1; them.losses += 1 } else { them.wins += 1; me.losses += 1 }
      savePlayer(me)
      savePlayer(them)
      const winnerName = iWon ? m.pushName : digitsOf(partner)
      return m.reply(
        `*⚔️ DUEL*\n\n` +
        `${m.pushName}: ${formatCard(myCard)} → rolled ${myRoll}\n` +
        `${digitsOf(partner)}: ${formatCard(theirCard)} → rolled ${theirRoll}\n\n` +
        `🏆 *${winnerName} wins!* (+${DUEL_WIN_COINS} 🪙, loser +${DUEL_LOSE_COINS} 🪙)`
      )
    }

    // ---- !cardlb ----
    if (cmd === 'cardlb' || cmd === 'cardleaderboard') {
      const top = topPlayers(10)
      if (top.length === 0) {
        return m.reply('No one has any cards yet. Be the first — open a *!pack*!')
      }
      const lines = top.map((p, i) => {
        const name = p.user === m.sender ? `${m.pushName} (you)` : digitsOf(p.user)
        return `${i + 1}. ${name} — ${score(p)} pts (${distinctCount(p)} unique, ${p.wins} duel wins, 🪙 ${p.coins})`
      }).join('\n')
      return m.reply(`*🏆 CARD LEADERBOARD*\n\n${lines}\n\nScore = 25 per unique card + 50 per duel win + coins.`)
    }
  } catch (error) {
    console.error('Error in cards command:', error)
    m.reply('Something went wrong in the card game. Try again.')
  }
}

export default {
  pattern: /^(cards|pack|draw|trade|duel|battle|cardlb|cardleaderboard)$/i,
  handler,
  help: 'Card collecting game: packs, trades, duels (!pack, !cards, !duel @user)',
  usage: '!cards | !pack | !trade @user <my card> | <their card> | !duel @user | !cardlb',
  example: '!pack',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
