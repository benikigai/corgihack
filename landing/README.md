# Landing page

Static Corgi Pop page, live at https://corgi-hack-tau.vercel.app (Vercel project `benjamin-shyong/corgi-hack`).
Also the click-through URL for the ads (`link_url`).

- `index.html`: the page. Plain HTML/CSS, no build step.
- `agent/`: placeholder for Zen's agent UI at `/agent`.
- `hero.jpg`, `loop.mp4`: from `examples/ads/`.
- `corgi-ads.jpg`, `favicon.png`: the Corgi Ads Facebook Page profile photo.

Deploy: `cd landing && vercel deploy --prod --scope benjamin-shyong`

## Agent chat (`/agent` + `api/chat.js`)

Chat UI that calls Claude (claude-opus-5-5) with Meta's ads MCP server attached, read-only tools only.
Needs Vercel env vars: `ANTHROPIC_API_KEY`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`,
`AGENT_PASSCODE`. Requests without the passcode header get 401.
