import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { unwrapViewOnceMessage } from '../../lib/viewOnce.js'

/**
 * !vv — reveal a view-once message.
 * Reply to a view-once photo, video or voice note and the bot re-sends it
 * here as a normal, viewable message.
 *
 * STAGED FIX (not live — needs Ashar's approval in main chat):
 * Some WhatsApp clients strip the view-once wrapper from the quoted copy
 * when you reply, leaving a bare photo/video/voice note. The old code only
 * recognised the wrapper shapes, so it answered with the help text even
 * though the user HAD replied to the right message. This version also
 * accepts bare quoted media, and tells the user exactly what went wrong
 * (no reply / reply is not media / download failed) instead of one
 * generic help text for all three cases.
 */

const BARE_MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage']

const handler = async (m: ParsedMessage, { sock }: CommandContext) => {
  const quoted = m.quoted

  if (!quoted) {
    m.reply(
      '*👁 !vv*\n\n' +
      'Send *!vv* as a *reply* to the view-once message — long-press it → Reply → send *!vv*.\n' +
      'Sent on its own, !vv has nothing to reveal.\n\n' +
      '_Tip: if the view-once was sent while the bot was in this chat, it should already have been re-sent here automatically._'
    )
    return
  }

  // Shape 1: proper view-once wrapper (viewOnceMessage / V2 / V2Extension).
  const vo = quoted.message ? unwrapViewOnceMessage(quoted.message as Record<string, any>) : undefined
  // Shape 2: wrapper stripped by the client in the quoted copy — bare media.
  const mediaType = vo?.type
    ?? (BARE_MEDIA_TYPES.includes(quoted.type) ? quoted.type : undefined)
  const mediaMsg = (vo?.message ?? quoted.message) as Record<string, any>

  if (!mediaType) {
    m.reply(
      '*👁 That message is not a view-once photo, video or voice note*\n\n' +
      'Reply to a *view-once* photo, video or voice note with *!vv* and I will show it here as a normal message.'
    )
    return
  }

  m.react('👁')

  const dl = await quoted.download?.()
  if (!dl) {
    m.reply(
      '*👁 Could not reveal that*\n\n' +
      'WhatsApp would not give me the media — it has probably expired, or it was already opened elsewhere.\n' +
      'Ask the sender to send it again (as view-once), then reply *!vv* quickly, before opening it.'
    )
    return
  }

  const kind = mediaType.replace('Message', '').toLowerCase()
  const note = `👁 *View-once revealed*\n_This ${kind} was view-once; shown here as a normal message._`

  if (mediaType === 'imageMessage') {
    await sock.sendMessage(m.chat, { image: dl.buffer, caption: note }, { quoted: m.message })
  } else if (mediaType === 'videoMessage') {
    await sock.sendMessage(m.chat, { video: dl.buffer, caption: note }, { quoted: m.message })
  } else {
    const innerAudio = mediaMsg.audioMessage ?? {}
    await sock.sendMessage(
      m.chat,
      { audio: dl.buffer, mimetype: innerAudio.mimetype || 'audio/ogg; codecs=opus', ptt: true },
      { quoted: m.message }
    )
    await sock.sendMessage(m.chat, { text: note }, { quoted: m.message })
  }
  console.log(`[vv] revealed ${kind} in ${m.chat}`)
}

export default {
  pattern: /^(vv|reveal|viewonce)$/i,
  handler,
  help: 'Reveal a view-once photo/video/voice note (reply to it with !vv)',
  usage: '!vv (reply to a view-once message)',
  tags: ['media'],
  group: false,
  admin: false,
  owner: false
}
