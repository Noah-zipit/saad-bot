// AI talkback via NVIDIA NIM — the fast model already verified for this
// bot: meta/llama-3.2-11b-vision-instruct (OpenAI-compatible chat API).
// Key handling: the key is read ONLY from the environment
// (NVIDIA_NIM_API_KEY, with NIM_API_KEY as a fallback). It is never
// hardcoded, never logged, and never written to any file by this code.
// Returns null when no key is set or the API call fails, so the caller
// falls back to the built-in local replies instead of breaking talkback.
import { getTalkbackHistory, appendTalkbackTurn } from './talkbackMemory.js'

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const MODEL = 'meta/llama-3.2-11b-vision-instruct'

export function isTalkbackAiConfigured(): boolean {
  return Boolean(process.env.NVIDIA_NIM_API_KEY || process.env.NIM_API_KEY)
}

/**
 * AI reply for a talkback message, with per-chat history so the bot
 * remembers the conversation. Returns null if AI is unavailable.
 */
export async function talkbackAiReply(chat: string, userText: string, pushName: string): Promise<string | null> {
  const key = process.env.NVIDIA_NIM_API_KEY || process.env.NIM_API_KEY
  if (!key) return null

  const history = await getTalkbackHistory(chat)
  const name = pushName && pushName !== 'Unknown' ? pushName : 'friend'
  try {
    const res = await fetch(NIM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        Accept: 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: `You are Saad Bot, a friendly WhatsApp bot chatting with ${name}. Reply in short, casual WhatsApp style: a few sentences at most, no long essays, no markdown tables. If asked what you can do, mention stickers, songs, polls and games, and suggest !menu for the full list.`
          },
          ...history.map((t) => ({ role: t.role, content: t.content })),
          { role: 'user', content: userText }
        ]
      })
    })
    if (!res.ok) {
      console.error(`[talkback-ai] NIM request failed: ${res.status}`)
      return null
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) return null
    const reply = text.slice(0, 1500)
    await appendTalkbackTurn(chat, userText, reply)
    return reply
  } catch (e) {
    console.error('[talkback-ai] request error:', e)
    return null
  }
}
