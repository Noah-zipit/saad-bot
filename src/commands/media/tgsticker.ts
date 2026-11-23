import { Sticker } from 'wa-sticker-formatter'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { getStickerDefaults, hasCustomStickerNames } from '../../lib/stickerNames.js'
import { makeAnimatedSticker, addStickerMetadata, validateAnimatedSticker } from '../../lib/animatedSticker.js'
import { getProgress, saveProgress, clearProgress } from '../../lib/tgstickerProgress.js'

const MAX_STICKERS = 10
const TELEGRAM_FILE_URL = 'https://api.telegram.org/file/bot'

/**
 * Fetch with retries — api.telegram.org occasionally goes slow or drops
 * requests (seen 2026-10-15: HeadersTimeoutError on both attempts), so a
 * single timeout must not kill the whole pack download.
 */
async function tgFetch(url: string, label: string): Promise<Response> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60_000)
    try {
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      return res
    } catch (e) {
      clearTimeout(timer)
      lastError = e
      console.error(`tgsticker: ${label} attempt ${attempt} failed`, (e as Error)?.message || e)
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 3000))
    }
  }
  throw lastError
}

/**
 * Download a Telegram sticker pack as WhatsApp stickers, 10 per batch.
 * Usage:
 *   !tgsticker <link>         — first batch, or continue where you left off
 *   !tgsticker <link> next    — next 10 after the last batch
 *   !tgsticker <link> 2       — jump straight to batch 2 (sticks 11–20)
 *   !tgsticker <link> reset   — start over from the first sticker
 * Requires TELEGRAM_BOT_TOKEN in the environment (any bot from @BotFather works).
 */
const handler = async (m: ParsedMessage, { sock, args, db }: CommandContext) => {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return m.reply(
      `*Telegram sticker download isn't configured yet, Sir.*\n\n` +
      `It needs a Telegram bot token (any bot made with @BotFather works):\n` +
      `1. Open Telegram and message @BotFather → /newbot\n` +
      `2. Copy the token it gives you\n` +
      `3. Ask Eviee to add TELEGRAM_BOT_TOKEN=<the token> to the bot's environment\n\n` +
      `Once that's set, use: !tgsticker <sticker pack link>`
    )
  }

  const input = (args[0] || '').trim()
  if (!input) {
    return m.reply(
      `*Usage:* !tgsticker <telegram sticker pack link> [next | page number | reset]\n\n` +
      `Example: !tgsticker https://t.me/addstickers/MyFavoritePack\n` +
      `You can also pass just the pack name: !tgsticker MyFavoritePack\n\n` +
      `Packs come in batches of ${MAX_STICKERS}. Run the command again (same link)\n` +
      `for the next batch, or use !tgsticker <link> 2 for a specific batch.`
    )
  }

  // Extract the pack name from a t.me/addstickers/<name> link or use the raw input
  let packName = input
  const linkMatch = input.match(/(?:t\.me\/addstickers\/|t\.me\/)([A-Za-z0-9_]+)/i)
  if (linkMatch) packName = linkMatch[1]

  const dataDir = (db as unknown as { dataDir?: string }).dataDir || process.env.DATA_DIR || 'data'

  // --- Pagination: default = continue where this user left off on this pack.
  // Re-running with the same link no longer re-sends the first 10.
  const pageArg = (args[1] || '').trim().toLowerCase()
  let startOffset = 0
  if (pageArg === 'reset') {
    clearProgress(dataDir, m.sender, packName)
    startOffset = 0
  } else if (/^\d+$/.test(pageArg)) {
    startOffset = (Math.max(1, parseInt(pageArg, 10)) - 1) * MAX_STICKERS
  } else {
    // "next" or no page arg: pick up from the saved position, if any.
    const saved = getProgress(dataDir, m.sender, packName)
    if (saved) startOffset = saved.offset
  }

  try {
    await m.reply(global.mess.wait)

    // 1. Fetch the sticker set metadata
    const setRes = await tgFetch(`https://api.telegram.org/bot${token}/getStickerSet?name=${encodeURIComponent(packName)}`, 'getStickerSet')
    const setData = await setRes.json() as { ok: boolean; description?: string; result?: { name: string; title: string; stickers: any[] } }
    if (!setData.ok || !setData.result) {
      return m.reply(
        `Couldn't find that sticker pack. ${setData.description || 'Check the link and try again.'}`
      )
    }

    const { title, stickers } = setData.result
    if (!stickers || stickers.length === 0) {
      return m.reply('That sticker pack appears to be empty.')
    }

    // Pack changed size (or the whole pass finished): clamp to what's left.
    if (startOffset >= stickers.length) {
      clearProgress(dataDir, m.sender, packName)
      return m.reply(
        `You already got the whole pack — all ${stickers.length} stickers were sent earlier. ` +
        `Run the command again to start over from the first one.`
      )
    }

    // 2. Resolve file paths (Telegram downloads require the bot token)
    const targets = stickers.slice(startOffset, startOffset + MAX_STICKERS)
    const resolved: { fileId: string; url: string; animated: boolean; ext: string }[] = []
    for (const st of targets) {
      const fileId = st.file_id as string
      const isAnimated = st.is_animated === true || st.is_video === true
      const fileRes = await tgFetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, 'getFile')
      const fileData = await fileRes.json() as { ok: boolean; result?: { file_path: string } }
      if (fileData.ok && fileData.result?.file_path) {
        const filePath = fileData.result.file_path
        const ext = (filePath.split('.').pop() || 'webm').toLowerCase()
        resolved.push({ fileId, url: `${TELEGRAM_FILE_URL}${token}/${filePath}`, animated: isAnimated, ext })
      }
    }

    if (resolved.length === 0) {
      return m.reply('Failed to download any stickers from that pack. Try again later.')
    }

    const batchStart = startOffset + 1
    const batchEnd = startOffset + resolved.length
    const batchNo = Math.floor(startOffset / MAX_STICKERS) + 1
    await m.reply(`*Pack:* ${title}\nBatch ${batchNo} — stickers ${batchStart}–${batchEnd} of ${stickers.length}.\nTap any sticker and star it to add it to your WhatsApp collection ⭐`)

    // Sticker branding: honor his saved !setname names (per-sender, or the
    // global `!setname all` override). If he never saved names, keep the
    // Telegram pack title + a neutral author line.
    let packNameLabel: string
    let authorLabel: string
    if (hasCustomStickerNames(dataDir, m.sender)) {
      const saved = getStickerDefaults(dataDir, m.sender)
      packNameLabel = saved.pack
      authorLabel = saved.author
    } else {
      packNameLabel = title.slice(0, 60) || 'Telegram Pack'
      authorLabel = 'Telegram → WhatsApp'
    }

    // 3. Download + convert each sticker and send it
    let sent = 0
    let failed = 0
    for (const file of resolved) {
      try {
        const dl = await tgFetch(file.url, 'sticker file download')
        if (!dl.ok) continue
        const buffer = Buffer.from(await dl.arrayBuffer())

        let stickerBuffer: Buffer
        if (file.animated && file.ext !== 'tgs') {
          // Video stickers: route through the purpose-built animated encoder.
          // wa-sticker-formatter's video path emits multi-MB webps, which
          // WhatsApp rejects (animated ceiling ~500KB); the ladder below
          // keeps the output playable.
          stickerBuffer = await makeAnimatedSticker(buffer, '.' + file.ext)
          stickerBuffer = await addStickerMetadata(stickerBuffer, {
            id: `${Date.now()}-${file.fileId}`,
            pack: packNameLabel,
            author: authorLabel,
            emojis: ['🌸']
          })
          // 2026-11-03 Telegram flicker fix: never send a sticker the
          // phone cannot display cleanly — a failed encode used to go
          // out anyway and show up blinking/static. Skip it and count
          // it, so the Done message says so instead of silently short.
          const check = validateAnimatedSticker(stickerBuffer)
          if (!check.ok || stickerBuffer.length > 512 * 1024) {
            console.error(`tgsticker: skipping unplayable animated sticker (${check.reason || 'oversize'})`)
            failed++
            continue
          }
        } else {
          const sticker = new Sticker(buffer, {
            pack: packNameLabel,
            author: authorLabel,
            type: file.animated ? 'full' : 'default',
            categories: ['🌸'],
            id: `${Date.now()}-${file.fileId}`,
            quality: 70
          } as any)
          stickerBuffer = await sticker.toBuffer()
        }

        await sock.sendMessage(m.chat, { sticker: stickerBuffer })
        sent++
        // small delay to avoid flooding
        await new Promise(r => setTimeout(r, 800))
      } catch (e) {
        console.error('tgsticker: failed on one sticker', e)
      }
    }

    // 4. Save progress so the next run continues with the NEXT batch —
    // the old bug (always re-sending 0–9) is what this removes.
    const nextOffset = startOffset + MAX_STICKERS
    const moreLeft = nextOffset < stickers.length
    if (moreLeft) {
      saveProgress(dataDir, m.sender, packName, nextOffset, stickers.length)
    } else {
      clearProgress(dataDir, m.sender, packName)
    }

    const totalNote = moreLeft
      ? `\n\n_${stickers.length - nextOffset} left in the pack. Run the same command again (or !tgsticker <link> next) for the next ${MAX_STICKERS} — no more repeats._`
      : `\n\n_That was the whole pack — all ${stickers.length} stickers delivered._`

    const failedNote = failed > 0
      ? `\n\n_${failed} sticker${failed === 1 ? '' : 's'} in this batch would not play cleanly, so I skipped ${failed === 1 ? 'it' : 'them'} instead of sending a blinking one. Re-run the same batch with reset if you want to retry ${failed === 1 ? 'it' : 'them'}._`
      : ''

    await m.reply(
      `*Done.* Sent ${sent} sticker${sent === 1 ? '' : 's'} from *${title}* (stickers ${batchStart}–${batchEnd}).\n` +
      `They carry your pack name — *${packNameLabel}* by *${authorLabel}*.\n\n` +
      `To add them to your WhatsApp sticker collection, tap a sticker → Add to favorites ⭐.${totalNote}${failedNote}`
    )
  } catch (error) {
    console.error('Error in tgsticker command:', error)
    m.reply(
      'Saad Bot couldn\'t reach Telegram just now (its servers are being slow). ' +
      'Try the command again in a minute — I retry a few times automatically before giving up.'
    )
  }
}

export default {
  pattern: /^(tgsticker|telegramsticker|tgs|stickpack|packsticker)$/i,
  handler,
  help: 'Download Telegram sticker pack as WhatsApp stickers (10 per batch)',
  usage: '!tgsticker <telegram sticker link> [next | page | reset]',
  example: '!tgsticker https://t.me/addstickers/MyFavoritePack next',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
