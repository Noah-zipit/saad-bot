import { formatTime, formatSize } from '../../core/utils.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import os from 'node:os'

const handler = async (m: ParsedMessage, { sock, db }: CommandContext) => {
  try {
    // React to message
    m.react('🖥️')

    // Get system info
    const cpu = os.cpus()[0]?.model || 'Unknown'
    const cpuCores = os.cpus().length
    const totalMemory = formatSize(os.totalmem())
    const freeMemory = formatSize(os.freemem())
    const usedMemory = formatSize(os.totalmem() - os.freemem())
    const memoryUsage = Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
    const platform = os.platform()
    const release = os.release()
    const arch = os.arch()
    const hostname = os.hostname()

    // Get process info
    const processMemory = formatSize(process.memoryUsage().heapUsed)
    const uptime = formatTime(process.uptime())

    // Get database stats
    const users = await db.getSetting('users') || {}
    const groups = await db.getSetting('groups') || {}
    const stats = await db.getSetting('stats') || { commands: 0, messages: 0, uptime: Date.now() }
    const lidmapCount = Object.keys(await db.getSetting('lidmap') || {}).length

    // Get commands count
    const totalCommands = Object.keys(global.plugins).length

    // Get connection info
    const connectionInfo = sock.user ? 'Connected ✅' : 'Disconnected ❌'

    // Format bot statistics
    const botStats = `
*༺ SAAD BOT STATISTICS ༻*

*🤖 Bot Information:*
*Name:* ${global.botname}
*Version:* 2.0.0
*Prefix:* ${global.prefix}
*Owner:* ${global.owner.map(o => `${o[1]} (${o[0]})`).join(', ')}
*Uptime:* ${uptime}
*Process Uptime:* ${uptime}
*Connection:* ${connectionInfo}
*Total Commands:* ${totalCommands}

*📊 Database Statistics:*
*Users:* ${Object.keys(users).length}
*Groups:* ${Object.keys(groups).length}
*LID mappings:* ${lidmapCount}
*Commands Used:* ${stats.commands || 0}
*Messages Received:* ${stats.messages || 0}

*🖥️ System Information:*
*Platform:* ${platform} (${arch})
*OS Release:* ${release}
*Hostname:* ${hostname}
*CPU:* ${cpu}
*CPU Cores:* ${cpuCores}

*💾 Memory Information:*
*Total Memory:* ${totalMemory}
*Free Memory:* ${freeMemory}
*Used Memory:* ${usedMemory} (${memoryUsage}%)
*Bot Memory Usage:* ${processMemory}

*🌐 Network Information:*
*Connection Type:* WhatsApp Web
*Status:* ${connectionInfo}

_"Understanding one's system is the first step toward mastery."_
`

    // Send bot statistics
    m.reply(botStats)

  } catch (error) {
    console.error('Error in botstat command:', error)
    m.reply('Saad Bot encountered a error while gathering statistics.')
  }
}

export default {
  pattern: /^(botstat|stats|status|info)$/i,
  handler,
  help: 'View detailed bot statistics and system information',
  tags: ['owner'],
  group: false,
  admin: false,
  owner: true
}
