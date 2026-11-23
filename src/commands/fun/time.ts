import type { ParsedMessage, CommandContext } from '../../core/types.js'

/**
 * !time <city> — current local time in any city.
 * Free Open-Meteo geocoding (no key) resolves the city to an IANA
 * timezone; the time is then formatted with Intl, no new dependency.
 */

interface GeoResult {
  name?: string
  country?: string
  timezone?: string
}

interface GeoResponse {
  results?: GeoResult[]
}

const handler = async (m: ParsedMessage, { args }: CommandContext) => {
  const city = args.join(' ').trim()
  if (!city) return m.reply('Give a city name.\n\nExample: *!time Tokyo*')

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.org/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) throw new Error(`geocoding HTTP ${res.status}`)
    const data = (await res.json()) as GeoResponse
    const place = data.results?.[0]
    if (!place?.timezone) return m.reply('Could not find that city. Check the spelling and try again.')

    const now = new Date()
    const time = now.toLocaleString('en-GB', {
      timeZone: place.timezone,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
    const offset = new Intl.DateTimeFormat('en-GB', {
      timeZone: place.timezone,
      timeZoneName: 'shortOffset'
    }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? ''

    return m.reply(
      `*🕐 TIME — ${place.name}${place.country ? `, ${place.country}` : ''}*\n\n${time}\n_${place.timezone} (${offset})_`
    )
  } catch (error) {
    console.error('Error in time command:', error)
    return m.reply('Time service is not reachable right now. Try again in a bit.')
  }
}

export default {
  pattern: /^(time|timezone|clock)$/i,
  handler,
  help: 'Current local time in a city (!time Tokyo)',
  usage: '!time <city>',
  example: '!time Tokyo',
  tags: ['fun'],
  group: false,
  admin: false,
  owner: false
}
