# Meta setup

State of the Meta side as of 2026-10-07. IDs below are not secrets. The token is.

## What exists

| Thing | Value | Notes |
|---|---|---|
| Business portfolio | Corgi Ads, `1754690242426999` | Unverified. Owns the Page, ad account, app, system user. |
| Facebook Page | Corgi Ads, `0000000000000000` | |
| Ad account | Corgi Ads, `act_0000000000000000` | USD, America/Los_Angeles. Created inside the portfolio. |
| Meta app | Corgi Ads Agent, `0000000000000000` | Use case: "Create & manage ads with ads MCP server". Development mode. |
| System user | corgi-agent, `61595416550759` | **Employee** role. Meta's ads MCP server rejects Admin-role system user tokens. |
| Token | in the vault | SYSTEM_USER token for the app. Expires 2026-12-06 (60 days). Regenerate with Expiration: Never for a permanent one. |

Token scopes: `ads_mcp_management`, `ads_management`, `ads_read`, `business_management`,
`catalog_management`, `pages_show_list`, `pages_manage_ads`, `pages_read_engagement`.
`instagram_basic` is not granted yet, so Instagram tools won't work.

The old personal ad account `act_1837589724256730` could not be moved into the portfolio
(Meta wanted a first payment first). It is not used.

## Open items

- [x] `act_0000000000000000` assigned to corgi-agent with full access.
- [x] Payment method on the ad account (`has_payment_method: true`). Publishing now spends real money.
- [ ] Invite Zen: Business settings > Users > People > Add, full control of the ad account and Page.
- [ ] Account spending limit (Billing & payments > Payment settings), e.g. $15. The Ads MCP server rules page
      only has on/off switches here; its "budgets above $X" rule only applies while all budget edits are blocked,
      so it can't be used as a cap without also stopping Hermes from setting any budget.

## Zen: connecting Hermes in 5 steps

1. Get the token from the shared vault vault (ask Ben). Never paste it into chat, Notion, or git.
2. On the Agent37 box, add to `~/.hermes/.env`:
   `META_ACCESS_TOKEN=...`, `META_AD_ACCOUNT_ID=act_0000000000000000`, `META_PAGE_ID=0000000000000000`
3. Merge option A of `hermes/config.mcp.yaml` into `~/.hermes/config.yaml`.
4. In Hermes: `/reload-mcp`.
5. Ask Hermes: "list my ad accounts and today's spend". Expect Corgi Ads, ACTIVE, $0.

## Connecting Hermes

Option A in [`hermes/config.mcp.yaml`](../hermes/config.mcp.yaml) is the one that works:

```yaml
meta_ads:
  url: "https://mcp.facebook.com/ads"
  headers:
    Authorization: "Bearer ${META_ACCESS_TOKEN}"
```

Put `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID` in `~/.hermes/.env`, then `/reload-mcp`.
No login step: the system user token is the login.

## Verifying a token

```
scripts/save-token.sh   # copy the token first; writes .env (mode 600) from the clipboard, never prints it
scripts/verify.sh       # Graph /me/adaccounts + MCP tools/list
```

Both default to `~/corgihack-secrets/.env`; set `ENV_FILE=~/.hermes/.env` to point elsewhere.
Graph calls need a version (`/v26.0/`); unversioned calls fail with "deprecated version of the Ads API".

Last check (2026-10-07): MCP `tools/list` returned 98 tools. `/me/adaccounts` returned Corgi Ads,
`account_status: 1`. MCP `ads_get_ad_accounts` returned `is_ads_mcp_enabled: true`, `has_payment_method: true`.
`ads_creative_upload_media` uploaded `examples/ads/corgi-pop-hero.png` by URL (image hash `02f6b2c9987749dafb500286e856362e`).

`scripts/mcp.py <tool> '<json args>'` calls any MCP tool from a terminal with the token from `.env`, e.g.
`scripts/mcp.py ads_get_ad_accounts '{}'`.

## Video ad flow over MCP

All of this is $0 until step 5. The MCP server runs in draft mode: ads are staged as drafts.

1. `ads_creative_upload_media`: `upload_source: URL`, `media_type: VIDEO`, `media_url` = a public direct MP4 link
   (Supabase Storage public bucket works; Drive/Dropbox share links don't). Returns `video_id`.
   Hermes is headless, so `LOCAL_FILE` upload (an interactive app) is not an option.
2. `ads_create_creative`: `page_id`, `video_id`, a thumbnail (`image_url` or `image_hash`, required for video),
   `message`, `headline`, `link_url` + `call_to_action_type`. No `link_url` means no CTA button.
3. `ads_create_campaign`: objective (Traffic for the demo), lifetime budget in cents (`1000` = $10).
4. `ads_create_ad_set` (optimization goal from the campaign's `valid_optimization_goals`, e.g. `LINK_CLICKS`),
   then `ads_create_ad` with the creative.
5. `ads_activate_entity` with the draft campaign, ad set, and ad IDs together. **This spends money.**
   Only after a human says go.

Measure with `ads_get_ad_entities` (spend, impressions, clicks, CTR, CPC; `date_preset`, `time_increment`),
`ads_insights_performance_trend`, `ads_insights_anomaly_signal`. Pause or change budget with `ads_update_entity`.
ROAS stays empty without a pixel and purchase events.
