# Landing page

Live at **https://corgi-hack-tau.vercel.app** (Vercel project `benjamin-shyong/corgi-hack`).

**Deploys are manual from this folder on branch `ben/meta-setup`.** The Vercel project has no Git
connection, so pushes don't redeploy. Run `vercel deploy --prod --scope benjamin-shyong` from here.

- `index.html`: the demo page: what Corgi Ads is, how it works, the ads, the stack.
- `corgi-pop/`: the Corgi Pop product page, and the ads' click-through URL (`link_url`).
- `ads/`: compressed copies of the three sample ads for the demo page.
- `agent/`: placeholder for Zen's agent UI at `/agent`.
- `hero.jpg`, `loop.mp4`: from `examples/ads/`.
- `corgi-ads.jpg`, `favicon.png`: the Corgi Ads Facebook Page profile photo.

Deploy: `cd landing && vercel deploy --prod --scope benjamin-shyong`

## Agent chat (`/agent` + `api/chat.js`)

The portal for talking to the ads agent. All requests need the `x-agent-passcode` header (`AGENT_PASSCODE`).

- **Muse mode** (target): set `MUSE_AGENT_URL` (and `MUSE_AGENT_TOKEN` if Muse needs one). The function forwards
  `POST {"messages":[{"role":"user"|"assistant","content":"..."}]}` and expects `{"reply":"...","tools":["..."]}` back.
  Zen's Muse agent owns Monid research, creative, and Meta.
- **Fallback mode** (until Muse is ready): Claude (claude-sonnet-5-5) + Meta's ads MCP server with every tool enabled.
  Needs `ANTHROPIC_API_KEY`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`. Spending rules ($20 cap,
  confirm before publish) are in the system prompt only, so also keep an account spending limit in Meta Billing.
