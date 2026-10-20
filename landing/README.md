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

The portal for talking to the ads agent. All requests need the `x-agent-passcode` header (`AGENT_PASSCODE`), compared in constant time; an IP is locked out for 15 minutes after 5 wrong passcodes (best effort, per warm instance).

- **Read-only (default):** Claude (claude-sonnet-5-5) + Meta's ads MCP server with only the read tools enabled server-side
  (`ads_get_ad_accounts`, `ads_get_ad_entities`, `ads_get_ad_videos`, `ads_get_creatives`, `ads_insights_performance_trend`).
  It can explain spend and performance but cannot publish, pause, or change budgets.
- **Live-demo writes:** set `AGENT_ALLOW_WRITES=true` to enable every Meta tool and, if `MUSE_AGENT_URL` is set, forward chats to
  Zen's Muse agent (which owns Monid research, creative, and Meta). Spending rules ($20 cap, confirm before publish) are prompt-only,
  so keep an account spending limit in Meta Billing and turn writes off again after the demo.
