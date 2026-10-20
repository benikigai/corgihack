// Corgi Ads agent portal.
// Read-only by default: the built-in agent gets only the Meta read tools, enforced server-side.
// Set AGENT_ALLOW_WRITES=true to re-enable publishing/budget tools and forwarding to Zen's Muse agent
// (which can also spend). Writes are a live-demo switch, not the resting state.
// Env: AGENT_PASSCODE, AGENT_ALLOW_WRITES, MUSE_AGENT_URL, MUSE_AGENT_TOKEN (optional),
//      ANTHROPIC_API_KEY, META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_PAGE_ID.
import Anthropic from "@anthropic-ai/sdk";
import { createHash, timingSafeEqual } from "node:crypto";

const client = new Anthropic();
const ALLOW_WRITES = process.env.AGENT_ALLOW_WRITES === "true";
const READ_TOOLS = ["ads_get_ad_accounts", "ads_get_ad_entities", "ads_get_ad_videos", "ads_get_creatives", "ads_insights_performance_trend"];
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const failures = new Map(); // best-effort, per warm instance

function passcodeOk(given) {
  const expected = process.env.AGENT_PASSCODE;
  if (!expected || typeof given !== "string") return false;
  const digest = (s) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

const SYSTEM = `You are Corgi Ads, a friendly ad agent for the Corgi Pop soda brand (a fictional drink made for a hackathon demo).
You manage the Meta ad account act_${process.env.META_AD_ACCOUNT_ID?.replace(/^act_/, "")} and Facebook Page ${process.env.META_PAGE_ID} through the Meta ads tools: upload media, build creatives, campaigns, ad sets and ads, publish, pause, change budgets, and read spend, CTR, CPC, trends, anomalies, previews, and activity logs.
${ALLOW_WRITES
  ? `Spending rules: never set a campaign or ad set budget above $20, and before you publish anything or raise a budget, state the exact amount and get a clear "yes" from the user in this chat.`
  : `You are in read-only mode: you can read spend, entities, creatives and trends but cannot publish, pause or change budgets. If asked to change something, say what you would do and that changes are disabled in this demo.`}
Keep answers short and concrete: lead with the number or the answer, then one line of recommendation. Use plain text, no markdown tables.`;

async function askMuse(messages) {
  const r = await fetch(process.env.MUSE_AGENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.MUSE_AGENT_TOKEN ? { Authorization: `Bearer ${process.env.MUSE_AGENT_TOKEN}` } : {}),
    },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(110_000),
  });
  if (!r.ok) throw new Error(`Muse agent returned ${r.status}`);
  const data = await r.json();
  return { reply: String(data.reply ?? data.text ?? data.message ?? ""), tools: Array.isArray(data.tools) ? data.tools : [], agent: "muse" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = clientIp(req);
  const record = failures.get(ip);
  if (record && record.count >= MAX_FAILURES && Date.now() - record.at < LOCKOUT_MS) {
    return res.status(429).json({ error: "Too many wrong passcodes. Try again later." });
  }
  if (!passcodeOk(req.headers["x-agent-passcode"])) {
    failures.set(ip, { count: (record?.count || 0) + 1, at: Date.now() });
    return res.status(401).json({ error: "Wrong passcode" });
  }
  failures.delete(ip);
  const history = Array.isArray(req.body?.messages) ? req.body.messages.slice(-20) : [];
  const messages = history
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "Last message must be from the user" });
  }

  if (ALLOW_WRITES && process.env.MUSE_AGENT_URL) {
    try {
      return res.status(200).json(await askMuse(messages));
    } catch (err) {
      return res.status(502).json({ error: `Couldn't reach Zen's Muse agent (${err.message})` });
    }
  }

  try {
    const response = await client.beta.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 4000,
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
      tools: [ALLOW_WRITES
        ? { type: "mcp_toolset", mcp_server_name: "meta_ads" }
        : { type: "mcp_toolset", mcp_server_name: "meta_ads", default_config: { enabled: false },
            configs: Object.fromEntries(READ_TOOLS.map((name) => [name, { enabled: true }])) }],
      messages,
    });

    if (response.stop_reason === "refusal") {
      return res.status(200).json({ reply: "I can't help with that one.", tools: [] });
    }
    const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const tools = response.content.filter((b) => b.type === "mcp_tool_use").map((b) => b.name);
    return res.status(200).json({ reply: reply || "(no answer)", tools, agent: "fallback" });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Busy, try again in a moment." });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude API error ${err.status}` });
    return res.status(500).json({ error: "Agent failed" });
  }
}
