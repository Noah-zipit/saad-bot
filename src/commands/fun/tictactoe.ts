import type { ParsedMessage, CommandContext } from '../../core/types.js'

type Mark = 'X' | 'O'
type Cell = Mark | null

interface Game {
  board: Cell[]
  playerX: string
  playerO: string
  nameX: string
  nameO: string
  turn: Mark
  vsBot: boolean
}

// One active game per chat. Games live only while the bot process runs;
// a bot restart ends any game in progress (start a fresh one with !ttt).
const games = new Map<string, Game>()

const WIN_LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
]

function emoji(cell: Cell): string {
  if (cell === 'X') return '❌'
  if (cell === 'O') return '⭕'
  return '⬜'
}

function render(board: Cell[]): string {
  const rows = [0, 3, 6].map(i =>
    board.slice(i, i + 3).map(c => emoji(c)).join('')
  )
  return rows.join('\n')
}

function winner(board: Cell[]): Mark | 'draw' | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as Mark
    }
  }
  return board.every(c => c !== null) ? 'draw' : null
}

// Bot move: win if it can, block the player if it must, else centre,
// then a corner, then any free cell.
function botMove(board: Cell[]): number {
  const free = board.map((c, i) => (c === null ? i : -1)).filter(i => i >= 0)
  const tryMark = (mark: Mark): number => {
    for (const i of free) {
      const test = [...board]
      test[i] = mark
      if (winner(test) === mark) return i
    }
    return -1
  }
  const win = tryMark('O')
  if (win >= 0) return win
  const block = tryMark('X')
  if (block >= 0) return block
  if (board[4] === null) return 4
  const corners = [0, 2, 6, 8].filter(i => board[i] === null)
  if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)]
  return free[Math.floor(Math.random() * free.length)]
}

function statusLine(game: Game): string {
  const turnName = game.turn === 'X' ? game.nameX : game.nameO
  const turnMark = game.turn === 'X' ? '❌' : '⭕'
  return `${turnMark} *${turnName}'s* turn — play with *!ttt <1-9>*`
}

const HELP = `*⭕ TIC TAC TOE ❌*

*!ttt* — start a game against the bot
*!ttt @user* — challenge someone in this chat
*!ttt <1-9>* — place your mark (positions run left to right, top to bottom)
*!ttt board* — show the current board
*!ttt stop* — end the current game

Positions:
1️⃣2️⃣3️⃣
4️⃣5️⃣6️⃣
7️⃣8️⃣9️⃣`

const handler = async (m: ParsedMessage, { args, db }: CommandContext) => {
  try {
    const game = games.get(m.chat)
    const arg = (args[0] ?? '').toLowerCase()

    // ---- no game running: start one, or show help ----
    if (!game) {
      if (arg === 'board' || arg === 'stop' || /^\d$/.test(arg)) {
        return m.reply('No tic tac toe game is running in this chat yet.\nStart one with *!ttt* (vs the bot) or *!ttt @user* (vs a friend).')
      }
      if (arg === 'help' || arg === '') {
        if (arg === 'help') return m.reply(HELP)
        // bare !ttt starts a game vs the bot
      }

      const opponentJid = m.mentionedJid.length > 0 ? m.mentionedJid[0] : null
      if (opponentJid && opponentJid === m.sender) {
        return m.reply('You cannot challenge yourself. Use *!ttt* to play against the bot, or mention someone else.')
      }

      const newGame: Game = opponentJid
        ? {
            board: Array<Cell>(9).fill(null),
            playerX: m.sender,
            playerO: opponentJid,
            nameX: m.pushName || 'Player X',
            nameO: db.getUser(opponentJid).name || 'Player O',
            turn: 'X',
            vsBot: false
          }
        : {
            board: Array<Cell>(9).fill(null),
            playerX: m.sender,
            playerO: 'bot',
            nameX: m.pushName || 'Player X',
            nameO: 'Saad Bot',
            turn: 'X',
            vsBot: true
          }
      games.set(m.chat, newGame)
      const vsLine = newGame.vsBot
        ? `You (❌) vs *Saad Bot* (⭕)`
        : `*${newGame.nameX}* (❌) vs *${newGame.nameO}* (⭕)`
      return m.reply(`*⭕ TIC TAC TOE ❌*\n\n${vsLine}\n\n${render(newGame.board)}\n\n${statusLine(newGame)}\n*!ttt stop* ends the game.`)
    }

    // ---- a game is running ----
    if (arg === 'board') {
      return m.reply(`${render(game.board)}\n\n${statusLine(game)}`)
    }

    if (arg === 'stop') {
      if (m.sender !== game.playerX && m.sender !== game.playerO) {
        return m.reply('Only a player in this game can stop it.')
      }
      games.delete(m.chat)
      return m.reply('Game ended. Start a new one anytime with *!ttt*.')
    }

    if (arg === 'help' || arg === '') {
      return m.reply(`${render(game.board)}\n\n${statusLine(game)}`)
    }

    if (!/^[1-9]$/.test(arg)) {
      return m.reply(`That is not a valid move. Pick a free position 1-9, or see *!ttt board*.\n\n${render(game.board)}`)
    }

    const pos = Number(arg) - 1
    const expectedJid = game.turn === 'X' ? game.playerX : game.playerO
    if (m.sender !== expectedJid) {
      const turnName = game.turn === 'X' ? game.nameX : game.nameO
      return m.reply(`Not your turn — it is *${turnName}'s* turn.`)
    }
    if (game.board[pos] !== null) {
      return m.reply(`Position ${arg} is already taken. Pick a free one.\n\n${render(game.board)}`)
    }

    game.board[pos] = game.turn
    let result = winner(game.board)
    if (result) {
      games.delete(m.chat)
      if (result === 'draw') {
        return m.reply(`${render(game.board)}\n\n*It is a draw!* Nobody wins this one. Rematch with *!ttt*.`)
      }
      const winnerName = result === 'X' ? game.nameX : game.nameO
      const winnerMark = result === 'X' ? '❌' : '⭕'
      return m.reply(`${render(game.board)}\n\n${winnerMark} *${winnerName} wins!* Congratulations. Rematch with *!ttt*.`)
    }

    game.turn = game.turn === 'X' ? 'O' : 'X'

    // Bot takes its turn immediately after the player's move.
    if (game.vsBot && game.turn === 'O') {
      const move = botMove(game.board)
      game.board[move] = 'O'
      result = winner(game.board)
      if (result) {
        games.delete(m.chat)
        if (result === 'draw') {
          return m.reply(`${render(game.board)}\n\n*It is a draw!* Nobody wins this one. Rematch with *!ttt*.`)
        }
        return m.reply(`${render(game.board)}\n\n⭕ *Saad Bot wins!* Better luck next time — rematch with *!ttt*.`)
      }
      game.turn = 'X'
    }

    return m.reply(`${render(game.board)}\n\n${statusLine(game)}`)
  } catch (error) {
    console.error('Error in tictactoe command:', error)
    m.reply('Something went wrong with the tic tac toe game. Try starting a new one with *!ttt*.')
  }
}

export default {
  pattern: /^(ttt|tictactoe)$/i,
  handler,
  help: 'Play tic tac toe vs the bot or a friend',
  usage: '!ttt / !ttt @user / !ttt <1-9>',
  example: '!ttt',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
