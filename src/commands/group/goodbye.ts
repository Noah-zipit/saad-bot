import { isAdmin } from '../../core/messageHandler.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { isGoodbyeGloballyEnabled, setGoodbyeGloballyEnabled } from '../../lib/globalFlags.js'

const handler = async (m: ParsedMessage, { sock, args, db }: CommandContext) => {
  // Owner-only GLOBAL kill switch — works in DM too, no group required.
  // Silences goodbye messages in every group on both bot instances.
  if (args[0]?.toLowerCase() === 'global') {
    if (!m.isOwner) {
      return m.reply('Only the bot owner can use the global goodbye switch.')
    }

    const sub = args[1]?.toLowerCase()

    if (sub === 'on') {
      await setGoodbyeGloballyEnabled(true)
      return m.reply('*Global Goodbye Enabled ✅*\n\nGoodbye messages are back on — each group\'s own !goodbye setting now decides.')
    }

    if (sub === 'off') {
      await setGoodbyeGloballyEnabled(false)
      return m.reply('*Global Goodbye Disabled ❌*\n\nThe bot will no longer say goodbye when members leave ANY group. Turn it back on with !goodbye global on.')
    }

    const enabled = await isGoodbyeGloballyEnabled()
    return m.reply(
      `*༺ GLOBAL GOODBYE SWITCH ༻*\n\n` +
      `*Status:* ${enabled ? 'Enabled ✅' : 'Disabled ❌'}\n\n` +
      `*Commands:*\n` +
      `!goodbye global on - goodbyes follow each group's own setting\n` +
      `!goodbye global off - silence goodbyes in ALL groups\n\n` +
      `_Owner only. Works from your DM with the bot._`
    )
  }

  // Check if in group
  if (!m.isGroup) {
    return m.reply(global.mess.only.group)
  }

  // Get group data
  const group = await db.getGroup(m.chat)
  const globalEnabled = await isGoodbyeGloballyEnabled()

  // If no arguments, show current goodbye settings
  if (args.length === 0) {
    const goodbyeStatus = group.settings.goodbye ? 'Enabled ✅' : 'Disabled ❌'

    const goodbyeText = `
*༺ FAREWELL MESSAGE SETTINGS ༻*

*Status (this group):* ${goodbyeStatus}
*Global switch:* ${globalEnabled ? 'Enabled ✅' : 'Disabled ❌ (owner turned goodbyes off everywhere)'}

*Current Farewell Message:*
"${group.goodbyeMessage}"

*Available Commands:*
!goodbye on - Enable farewell messages
!goodbye off - Disable farewell messages
!goodbye set [message] - Set custom farewell message

*Message Variables:*
{user} - Replaced with the leaving member's name

_Owner tip: !goodbye global off silences goodbyes in all groups at once._
`

    return m.reply(goodbyeText)
  }

  // Check if user is admin for changing settings
  const isUserAdmin = await isAdmin(m.sender, m.chat, sock)
  if (!isUserAdmin) {
    return m.reply(global.mess.only.admin)
  }

  try {
    // Handle different arguments
    if (args[0].toLowerCase() === 'on') {
      // Enable goodbye messages
      await db.updateGroup(m.chat, { 'settings.goodbye': true })
      return m.reply('*Farewell Messages Enabled*\n\nDeparting users will now receive a farewell message.')
    }

    if (args[0].toLowerCase() === 'off') {
      // Disable goodbye messages
      await db.updateGroup(m.chat, { 'settings.goodbye': false })
      return m.reply('*Farewell Messages Disabled*\n\nDeparting users will no longer receive a farewell message.')
    }

    if (args[0].toLowerCase() === 'set') {
      // Set custom goodbye message
      if (args.length < 2) {
        return m.reply('Please provide a farewell message to set!\n\nExample: /goodbye set Farewell, {user}. May your journey continue elsewhere.')
      }

      const newGoodbyeMessage = args.slice(1).join(' ')
      await db.updateGroup(m.chat, { goodbyeMessage: newGoodbyeMessage })

      return m.reply(`*Farewell Message Updated*\n\nNew farewell message:\n"${newGoodbyeMessage}"\n\n_"A proper farewell is as important as a proper greeting."_`)
    }

    // Invalid argument
    return m.reply('Invalid option. Use "!goodbye on", "!goodbye off", or "!goodbye set [message]"')

  } catch (error) {
    console.error('Error in goodbye command:', error)
    m.reply('Saad Bot encountered a error. The farewell setting command failed.')
  }
}

export default {
  pattern: /^(goodbye|farewell|leave)$/i,
  handler,
  help: 'Configure farewell messages (owner: !goodbye global on|off kills them everywhere)',
  usage: '!goodbye [on/off/set message]  •  owner: !goodbye global [on/off]',
  example: '!goodbye global off',
  tags: ['group'],
  group: true,
  admin: false,
  owner: false
}
