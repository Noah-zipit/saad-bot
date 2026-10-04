<h1 align="center">Saad Bot</h1>

<p align="center">
  <img src="asset/logo.jpg" alt="Saad Bot logo" width="240" />
</p>

<p align="center">
  A self-hosted WhatsApp bot built with TypeScript and
  <a href="https://github.com/WhiskeySockets/Baileys">Baileys</a>.
</p>

<p align="center">
  <a href="package.json">
    <img src="https://img.shields.io/badge/license-MIT-2E8B57?style=for-the-badge" alt="License: MIT" />
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&style=for-the-badge" alt="Node.js 20 or newer" />
  </a>
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&style=for-the-badge" alt="TypeScript 5" />
  </a>
  <a href="https://github.com/WhiskeySockets/Baileys">
    <img src="https://img.shields.io/badge/WhatsApp-Baileys-25D366?logo=whatsapp&style=for-the-badge" alt="WhatsApp via Baileys" />
  </a>
</p>

Saad Bot brings group administration, community utilities, entertainment and media commands together in one WhatsApp bot. It includes a browser-based phone-number pairing page, a terminal QR fallback, local JSON data storage and identity handling for WhatsApp's LID and phone-number JID formats.

## Disclaimer

Use Saad Bot responsibly and in compliance with WhatsApp's terms and the laws that apply to you. Get appropriate consent before adding the bot to a group or contacting people, respect other users' privacy and do not use it to spam, harass or send unwanted content.

> [!CAUTION]
> WhatsApp may restrict or suspend accounts that violate its terms. Use the bot at your own risk. The maintainers are not responsible for account actions or other consequences resulting from its use.

## Why Saad Bot?

Saad Bot combines everyday group tools and entertainment in one self-hosted bot:

- Link WhatsApp from a browser with a phone-number pairing code or use the terminal QR.
- Manage group settings and members with commands organized by category.
- Keep bot data and authentication on your own machine or persistent host.
- Resolve WhatsApp LID and phone-number identities consistently for mentions and user records.
- Extend the command set with small TypeScript plugins.

## Features

- **Group administration:** moderation commands, rules, welcome and goodbye messages and member tagging.
- **Member and bot management:** warnings, bans, premium status, bot statistics and owner controls.
- **Fun commands:** jokes, riddles, stories, challenges and other chat activities.
- **Media tools:** stickers, image utilities, social-media downloaders and song search.
- **WhatsApp linking page:** request a pairing code in a browser, with terminal QR pairing available as a fallback.
- **LID/JID identity resolution:** use phone-number identities when WhatsApp provides a LID, including for mentions, user records and moderation.
- **Local persistence:** JSON files for user, group, settings and identity-map data; no MongoDB service required.
- **Plugin-based commands:** add command modules under `src/commands` and the loader discovers them at startup.

## Requirements

- Node.js 20 or newer and npm
- Git
- A WhatsApp account to link to the bot
- A stable internet connection

Verify the runtime and Git before continuing:

```bash
node --version
npm --version
git --version
```

Docker is an alternative to installing Node.js locally. Media downloads may depend on third-party services and AI video generation requires its own API key.

## Quick start

### 1. Get the source and install packages

```bash
git clone https://github.com/Noah-zipit/saad-bot.git
cd saad-bot
npm install
```

### 2. Configure the bot

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Set at least the command prefix and the owner number(s). The `OWNER` value uses the format `number|name`; separate multiple owners with commas:

```env
BOT_NAME=Saad Bot
OWNER_NAME=Bot Owner
PREFIX=!
OWNER=15551234567|Bot Owner
WEB_PORT=3000
WEB_HOST=127.0.0.1
```

Use a country-code phone number containing digits only (no `+` sign). See [Configuration](#configuration) for all supported settings.

### 3. Start the bot

```bash
npm start
```

The bot prints a terminal QR code and starts a linking page at `http://localhost:3000` by default. Choose either linking method below.

### 4. Link WhatsApp

**Using the browser page:**

1. Open `http://localhost:3000`.
2. Enter the WhatsApp number with its country code, using digits only.
3. Select **Get pairing code**.
4. On the phone, open WhatsApp → **Settings** → **Linked devices** → **Link a device** → **Link with phone number instead**, then enter the code.

**Using the terminal QR:** open WhatsApp → **Settings** → **Linked devices** → **Link a device**, then scan the QR printed in the terminal.

The linked-device session is saved in `./sessions/` and reused on later starts. Keep that directory private: it contains credentials for the linked WhatsApp account.

## Pairing server

The built-in HTTP server serves the pairing page and these endpoints:

| Method | Path          | Purpose                          |
| ------ | ------------- | -------------------------------- |
| `GET`  | `/`           | Phone-number pairing page        |
| `GET`  | `/api/status` | Check whether WhatsApp is linked |
| `POST` | `/api/pair`   | Request a WhatsApp pairing code  |
| `POST` | `/api/send`   | Send a text message from the bot |

> [!WARNING]
> The pairing server has no authentication. In particular, `/api/send` can send WhatsApp messages without an access check. It binds to `127.0.0.1` by default; setting `WEB_HOST=0.0.0.0` makes it reachable on the network. Do not expose it publicly as-is. If remote pairing is required, restrict access with a trusted network or an authenticated reverse proxy and block public access to `/api/send`.

## Configuration

Saad Bot loads `.env` at startup. Defaults shown below are used when a setting is omitted.

| Variable         | Description                                                             | Default                    |
| ---------------- | ----------------------------------------------------------------------- | -------------------------- |
| `BOT_NAME`       | Display name used by the bot                                            | `Saad Bot`                 |
| `OWNER_NAME`     | Display name for the owner                                              | `Noah`                     |
| `PREFIX`         | Prefix used to invoke commands                                          | `!`                        |
| `OWNER`          | Comma-separated owner entries in `number\|name` format                  | Built-in owner entry       |
| `WEB_PORT`       | Port for the pairing page; `PORT` is used if this is unset              | `3000`                     |
| `WEB_HOST`       | Address used by the pairing page                                        | `127.0.0.1`                |
| `SESSION_DIR`    | Directory for the WhatsApp authentication session                       | `./sessions`               |
| `DATA_DIR`       | Directory for JSON application data                                     | `./data`                   |
| `SESSION_DATA`   | Optional base64 session payload to restore when no local session exists | Unset                      |
| `GEMINI_API_KEY` | Billing-enabled Gemini API key used by `!createvid`                     | Unset                      |
| `VEO_MODEL`      | Gemini Veo model used for video generation                              | `veo-3.1-generate-preview` |
| `JIOSAAVN_API`   | Base URL for the JioSaavn API used by `!play`                           | `http://127.0.0.1:3100`    |

For local use, leave `WEB_HOST=127.0.0.1` so the pairing page is only reachable from the same machine. In Docker or a hosted environment, set `WEB_HOST=0.0.0.0` so the platform can reach it and use its assigned port through `PORT` or `WEB_PORT`.

## Commands

There are 44 command modules across six categories. Use `!menu` for the live command list and `!help <command>` for command details. Replace `!` below if you configured a different prefix.

| Category | Commands                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Basic    | `!help`, `!info`, `!menu`, `!ping`, `!profile`                                                                       |
| Admin    | `!ban`, `!demote`, `!kick`, `!mute`, `!promote`, `!settings`, `!warn`                                                |
| Group    | `!goodbye`, `!groupinfo`, `!hidetag`, `!rules`, `!tagall`, `!welcome`                                                |
| Fun      | `!answer`, `!challenge`, `!fortune`, `!joke`, `!meme`, `!riddle`, `!roast`, `!ship`, `!story`                        |
| Media    | `!createvid`, `!image`, `!instagram`, `!play`, `!sticker`, `!tiktok`, `!youtube`                                     |
| Owner    | `!ai`, `!banuser`, `!botstat`, `!premium`, `!private`, `!public`, `!restart`, `!unbanuser`, `!update`, `!warnsystem` |

`!createvid` needs a billing-enabled Gemini API key. `!ai` queues questions for an assistant integration to process; this repository includes the WhatsApp delivery bridge, but does not include the assistant worker itself. Media downloader commands rely on third-party services and may not work when their upstream endpoints are unavailable.

## Data, privacy and security

By default, the bot creates these directories at runtime:

- `sessions/` — Baileys authentication files
- `data/` — `users.json`, `groups.json`, `settings.json` and `lidmap.json`
- `logs/` — daily log files, rotated at 5 MB and retained for up to seven days
- `tmp/` — temporary downloaded media

Use `SESSION_DIR` and `DATA_DIR` to place session and application data elsewhere. Back up persistent data while the bot is stopped and do not publish session credentials.

The bot stores user and group records locally and logs message activity and bot errors. Keep the `.env` file, session directory, application data and logs private. Owner commands are restricted to the configured owner numbers, but this does not authenticate requests to the HTTP pairing server.

WhatsApp may identify a participant with a LID (`@lid`) rather than a phone-number JID (`@s.whatsapp.net`). The identity helpers in [`src/lib/jidUtils.ts`](src/lib/jidUtils.ts) resolve identities when possible, build mention targets and compare users consistently. The database stores LID-to-phone-number mappings and migrates an existing LID-keyed user record when its phone-number identity becomes known.

## Deployment

### Docker

The included Dockerfile builds the TypeScript source and runs the compiled bot on Node.js 20. Build and start it with persistent volumes for the login and application data:

The container example below publishes the pairing server port. Because that server has no authentication, use it only on a trusted network or put it behind access controls as described in [Pairing server](#pairing-server).

```bash
docker build -t saad-bot .
docker run --name saad-bot \
  -p 3000:3000 \
  -e WEB_HOST=0.0.0.0 \
  -v saad-sessions:/app/sessions \
  -v saad-data:/app/data \
  saad-bot
```

The container exposes port `3000`. Set `PORT` or `WEB_PORT` if your host uses another port and configure the bot's other environment variables through your container platform. A mounted `/app/sessions` volume preserves the linked WhatsApp session across restarts; `/app/data` preserves user and group data.

### Railway or another persistent Node.js host

Deploy from the repository or build the Docker image. Configure the required environment values, set `WEB_HOST=0.0.0.0` and preserve `/app/sessions` and `/app/data` using persistent storage. Railway provides `PORT` automatically; the pairing page uses it when `WEB_PORT` is not set. Keep the HTTP server on a trusted network or protect it at the reverse proxy; in particular, do not expose `/api/send` publicly. The host must keep the process running because the WhatsApp connection is long-lived.

### Run the built app directly

```bash
npm run build
./run-prod.sh
```

On Linux, `run-prod.sh` accepts optional arguments for the pairing port, session directory and data directory:

```bash
./run-prod.sh 3001 ./sessions2 ./data2
```

## Project structure

| Path                                  | Purpose                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| [`src/index.ts`](src/index.ts)        | Startup, logging, WhatsApp event handlers and service wiring                 |
| [`src/commands/`](src/commands)       | Command plugins grouped by category                                          |
| [`src/core/`](src/core)               | Connection, message handling, plugin loading, JSON database and shared types |
| [`src/lib/`](src/lib)                 | JID and LID identity helpers                                                 |
| [`src/web/`](src/web)                 | Browser-based WhatsApp pairing page                                          |
| [`asset/`](asset)                     | Static assets, including the bot logo                                        |
| `data/`, `sessions/`, `logs/`, `tmp/` | Runtime directories created as needed                                        |

## Development

Available scripts:

| Script              | Description                                  |
| ------------------- | -------------------------------------------- |
| `npm start`         | Run the bot with `tsx`                       |
| `npm run dev`       | Run with `tsx` watch mode                    |
| `npm run build`     | Compile TypeScript into `dist/`              |
| `npm run typecheck` | Run TypeScript checks without emitting files |

Run the type checker and build before submitting changes:

```bash
npm run typecheck
npm run build
```

### Adding a command

Create a TypeScript module in the appropriate `src/commands/<category>/` directory. Export a default plugin with a regular-expression `pattern` and a `handler`; the plugin loader discovers `.ts` and `.js` files in category directories at startup.

```typescript
import type { ParsedMessage, CommandContext } from '../../core/types.js';

const handler = async (m: ParsedMessage, _context: CommandContext) => {
  await m.reply('Hello!');
};

export default {
  pattern: /^hello$/i,
  handler,
  help: 'Greet the bot',
  tags: ['basic'],
};
```

Use the fields in [`src/core/types.ts`](src/core/types.ts) as the reference for the plugin and message interfaces. Set `owner`, `admin` or `group` on the plugin when a command should be permission-restricted.

## Troubleshooting

**The bot does not respond**

- Confirm the terminal reports that it is connected to WhatsApp.
- Check the command prefix configured in `.env`.
- For group commands, check that the bot is in the group and has the required permissions.

**Pairing fails or the page cannot be reached**

- Wait for the WhatsApp socket to finish connecting before requesting a pairing code.
- For local use, open the configured `WEB_PORT` on the same machine.
- In Docker or on a hosted service, set `WEB_HOST=0.0.0.0`, expose the correct port and check the platform's port settings.
- If the account is already linked, the saved session in `sessions/` should be reused. Remove or replace session data only if you intend to link the account again.

**Media commands fail**

- Downloader services are third-party dependencies and may be temporarily unavailable.
- `!play` requires a reachable JioSaavn-compatible API at `JIOSAAVN_API`.
- `!createvid` requires a valid Gemini API key with billing and quota enabled.

## License

This project is available under the MIT License.
