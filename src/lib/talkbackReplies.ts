// Talkback reply engine — small, built-in small-talk. No external API, no
// key, no cost, works offline. This is deliberately NOT a full AI chat:
// it answers greetings and common questions and keeps the conversation
// moving. A real LLM chat would need an API key and is a separate feature
// (needs Ashar's approval, like every live change).
const FALLBACKS = [
  'Hmm, interesting. Tell me more.',
  'Got it. What else is on your mind?',
  'Fair enough. Anything I can help with? Try *!menu* for what I can do.',
  'Noted. I am still learning the art of conversation.',
  'Ha, good one. What else?',
]

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

/** Short conversational reply for a plain-text message. */
export function talkbackReply(text: string, pushName: string): string {
  const name = pushName && pushName !== 'Unknown' ? pushName : 'friend'
  const t = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()

  if (/\b(assalam|salam)\b/.test(t)) return `Wa alaikum assalam, ${name}. Kya haal hai?`
  if (/\b(good morning|subah bakhair)\b/.test(t)) return `Good morning, ${name}. Have a great day.`
  if (/\b(good night|shab bakhair|allah hafiz|bye|khuda hafiz)\b/.test(t)) return `Allah hafiz, ${name}. Take care.`
  if (/\b(hello|hi|hey|aoa|yo)\b/.test(t)) return `Hey ${name}. Good to hear from you.`
  if (/\b(how are you|kese ho|kya haal|how r u|kaisay ho)\b/.test(t)) return 'I am doing great, thanks for asking. How about you?'
  if (/\b(thank|shukriya|shukran)\b/.test(t)) return 'Anytime. Happy to help.'
  if (/\b(who are you|tum kon|ap kon|your name|tera naam)\b/.test(t)) return 'I am Saad Bot, your friendly WhatsApp bot. Type *!menu* to see everything I can do.'
  if (/\b(what can you do|menu|help|commands)\b/.test(t)) return 'I can make stickers, download songs and reels, run polls, and lots more. Type *!menu* for the full list.'
  if (/\b(joke|funny|hasao)\b/.test(t)) return 'Why did the developer go broke? Because he used up all his cache.'
  if (/\b(love you|i love you)\b/.test(t)) return 'Aww, that is sweet. I like you too, in a strictly bot-like way.'
  if (/\b(bored|boring|bore)\b/.test(t)) return 'Bored? Try *!joke*, *!quote*, or *!ttt* for a game of tic-tac-toe.'
  if (/\b(good|great|nice|awesome|zabardast|wah)\b/.test(t)) return 'Glad you think so.'
  if (/\b(sad|upset|tired|thak)\b/.test(t)) return 'Hang in there. Better days are ahead, and I am here if you want to talk.'

  return FALLBACKS[hash(t) % FALLBACKS.length]
}
