import fs from 'node:fs'
import path from 'node:path'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

/**
 * !todo — a per-user to-do list inside WhatsApp.
 *
 *   !todo add buy milk          — add an item
 *   !todo                     — list your items
 *   !todo done 2               — mark #2 done
 *   !todo del 2                — delete #2
 *   !todo clear                — delete all your items
 *
 * Stored per user in <DATA_DIR>/todos.json. Fully self-contained: no
 * background process needed, unlike !remind (which needs its ticker).
 */

interface TodoItem {
  text: string
  done: boolean
  createdAt: number
}

function filePath(dataDir: string): string {
  return path.join(dataDir, 'todos.json')
}

function readAll(dataDir: string): Record<string, TodoItem[]> {
  try {
    const p = filePath(dataDir)
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (parsed && typeof parsed === 'object') return parsed
    }
  } catch {
    // Corrupted file — start fresh rather than crash the command.
  }
  return {}
}

function writeAll(dataDir: string, all: Record<string, TodoItem[]>): void {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(filePath(dataDir), JSON.stringify(all, null, 2))
}

const USAGE =
  '*✅ TODO*\n\n' +
  '*!todo add <text>* — add an item\n' +
  '*!todo* — list your items\n' +
  '*!todo done <number>* — mark one done\n' +
  '*!todo del <number>* — delete one\n' +
  '*!todo clear* — delete all your items'

const handler = async (m: ParsedMessage, { db }: CommandContext) => {
  const dataDir = (db as unknown as { dataDir?: string }).dataDir || process.env.DATA_DIR || 'data'
  const all = readAll(dataDir)
  const list = all[m.sender] || []
  const save = () => {
    all[m.sender] = list
    writeAll(dataDir, all)
  }

  try {
    const sub = (m.args[0] || '').toLowerCase()

    if (!sub) {
      if (list.length === 0) {
        return m.reply('Your to-do list is empty.\n\nAdd one with *!todo add <text>*')
      }
      const lines = list.map((t, i) => `${t.done ? '✅' : '⬜'} ${i + 1}. ${t.text}`).join('\n')
      return m.reply(`*✅ YOUR TO-DO LIST*\n\n${lines}\n\n*!todo done <number>* to tick one off.`)
    }

    if (sub === 'add') {
      const text = m.args.slice(1).join(' ').trim().slice(0, 300)
      if (!text) return m.reply('What should I add?\n\nExample: *!todo add buy milk*')
      list.push({ text, done: false, createdAt: Date.now() })
      save()
      return m.reply(`Added: ${text}`)
    }

    if (sub === 'done' || sub === 'del') {
      const n = parseInt(m.args[1] || '', 10)
      if (!n || n < 1 || n > list.length) {
        return m.reply('Give the number from *!todo*.\n\nExample: *!todo done 2*')
      }
      if (sub === 'done') {
        list[n - 1].done = true
        save()
        return m.reply(`✅ Done: ${list[n - 1].text}`)
      }
      const [removed] = list.splice(n - 1, 1)
      save()
      return m.reply(`Deleted: ${removed.text}`)
    }

    if (sub === 'clear') {
      all[m.sender] = []
      writeAll(dataDir, all)
      return m.reply('Your to-do list is cleared.')
    }

    return m.reply(USAGE)
  } catch (error) {
    console.error('Error in todo command:', error)
    m.reply('Something went wrong with your to-do list.')
  }
}

export default {
  pattern: /^(todo|todos)$/i,
  handler,
  help: 'Keep a to-do list in WhatsApp (!todo add <text>)',
  usage: '!todo add <text> | !todo | !todo done <number> | !todo del <number> | !todo clear',
  example: '!todo add buy milk',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
