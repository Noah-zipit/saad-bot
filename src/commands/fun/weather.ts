import axios from 'axios'
import type { ParsedMessage, CommandContext } from '../../core/types.js'

/**
 * !weather <city> — current weather + today/tomorrow highs and lows.
 * Free wttr.in JSON API, no key, no new dependency (axios is already in).
 */

interface WttrNow {
  temp_C?: string
  feelsLikeC?: string
  humidity?: string
  windspeedKmph?: string
  weatherDesc?: { value: string }[]
}

interface WttrDay {
  date?: string
  mintempC?: string
  maxtempC?: string
  hourly?: { weatherDesc?: { value: string }[] }[]
}

interface WttrResponse {
  current_condition?: WttrNow[]
  nearest_area?: { areaName?: { value: string }[]; country?: { value: string }[] }[]
  weather?: WttrDay[]
}

const USAGE = 'Give a city name.\n\nExample: *!weather Lahore*'

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  const city = args.join(' ').trim()
  if (!city) return m.reply(USAGE)

  try {
    const res = await axios.get<WttrResponse>(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
      timeout: 15000,
      headers: { 'User-Agent': 'saad-bot' }
    })
    const now = res.data.current_condition?.[0]
    if (!now) return m.reply('Could not find weather for that place. Check the spelling and try again.')
    const area = res.data.nearest_area?.[0]
    const place = area?.areaName?.[0]?.value ?? city
    const country = area?.country?.[0]?.value ?? ''
    const desc = now.weatherDesc?.[0]?.value ?? ''
    const days = res.data.weather ?? []
    const dayLine = (d: WttrDay | undefined): string => {
      if (!d) return ''
      const cond = d.hourly?.[4]?.weatherDesc?.[0]?.value ?? d.hourly?.[0]?.weatherDesc?.[0]?.value ?? ''
      return `${d.date} — ${cond}, ${d.mintempC}°C to ${d.maxtempC}°C`
    }

    let text = `*🌤️ WEATHER — ${place}${country ? `, ${country}` : ''}*\n\n`
    text += `*Now:* ${desc}\n`
    text += `🌡️ ${now.temp_C}°C (feels ${now.feelsLikeC}°C)\n`
    text += `💧 Humidity ${now.humidity}%  •  💨 Wind ${now.windspeedKmph} km/h`
    if (days[0]) text += `\n\n*Today:* ${dayLine(days[0])}`
    if (days[1]) text += `\n*Tomorrow:* ${dayLine(days[1])}`
    return m.reply(text)
  } catch (error) {
    console.error('Error in weather command:', error)
    return m.reply('Weather service is not reachable right now. Try again in a bit.')
  }
}

export default {
  pattern: /^(weather|mausam)$/i,
  handler,
  help: 'Current weather for a city (!weather Lahore)',
  usage: '!weather <city>',
  example: '!weather Lahore',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
