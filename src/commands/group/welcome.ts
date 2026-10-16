import { isAdmin } from '../../core/messageHandler.js'
import type { ParsedMessage, CommandContext } from '../../core/types.js'
import { isWelcomeGloballyEnabled, setWelcomeGloballyEnabled } from '../../lib/globalFlags.js'

const handler = async (m: ParsedMessage, { sock, args, db }: CommandContext) => {
  // Owner-only GLOBAL kill switch — works in DM too, no group required.
  // Silences welcome messages in every group on both bot instances.
  if (args[0]?.toLowerCase() === 'global') {
    if (!m.isOwner) {
      return m.reply('Only the bot owner can use the global welcome switch.')
    }

    const sub = args[1]?.toLowerCase()

    if (sub === 'on') {
      await setWelcomeGloballyEnabled(true)
      return m.reply('*Global Welcome Enabled ✅*\n\nWelcome messages are back on — each group\'s own /welcome setting now decides.')
    }

    if (sub === 'off') {
      await setWelcomeGloballyEnabled(false)
      return m.reply('*Global Welcome Disabled ❌*\n\nThe bot will no longer greet newly added members in ANY group. Turn it back on with /welcome global on.')
    }

    const enabled = await isWelcomeGloballyEnabled()
    return m.reply(
      `*༺ GLOBAL WELCOME SWITCH ༻*\n\n` +
      `*Status:* ${enabled ? 'Enabled ✅' : 'Disabled ❌'}\n\n` +
      `*Commands:*\n` +
      `/welcome global on - welcomes follow each group's own setting\n` +
      `/welcome global off - silence welcomes in ALL groups\n\n` +
      `_Owner only. Works from your DM with the bot._`
    )
  }

  // Check if in group
  if (!m.isGroup) {
    return m.reply(global.mess.only.group)
  }

  // Get group data
  const group = await db.getGroup(m.chat)
  const globalEnabled = await isWelcomeGloballyEnabled()

  // If no arguments, show current welcome settings
  if (args.length === 0) {
    const welcomeStatus = group.settings.welcome ? 'Enabled ✅' : 'Disabled ❌'

    const welcomeText = `
*༺ WELCOME MESSAGE SETTINGS ༻*

*Status (this group):* ${welcomeStatus}
*Global switch:* ${globalEnabled ? 'Enabled ✅' : 'Disabled ❌ (owner turned welcomes off everywhere)'}

*Current Welcome Message:*
"${group.welcomeMessage}"

*Available Commands:*
/welcome on - Enable welcome messages
/welcome off - Disable welcome messages
/welcome set [message] - Set custom welcome message

*Message Variables:*
{user} - Replaced with the joining member's name

_Owner tip: /welcome global off silences welcomes in all groups at once._
`

    return m.reply(welcomeText)
  }

  // Check if user is admin for changing settings
  const isUserAdmin = await isAdmin(m.sender, m.chat, sock)
  if (!isUserAdmin) {
    return m.reply(global.mess.only.admin)
  }

  try {
    // Handle different arguments
    if (args[0].toLowerCase() === 'on') {
      // Enable welcome messages
      await db.updateGroup(m.chat, { 'settings.welcome': true })
      return m.reply('*Welcome Messages Enabled*\n\nNew users will now be greeted upon joining this group.')
    }

    if (args[0].toLowerCase() === 'off') {
      // Disable welcome messages
      await db.updateGroup(m.chat, { 'settings.welcome': false })
      return m.reply('*Welcome Messages Disabled*\n\nNew users will no longer be greeted upon joining.')
    }

    if (args[0].toLowerCase() === 'set') {
      // Set custom welcome message
      if (args.length < 2) {
        return m.reply('Please provide a welcome message to set!\n\nExample: /welcome set Welcome to Saad Bot, {user}!')
      }

      const newWelcomeMessage = args.slice(1).join(' ')
      await db.updateGroup(m.chat, { welcomeMessage: newWelcomeMessage })

      return m.reply(`*Welcome Message Updated*\n\nNew welcome message:\n"${newWelcomeMessage}"`)
    }

    // Invalid argument
    return m.reply('Invalid option. Use "!welcome on", "!welcome off", or "!welcome set [message]"')

  } catch (error) {
    console.error('Error in welcome command:', error)
    m.reply('Saad Bot encountered a error. The welcome setting command failed.')
  }
}

export default {
  pattern: /^(welcome|greeting)$/i,
  handler,
  help: 'Configure welcome messages (owner: /welcome global on|off kills them everywhere)',
  usage: '!welcome [on/off/set message]  •  owner: /welcome global [on/off]',
  example: '!welcome off',
  tags: ['group'],
  group: true,
  admin: false,
  owner: false
}
