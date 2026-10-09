import { Sticker } from 'wa-sticker-formatter'
import { fileTypeFromBuffer } from 'file-type'
import type { ParsedMessage, CommandContext, MediaDownloadResult } from '../../core/types.js'
import { getStickerDefaults, setStickerDefaults, clearStickerDefaults, parseNameArgs, rawArgsText } from '../../lib/stickerNames.js'

/**
 * Save your own sticker pack/author names once, and every !sticker / !gif
 * you make after that carries them.
 *
 * Usage:
 *   !setname My Pack | Ashar        save pack + author names
 *   !setname My Pack, Ashar         comma also works
 *   !setname My Pack                pack only (author stays as saved)
 *   !setname                        show your current names
 *   !setname reset                  go back to the default names
 */
const handler = async (m: ParsedMessage, { db }: CommandContext) => {
  try {
    const dataDir = (db as unknown as { dataDir?: string }).dataDir || process.env.DATA_DIR || 'data'
    const text = rawArgsText(m.body, m.prefix)

    if (!text) {
      const saved = getStickerDefaults(dataDir, m.sender)
      return m.reply(
        `*Your sticker names*\n\nPack: *${saved.pack}*\nAuthor: *${saved.author}*\n\n` +
        `Change them with:\n!setname <pack> | <author>\n` +
        `Example: !setname Funny Pack | Ashar`
      )
    }

    if (/^(reset|clear|default)$/i.test(text.trim())) {
      const had = clearStickerDefaults(dataDir, m.sender)
      return m.reply(
        had
          ? 'Sticker names reset to the defaults (*Saad Bot*).'
          : 'You had no custom names saved — already on the defaults.'
      )
    }

    const { pack, author } = parseNameArgs(text)
    if (!pack) {
      return m.reply('Usage: !setname <pack> | <author>\nExample: !setname Funny Pack | Ashar')
    }

    const previous = getStickerDefaults(dataDir, m.sender)
    const newPack = pack.slice(0, 60)
    const newAuthor = (author || previous.author).slice(0, 60)
    setStickerDefaults(dataDir, m.sender, newPack, newAuthor)

    return m.reply(
      `Saved. Your stickers will now carry:\n\nPack: *${newPack}*\nAuthor: *${newAuthor}*\n\n` +
      `Use !setname reset to go back to defaults.`
    )
  } catch (error) {
    console.error('Error in setname:', error)
    m.reply('Could not save your sticker names. Try again.')
  }
}

export default {
  pattern: /^(setname|stickerset|stickername|setpack)$/i,
  handler,
  help: 'Save your own sticker pack/author names (!setname My Pack | Ashar)',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
