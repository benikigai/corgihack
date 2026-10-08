# muse

Vendored from [Agent37's Muse example](https://github.com/agent37-platform/examples/tree/main/muse),
upstream commit `b9f29f2ea7d4092303b095ce2cc4445059acd828`, with the Instacloud/private-access
changes and Corgi skill integration. The original [MIT license](LICENSE) is included.

Build your own Muse: a personal agent app in the shape of Meta's Muse, on [Agent37](https://www.agent37.com/docs). Every visitor gets their own agent with its own always-on computer. You chat with it like a person (keep typing while it works, open side chats), it remembers you, it writes you ideas every morning, it tracks your goals on a schedule it sets itself, it keeps what it makes in a Library, and it messages you first when something needs you. Express server, vanilla JS frontend, no build step.

![Chat with the Browser card, the Ideas tab, and the Goals tab](docs/screens.png)

The guide for this example is [Build your own Muse](https://www.agent37.com/docs/agents-api/muse).

## This Instacloud deployment

This checkout is configured as a **private, single-owner app**. Sign in with the access password;
every signed-in device reaches the same agent. The upstream per-browser demo behavior is still
available in local development when `MUSE_ACCESS_PASSWORD` is unset.

- App: https://prod-muse-instacloud-muse-07ee54-007x05v54jj.compute.instacloud-edge.com
- Instacloud project: `hackathon`; branch: `muse-instacloud`; compute service: `muse`.
- One Node/Express container on port `3104`, with a **1 GiB persistent volume** at `/data`.
- Store: `/data/store.json`. Keep this volume and `SESSION_SECRET` when redeploying so the owner
  remains attached to their existing agent. Use one app replica with this file-based store.
- Agent work, memory, files, and scheduled jobs run on Agent37; no additional worker is needed.
- **No database is required.** Supabase Auth and Postgres are an appropriate follow-up for a
  multi-user version, which would need an actual storage/auth migration.

The deployed service has `AGENT37_API_KEY`, `MONID_API_KEY`, `SESSION_SECRET`, `MUSE_ACCESS_PASSWORD`,
`PUBLIC_URL`, and `DATA_DIR` configured as service-scoped Instacloud secrets. Credentials are
injected at runtime, excluded from the Docker build, and never sent to the frontend.

### Start using it

1. Get `MUSE_ACCESS_PASSWORD` from the `muse` service's secrets in Instacloud. On macOS, you can
   copy just this password to your clipboard without displaying it. Run from this directory:

   ```bash
   insta run --branch muse-instacloud --service compute/muse -- python3 -c 'import os, subprocess; subprocess.run(["pbcopy"], input=os.environ["MUSE_ACCESS_PASSWORD"].encode(), check=True)'
   ```

2. Open the app, paste the access password, and choose your name, your agent's name, look, and tone.
3. Keep the [Agent37 wallet](https://www.agent37.com/dashboard/cloud/billing) funded. The example
   recommends an initial $10 top-up. Onboarding creates a billable Agent37 instance, with a $2
   monthly managed-usage allowance and automatic sleep after 30 idle minutes. Compute is billed
   separately from that allowance. No separate model-provider key is needed for the default agent.
4. Connect any apps you want your agent to use from its Connectors screen. Each requires its own
   OAuth consent. Notifications appear inside Muse; this example does not send email or Web Push.

### Maintain and redeploy

```bash
npm ci
npm test
npm run deploy
```

`npm run deploy` first runs `npm run bundle:skills`, which reads `../hermes/skills`
and writes the ignored `agent-bundle.json` into the Docker build context. Always
run this preparation before a direct `insta deploy`; the image needs the bundle.
For local development, Muse reads the canonical skill directories directly.

### Corgi skills and Monid

The bundled skills are `corgi-ads`, `product-reel`, and the official `monid` skill.
All reference files and the reel checker are included. The server writes them to
`~/.hermes/skills` on Agent37 after the instance is healthy, leaving other skills
alone. The app-owned section of SOUL.md explains when to use them; edits preserve
the rest of the persona and use mtime checks to avoid overwriting concurrent edits.

`agent-bootstrap.py` installs the Monid CLI version declared by its skill into
`~/.local/share/muse/monid` and exposes it through `~/.local/bin/monid`. Both paths
are on persistent storage. It checks Python, FFmpeg and ffprobe, configures the
Monid credential store, and verifies authentication with `monid whoami`.

The API key comes from the `MONID_API_KEY` service secret. It is staged briefly
inside the agent's private `~/muse/.setup` directory, registered with the CLI,
and the staging file is removed. No key is embedded in source, prompts, skill
files, browser responses, or command logs. The agent retains its CLI credentials
in its own persistent configuration. Rotation: update the Instacloud secret and
use **Skills → Refresh skills**. The current app remains usable if setup fails;
the Skills screen shows the failure and allows a retry.

Skills and credential changes produce a new installation revision. Existing
ready agents sync on their next app visit, and new agents install during
onboarding. Skills does not interrupt or replace the user's existing chat;
**start a new chat** after an update to load the latest persona and skill list.
Finished `.mp4`, `.webm`, and `.mov` files have video previews in Library.

Meta Ads and Supabase credentials are separate. The repo's
[`hermes/config.mcp.yaml`](../hermes/config.mcp.yaml) is a configuration template,
not automatically applied by this installer. Connect those services before using
`corgi-ads` to read real performance or propose live changes. Publishing ads,
changing budgets, and starting monitoring schedules still require the user's
corresponding request/approval.

The public `/healthz` endpoint checks the web server; `/api/notify` independently validates its
per-agent bearer token. Every other app route is behind the password. Login cookies expire after
seven days. A corrupted/unreadable store stops startup instead of silently losing the agent mapping.
If provisioning loses its response, a retry reconciles the existing Agent37 instance before it
creates anything; an unresolved create stays blocked to prevent duplicate billing.

The tests verify access control, shared identity across devices, callback authentication,
stored notifications surviving a server restart, skill packaging, and installer error handling.
The live Pip verification loaded all three skills and successfully searched the Monid catalog.
Paid media generation and Meta/Supabase operations are separate workflows; this setup check
does not run them.

## Run it

You need an [API key](https://www.agent37.com/dashboard/cloud/api-keys) and at least $10 in your [wallet](https://www.agent37.com/dashboard/cloud/billing).

The agent runs in the cloud and calls this server when it messages the user first, so `PUBLIC_URL` must be reachable from the internet. Deploy the app, or for local dev open a quick tunnel:

```bash
# terminal 1: a public URL for this server (prints https://<something>.trycloudflare.com)
cloudflared tunnel --url http://localhost:3104

# terminal 2
npm install
cp .env.example .env   # AGENT37_API_KEY, SESSION_SECRET, and the tunnel URL as PUBLIC_URL
npm start
```

The tunnel or deployment exposes the whole app, not just `/api/notify`, and identity here is a cookie: anyone who opens the URL gets a new billed instance per browser, up to your workspace's instance limit. Keep the URL private until real auth is in front.

Open [http://localhost:3104](http://localhost:3104), tell it your name, name your agent, pick a look and a tone. Setup takes under a minute on a warm host and a few minutes on a cold one.

- `AGENT37_API_KEY`: your `sk_live_` key. It stays on this server.
- `SESSION_SECRET`: any long random string. It signs the cookie that maps a browser to its agent.
- `PUBLIC_URL`: where the agent reaches this server. Without it everything works except notifications. A quick tunnel gets a new URL each run; restart the server with the new one and the app rewrites each agent's callback script on the next page load.

## What it costs

Each visitor gets one `agent37-hermes` instance on the smallest shape with `auto_sleep` on and a 30-minute idle window: awake time bills $4.76 per month pro rata, asleep time bills its disk alone (about $0.36 per month). Each instance also gets a $2 monthly managed allowance (`budget.monthly_cap_micros`) for its model, search and app calls, the way Muse gives each user a weekly allowance; raise it for paying users. The daily ideas run and every reminder or check-in is one agent turn. Reset deletes the instance and ends its billing.

## How it maps to the API

One key, two planes, and the browser never sees either: every call goes browser -> `server.js` -> Agent37, and the server picks the instance from the visitor's cookie, never from the request.

| Muse | This app | API |
|---|---|---|
| Your agent and its computer | One instance per visitor, created on onboarding, readiness by polling health | `POST /v1/instances`, `GET /v1/health` |
| Name, tagline, tone, avatar | A marked block in `~/.hermes/SOUL.md`, rewritten read-merge-write, and a fresh main chat once the persona changes; the avatar is app-side art | `GET`/`PUT /v1/files/content` |
| Chat, side chats | Main chat plus side chats, each a session with an id this app mints and indexes | `POST /v1/responses` (`stream: true`), `GET /v1/sessions` |
| Send while it works | Messages typed during a turn wait in a client-side queue; a `409 session_busy` from another tab queues too and follows the running turn | `error.response_id`, `GET /v1/responses/{id}/stream` |
| Mascot status line | Driven by the stream's `response.*` events | SSE events |
| Browser card | Status only, narrated from `browser_*` tool events, with Stop | `response.tool_call.started`, `POST /v1/responses/{id}/cancel` |
| Ideas | A daily platform cron has the agent rewrite `~/muse/ideas.json`; tap an idea to send it | `POST /v1/instances/{id}/crons`, `.../run`, `GET /v1/files/content` |
| Goals | The agent keeps `~/muse/goals.json` and schedules each check-in itself with `agent37 cron`; the app joins goals to crons by id for the next check-in | `GET /v1/instances/{id}/crons` |
| Upcoming | Every cron on the instance, whether you or the agent made it: pause, run now, delete, add a reminder | crons CRUD |
| It messages you first | The agent runs `node ~/muse/notify.mjs`, which posts to this server's `/api/notify` with a token planted in the instance env at create; the server keeps the token's hash | `env` on create |
| Memory | Entries of `USER.md` and `MEMORY.md`, each edit a read-merge-write guarded by the file's mtime | `X-Expected-Mtime`, `overwrite=false` |
| Download your data | Memories only, as one Markdown file | `GET /v1/files/content` |
| Library | Everything under `~/muse/library`, HTML previewed in a sandboxed iframe | `GET /v1/files` |
| Connectors | Search, connect by OAuth link, disconnect | `/v1/instances/{id}/integrations/*` |
| Reset | Delete the instance, back to onboarding | `DELETE /v1/instances/{id}` |

Behaviors worth copying:

- **The app owns a marked block of SOUL.md, not the file.** The server reads the file, replaces what sits between `<!-- muse:begin -->` and `<!-- muse:end -->`, and writes it back, so anything else in the file survives. The block tells the agent about the app's files, that it can follow up with `agent37 cron` (the platform tells it by default that it cannot follow up once a response ends), and how to message the user first. The stock file introduces the agent as Hermes Agent, so the block also says it wins over anything else in the file.
- **A persona change starts a fresh main chat.** Hermes builds a session's system prompt, SOUL.md and memory included, on its first turn and keeps it for the rest of the session. So a saved name, tagline or tone moves the main chat to a new session id and files the old one under Chats; side chats and scheduled runs started after the change pick it up on their own. Memory edits follow the same rule: they reach the next session, not the one already running.
- **Memory edits merge.** Hermes writes its memory files as entries joined by `\n§\n`. An edit re-reads the file, applies the one change to the current entries, and writes back with `X-Expected-Mtime`; if the agent saved a memory in between, the write fails with `412 modified` and is re-applied on top, so neither side loses an entry.
- **"Updated" is the file's mtime.** The agent writes an `updated` field into `ideas.json`, but a model's idea of the current time is not something to render.
- **The browser only reads what it is allowed to.** The file routes take names under `~/muse/library`, never paths: the key can read any file on the instance, and `~/.hermes/config.yaml` holds the instance's managed-services token. The export covers memories only for the same reason.
- **Your own thread index.** `GET /v1/sessions` returns the 100 most recent sessions and every cron firing opens one, so the list of chats lives in this app's store.

Full API reference: [agent37.com/docs](https://www.agent37.com/docs). For coding agents: [agent37.com/docs/llms-full.txt](https://www.agent37.com/docs/llms-full.txt).

## Left out on purpose

- **Multi-user accounts.** This deployment adds password sign-in for one owner and persists the store on its volume. A public multi-user app still needs individual accounts and a database; [starter-kit](https://github.com/agent37-platform/starter-kit) is a multi-tenant dashboard with auth and per-user agents to fork.
- **Push notifications.** Notifications land in an in-app inbox and in the main chat. `/api/notify` is where you would fan out to Web Push, email, or a messaging channel.
- **WhatsApp.** Muse is also in WhatsApp; this app is not, because WhatsApp's business terms restrict general-purpose AI assistants. Telegram (every `agent37-hermes` instance already has a webhook public port for it) or iMessage are the texting channels to add.
- **A live browser view.** The stock image's browser is headless, so the Browser card shows status and Stop only. Watching or taking over needs a desktop image.
- **Purchases.** The agent can research and fill a cart; checkout is handed back to the user.
- **Feed, approval cards, per-connector Allow/Ask/Deny, the activity log.** Each is buildable on the same pieces, none is needed for the core loop.

Not affiliated with Meta.
