# Corgi Ads 🐕📣

An ad agent you talk to. It studies what's working for competitors, makes the
creative, launches it on Meta, then watches live spend and tells you where the
money should go. You approve; it acts.

Built at the Corgi Hackathon by Ben and Zen.

## Architecture

```mermaid
flowchart LR
  user([You, in chat]) <--> hermes

  subgraph agent37[Agent37 box]
    hermes[Hermes agent]
    skills[[skills: corgi-ads, monid]]
    cron{{cron every 15m}}
    hermes --- skills
    cron --> hermes
  end

  hermes -- scrape top IG ads --> monid[Monid]
  hermes -- generate copy + media --> gen[Image / video gen]
  hermes -- MCP: insights, pause, budget --> meta[Meta Ads]
  hermes -- MCP: write rows --> db[(Supabase)]
  db --> web[Dashboard on Vercel]
```

| Step | What happens | Where |
|---|---|---|
| 1. Research | Monid pulls the top 5 competitor Instagram ads. Agent names the hook, format, offer. | `competitor_ads` |
| 2. Create | Agent writes 3 variants with different hooks, generates media. | `creatives` |
| 3. Launch | Agent picks manual vs Advantage+ and says why, then creates the ads on Meta. | Meta, `creatives.meta_ad_id` |
| 4. Monitor | Cron reads ad-level insights, snapshots them. | `ad_snapshots` |
| 5. Direct spend | Agent proposes pause or budget shift. You say "approve". It applies and confirms. | `recommendations`, Meta |

**Design rule:** the agent is the only thing that touches Meta. The dashboard
only reads Supabase. That keeps the token in one place and the UI dumb.

## Repo layout

```
hermes/
  config.mcp.yaml              MCP servers to merge into ~/.hermes/config.yaml
  skills/marketing/corgi-ads/  Monitor + recommend + guardrails skill
supabase/schema.sql            Shared data contract (agent writes, web reads)
web/                           Dashboard
docs/demo.md                   3-minute demo script and backups
.env.example                   Every secret we need. Real values never get committed.
```

## Who owns what

Proposed split. Swap freely, just update this table.

| Lane | Owner | Done when |
|---|---|---|
| Meta account, live $10 campaign, 3 ads | Ben | Ads approved and delivering |
| Hermes on Agent37: MCP + corgi-ads skill + cron | Ben | "list my ad accounts and today's spend" works in chat |
| Monid research skill | Zen | Agent returns 5 competitor ads + analysis, rows in `competitor_ads` |
| Supabase project + schema | Zen | `schema.sql` applied, agent can insert |
| Dashboard (`web/`) | Zen | Performance chart updates from `ad_snapshots` |
| Demo script + backup recording | Both | See `docs/demo.md` |

## Setup

**Meta access** (people get roles, the agent gets a system user)
1. business.facebook.com: one Business portfolio owns the ad account and the Facebook Page.
2. People: Business settings > Users > People > Add, invite Ben and Zen by email, give each full control of the ad account and Page.
3. Agent: Business settings > Users > System users > Add (admin). Assign the ad account (manage campaigns) and the Page. Generate a token with `ads_read`, `ads_management`, `business_management`. That token goes in `~/.hermes/.env` as `META_ACCESS_TOKEN`.
4. Billing > Payment settings: account spending limit $15.

**Agent (Agent37 box)**
1. `cp .env.example ~/.hermes/.env` and fill it in.
2. Merge `hermes/config.mcp.yaml` into `~/.hermes/config.yaml`. Start with option A, then `/reload-mcp`.
3. Smoke test in chat: *"list my ad accounts and today's spend"*. If it fails, try option B, then C.
4. `cp -r hermes/skills/marketing/corgi-ads ~/.hermes/skills/marketing/`
5. Monid: `monid keys add -k "$MONID_API_KEY" -l main`, and load Monid's SKILL.md into Hermes.
6. Schedule the monitor (gateway must be running):
   ```
   hermes cron create "every 15m" "Run the corgi-ads monitor loop and report" --skill corgi-ads
   ```

**Supabase**
1. New project. Run `supabase/schema.sql` in the SQL editor.
2. Agent writes with a personal access token through the Supabase MCP. Dashboard reads with the anon key.

## Live test campaign

- Objective **Traffic** (no pixel needed), destination = landing page.
- One ad set, **3 ads** with different hooks, so there's something to compare.
- **$10 lifetime budget** with an end date. Broad targeting, Advantage+ placements.
- Expect real spend, CTR, CPC, CPM. Not real ROAS: that needs a pixel and purchases.

## Working together

- Branch per lane (`ben/agent`, `zen/web`), PR into the main branch, keep PRs small.
- `supabase/schema.sql` is the contract. Change it in its own PR and tell the other person.
- Secrets live in `.env` and `~/.hermes/.env` only. If a key ever lands in git or a shared doc, rotate it.
