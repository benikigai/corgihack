// Public "Ask the corgi": fixed questions only, read-only Meta tools, cached 5 min at the edge.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const QUESTIONS = {
  spend: "How much has the Corgi Ads account spent today and in total? One or two short sentences.",
  running: "What campaigns, ad sets and ads exist right now and which are active? Keep it short.",
  next: "Looking at the account right now, what is the single next thing you'd do to get the Corgi Pop test running well? Two sentences.",
};
const READ_TOOLS = ["ads_get_ad_accounts", "ads_get_ad_entities", "ads_get_ad_videos", "ads_get_creatives", "ads_insights_performance_trend"];

export default async function handler(req, res) {
  const q = QUESTIONS[req.query.q];
  if (!q) return res.status(400).json({ error: "Unknown question" });
  try {
    const response = await client.beta.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      betas: ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: `You are Corgi Ads, a cheerful corgi ad agent. Ad account ${process.env.META_AD_ACCOUNT_ID}. Answer in plain text, short, with one tiny dog pun at most. Only read data; never change anything.`,
      mcp_servers: [{ type: "url", url: "https://mcp.facebook.com/ads", name: "meta_ads", authorization_token: process.env.META_ACCESS_TOKEN }],
      tools: [{ type: "mcp_toolset", mcp_server_name: "meta_ads", default_config: { enabled: false },
        configs: Object.fromEntries(READ_TOOLS.map((t) => [t, { enabled: true }])) }],
      messages: [{ role: "user", content: q }],
    });
    if (response.stop_reason === "refusal") return res.status(200).json({ reply: "Ruff, can't answer that one." });
    const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const tools = response.content.filter((b) => b.type === "mcp_tool_use").map((b) => b.name);
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ reply, tools });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Busy, try again." });
    return res.status(502).json({ error: "The corgi is napping. Try again." });
  }
}
