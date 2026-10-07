// Corgi Ads agent chat: Claude + Meta's ads MCP server, read-only.
// Env: ANTHROPIC_API_KEY, META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_PAGE_ID, AGENT_PASSCODE.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Public page, so only read tools are on. Creating, launching, pausing, and budget
// changes stay with Hermes, where a human approves them.
const READ_TOOLS = [
  "ads_get_ad_accounts",
  "ads_get_ad_entities",
  "ads_get_ad_account_pages",
  "ads_get_ad_images",
  "ads_get_ad_videos",
  "ads_get_creatives",
  "ads_get_ad_preview",
  "ads_insights_performance_trend",
  "ads_insights_anomaly_signal",
  "ads_insights_advertiser_context",
  "ads_account_get_activity_logs",
  "ads_library_search",
  "ads_get_help_article",
];

const SYSTEM = `You are Corgi Ads, a friendly ad agent for the Corgi Pop soda brand (a fictional drink made for a hackathon demo).
You can read the Meta ad account act_${process.env.META_AD_ACCOUNT_ID?.replace(/^act_/, "")} and Facebook Page ${process.env.META_PAGE_ID} through the Meta ads tools: accounts, campaigns, ad sets, ads, spend, CTR, CPC, trends, anomalies, previews, and activity logs.
You cannot create, publish, pause, or change budgets from this chat. If asked, say that the Hermes agent does that after a human approves, and describe exactly what you would do.
Keep answers short and concrete: lead with the number or the answer, then one line of recommendation. Use plain text, no markdown tables.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.AGENT_PASSCODE || req.headers["x-agent-passcode"] !== process.env.AGENT_PASSCODE) {
    return res.status(401).json({ error: "Wrong passcode" });
  }
  const history = Array.isArray(req.body?.messages) ? req.body.messages.slice(-20) : [];
  const messages = history
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "Last message must be from the user" });
  }

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      mcp_servers: [{
        type: "url",
        url: "https://mcp.facebook.com/ads",
        name: "meta_ads",
        authorization_token: process.env.META_ACCESS_TOKEN,
      }],
      tools: [{
        type: "mcp_toolset",
        mcp_server_name: "meta_ads",
        default_config: { enabled: false },
        configs: Object.fromEntries(READ_TOOLS.map((t) => [t, { enabled: true }])),
      }],
      messages,
    });

    if (response.stop_reason === "refusal") {
      return res.status(200).json({ reply: "I can't help with that one.", tools: [] });
    }
    const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const tools = response.content.filter((b) => b.type === "mcp_tool_use").map((b) => b.name);
    return res.status(200).json({ reply: reply || "(no answer)", tools });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Busy, try again in a moment." });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude API error ${err.status}` });
    return res.status(500).json({ error: "Agent failed" });
  }
}
