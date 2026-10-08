// Meta's own feed preview of a Corgi Pop ad, rendered from a spec. Creates nothing, spends nothing.
const HOOKS = {
  zoomies: { video: "1134985222431889", message: "Your corgi called. It wants a Corgi Pop. 🐕", title: "Fizz worth zooming for" },
  "beat-heat": { video: "1082556491186206", message: "Too hot for walkies? Crack a cold one. 🧊", title: "Ice cold. Corgi approved." },
  "taste-test": { video: "2710086982745146", message: "We asked a corgi to taste test soda. 🥤", title: "Verdict: 10/10 boops" },
};
const FORMATS = { instagram: "INSTAGRAM_STANDARD", facebook: "MOBILE_FEED_STANDARD", reels: "INSTAGRAM_REELS" };

export default async function handler(req, res) {
  const hook = HOOKS[req.query.hook] || HOOKS.zoomies;
  const format = FORMATS[req.query.format] || FORMATS.instagram;
  const creative = {
    object_story_spec: {
      page_id: process.env.META_PAGE_ID,
      video_data: {
        video_id: hook.video,
        image_hash: "02f6b2c9987749dafb500286e856362e",
        message: hook.message,
        title: hook.title,
        call_to_action: { type: "LEARN_MORE", value: { link: "https://corgi-hack-tau.vercel.app/corgi-pop/" } },
      },
    },
  };
  const qs = new URLSearchParams({ creative: JSON.stringify(creative), ad_format: format, access_token: process.env.META_ACCESS_TOKEN });
  try {
    const r = await fetch(`https://graph.facebook.com/v26.0/${process.env.META_AD_ACCOUNT_ID}/generatepreviews?${qs}`);
    const d = await r.json();
    const body = d.data?.[0]?.body || "";
    const src = body.match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
    if (!src) return res.status(502).json({ error: "No preview" });
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    return res.status(200).json({ src });
  } catch {
    return res.status(502).json({ error: "Meta unavailable" });
  }
}
