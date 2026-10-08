# Meta setup

State of the Meta side as of 2026-10-07. IDs below are not secrets. The token is.

## Quick links

Built from the IDs below. You need a role on the business to open everything except the Ad Library.

**Public proof (anyone can open, no login)**
- [Meta Ad Library: all Corgi Ads ads](https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&view_all_page_id=0000000000000000): every ad the Page has run. An ad shows up here once it has been active, not while it is a draft or paused before launch.
- [Corgi Ads Facebook Page](https://www.facebook.com/0000000000000000)

**Ads Manager** (ad account `act_0000000000000000`)
- [Campaigns](https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=0000000000000000&business_id=1754690242426999)
- [Ad sets](https://adsmanager.facebook.com/adsmanager/manage/adsets?act=0000000000000000&business_id=1754690242426999)
- [Ads](https://adsmanager.facebook.com/adsmanager/manage/ads?act=0000000000000000&business_id=1754690242426999)
- [Billing and payment methods](https://business.facebook.com/billing_hub/accounts/details?asset_id=0000000000000000&business_id=1754690242426999)

**Business settings** (portfolio `1754690242426999`)
- [Business Suite home](https://business.facebook.com/latest/home?business_id=1754690242426999)
- [Business settings](https://business.facebook.com/latest/settings/?business_id=1754690242426999)
- [People](https://business.facebook.com/latest/settings/business_users?business_id=1754690242426999) · [System users](https://business.facebook.com/latest/settings/system_users?business_id=1754690242426999) · [Ad accounts](https://business.facebook.com/latest/settings/ad_accounts?business_id=1754690242426999) · [Apps](https://business.facebook.com/latest/settings/apps?business_id=1754690242426999)

**Developer app** (Corgi Ads Agent `0000000000000000`)
- [App dashboard](https://developers.facebook.com/apps/0000000000000000/dashboard/)
- [App settings > Basic](https://developers.facebook.com/apps/0000000000000000/settings/basic/): privacy policy, icon, App mode toggle (Live)
- [App roles](https://developers.facebook.com/apps/0000000000000000/roles/roles/)
- [Access token debugger](https://developers.facebook.com/tools/debug/accesstoken/): check a token's scopes and expiry. Meta's own tool, fine for tokens.

## Proving the campaign ran

Judges can't open Ads Manager, so collect proof that doesn't need a login:

1. **Ad Library link** (above): public and live once the ad has delivered. Strongest proof.
2. **Ad preview link**: Ads Manager > select the ad > Preview > Share > copy link. Anyone can open it.
3. **Screenshots**: Ads Manager rows showing campaign, ad set and ad IDs, status Active, delivery, and spend > $0.
4. **Pip's own report**: its insights read (spend, impressions, CTR) next to the same numbers in Ads Manager.

As of 2026-10-08: campaign "Corgi Pop - Website Visits Test" and ad set "Corgi Pop - US - Link Clicks"
exist, but the ad set has **no ads** and $0 spent. Nothing is provable until an ad exists and delivers.

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

## Status (2026-10-08)

- **Muse (our Hermes agent) is connected** to Meta Ads through OAuth, not the system user token.
  It sees the Corgi Ads ad account, the Page, and the ad set "Corgi Pop - US - Link Clicks".
- **Reel uploaded** to the ad account: video ID `4104563696511214`, processed and ready.
- **Blocked:** creating the ad fails with "app is in development mode". Muse connects to Meta through
  Agent37's managed Composio connector (`muse/server.js`, "Connectors"), so the app named in that
  error is most likely Composio's Meta app, not ours. Flipping Corgi Ads Agent to Live alone may not
  fix Pip. Reads, pausing and budget edits are not affected.
- The system user token was pasted into a chat. Revoke it and generate a new one before using option A.

### Getting ad creation working

**Path 1, fastest (no Meta review):** in Ads Manager, open ad set "Corgi Pop - US - Link Clicks",
create the ad from the uploaded video `4104563696511214`, leave it paused. Pip monitors, pauses and
moves budget through Composio. Story: "the agent made the reel and runs the spend."

**Path 2, agent creates ads itself:** put Corgi Ads Agent in Live mode, then connect Pip to Meta
through our app instead of Composio (option A in `hermes/config.mcp.yaml`, a new system user token
in `~/.hermes/.env` on the Pip box, then `/reload-mcp`).

Putting Corgi Ads Agent in Live mode
([App settings > Basic](https://developers.facebook.com/apps/0000000000000000/settings/basic/)):

| Field | Value |
|---|---|
| Privacy Policy URL | https://github.com/benikigai/corgihack/blob/claude/trusting-euler-74gfxd/docs/privacy.md |
| User data deletion | Data deletion instructions URL: same URL + `#data-deletion` |
| App icon (1024x1024) | [`docs/assets/app-icon-1024.png`](assets/app-icon-1024.png) |
| Category | Business and pages |

Save, then flip **App mode** to **Live** at the top of the dashboard. If Meta asks for business
verification, stop: that takes days. Use path 1.

## Open items

- [ ] Assign `act_0000000000000000` to corgi-agent with full access (Business settings > Ad accounts > Assign people). Until then the token sees no ad accounts.
- [ ] Payment method on `act_0000000000000000`, needed before anything can be published.
- [ ] Invite Zen: Business settings > Users > People > Add, full control of the ad account and Page.
- [ ] Optional guardrail: Business settings > Integrations > Ads MCP server, block budgets above $20.

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

Last check: MCP `tools/list` returned 98 tools. `/me/adaccounts` returned `[]` because the ad account
isn't assigned to corgi-agent yet.

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
