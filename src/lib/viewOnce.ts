/**
 * View-once message unwrapping.
 *
 * WhatsApp delivers view-once photos/videos/voice notes wrapped in
 * viewOnceMessage / viewOnceMessageV2 / viewOnceMessageV2Extension.
 * In chats with disappearing messages turned ON there is an extra
 * ephemeralMessage wrapper around the whole thing — without peeling it,
 * view-once detection silently misses every message (this is why the
 * auto-save hook appeared to do nothing).
 *
 * Returns the inner media payload shaped for Baileys' downloadMediaMessage,
 * or undefined when the message is not view-once media.
 */

const VIEW_ONCE_WRAPPERS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']

export const VIEW_ONCE_MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage']

export interface UnwrappedViewOnce {
  /** inner media type: 'imageMessage' | 'videoMessage' | 'audioMessage' */
  type: string
  /** { [type]: innerMediaMessage } — pass straight to downloadMediaMessage */
  message: Record<string, any>
}

export function unwrapViewOnceMessage(
  msg: Record<string, any> | undefined | null
): UnwrappedViewOnce | undefined {
  let cur: any = msg
  let guard = 0
  while (cur && typeof cur === 'object' && guard++ < 5) {
    const keys = Object.keys(cur)
    if (keys.length === 0) return undefined
    const t = keys[0]
    if (t === 'ephemeralMessage') {
      cur = cur.ephemeralMessage?.message
      continue
    }
    if (VIEW_ONCE_WRAPPERS.includes(t)) {
      const wrapped = (cur[t]?.message ?? {}) as Record<string, any>
      const innerType = Object.keys(wrapped)[0] ?? ''
      if (!innerType || !VIEW_ONCE_MEDIA_TYPES.includes(innerType)) return undefined
      return { type: innerType, message: { [innerType]: wrapped[innerType] } }
    }
    return undefined
  }
  return undefined
}
