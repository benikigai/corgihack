// Live account stats for the demo page. Graph API reads only; cached at the edge for 60s.
const G = "https://graph.facebook.com/v26.0";

async function get(path, params = {}) {
  const qs = new URLSearchParams({ ...params, access_token: process.env.META_ACCESS_TOKEN });
  const r = await fetch(`${G}/${path}?${qs}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

export default async function handler(req, res) {
  const act = process.env.META_AD_ACCOUNT_ID;
  try {
    const [acct, today, campaigns, ads] = await Promise.all([
      get(act, { fields: "name,account_status,amount_spent,currency" }),
      get(`${act}/insights`, { fields: "spend,impressions,clicks,ctr", date_preset: "today" }),
      get(`${act}/campaigns`, { fields: "effective_status", limit: "50" }),
      get(`${act}/ads`, { fields: "effective_status", limit: "50" }),
    ]);
    const t = today.data?.[0] || {};
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({
      account: acct.name,
      active: acct.account_status === 1,
      spentAllTime: Number(acct.amount_spent || 0) / 100,
      spendToday: Number(t.spend || 0),
      impressionsToday: Number(t.impressions || 0),
      clicksToday: Number(t.clicks || 0),
      ctrToday: Number(t.ctr || 0),
      campaigns: campaigns.data.length,
      activeAds: ads.data.filter((a) => a.effective_status === "ACTIVE").length,
      updated: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(502).json({ error: "Meta unavailable" });
  }
}
