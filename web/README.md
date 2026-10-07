# web: Corgi dashboard

Reads Supabase (`supabase/schema.sql`) with the anon key. Never talks to Meta directly.

Screens, in demo order:

1. **Research**: competitor ads from `competitor_ads` with the agent's analysis.
2. **Creative library**: `creatives` cards, status badge (draft / launched / paused).
3. **Performance**: per-ad spend, CTR, CPC over time from `ad_snapshots`. Poll every 30s or use Supabase realtime.
4. **Recommendations**: feed from `recommendations` with status. Approve happens in agent chat for v1.

Stack: whatever ships fastest. Next.js or Vite + React, `@supabase/supabase-js`, Recharts. Deploy to Vercel.
