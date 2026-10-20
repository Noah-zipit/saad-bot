import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { unwrapViewOnceMessage } from '../../lib/viewOnce.js'

/**
 * !vv — reveal a view-once message.
 * Reply to a view-once photo, video or voice note and the bot re-sends it
 * here as a normal, viewable message.
 */
const handler = async (m: ParsedMessage, { sock }: CommandContext) => {
  const quotedMsg = m.quoted?.message as Record<string, any> | undefined
  const vo = quotedMsg ? unwrapViewOnceMessage(quotedMsg) : undefined

  if (!vo) {
    m.reply(
      '*👁 !vv*\n\n' +
      'Reply to a *view-once* photo, video or voice note with *!vv* and I will show it here as a normal message.\n\n' +
      '_Example: long-press the view-once message → Reply → send *!vv*_'
    )
    return
  }

  m.react('👁')

  const dl = await m.quoted?.download?.()
  if (!dl) {
    m.reply(
      '*👁 Could not reveal that*\n\n' +
      'WhatsApp would not give me the media — it has probably expired, or it was already opened elsewhere.\n' +
      'Ask the sender to send it again (as view-once), then reply *!vv* quickly.'
    )
    return
  }

  const kind = vo.type.replace('Message', '').toLowerCase()
  const note = `👁 *View-once revealed*\n_This ${kind} was view-once; shown here as a normal message._`

  if (vo.type === 'imageMessage') {
    await sock.sendMessage(m.chat, { image: dl.buffer, caption: note }, { quoted: m.message })
  } else if (vo.type === 'videoMessage') {
    await sock.sendMessage(m.chat, { video: dl.buffer, caption: note }, { quoted: m.message })
  } else {
    const innerAudio = (vo.message as Record<string, any>).audioMessage ?? {}
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
