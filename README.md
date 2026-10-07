# Corgi Ads

An ad agent that researches competitor ads, makes creative, launches on Meta,
then watches live spend and tells you where the money should go.

Runs on Hermes (hosted on Agent37), connected to Meta through MCP.

## Wire Hermes to Meta

1. **Meta side.** Business Manager owns the ad account and a Facebook Page.
   Create a system user, assign it to both, and generate a token with
   `ads_read` and `ads_management`.
2. **Secrets.** On the Agent37 box, copy `.env.example` to `~/.hermes/.env`
   and fill it in.
3. **MCP.** Merge `hermes/config.mcp.yaml` into `~/.hermes/config.yaml`.
   Start with option A. Run `/reload-mcp`, then ask the agent:
   "list my ad accounts and today's spend". If that fails, try B, then C.
4. **Skill.** Copy `hermes/skills/marketing/corgi-ads/` to
   `~/.hermes/skills/marketing/corgi-ads/`.
5. **Monitor.** Schedule the loop (the gateway must be running):

   ```
   hermes cron create "every 15m" "Run the corgi-ads monitor loop and report" --skill corgi-ads
   ```

   For the demo, trigger it on demand with `hermes cron run <job_id>`.

## Live test campaign

- Objective: **Traffic** (no pixel needed). Destination: landing page URL.
- One ad set, **3 ads** with different hooks, so the agent has something to compare.
- **$10 lifetime budget** with an end date. Account spending limit $15.
- Broad targeting, Advantage+ placements, so it delivers fast.
