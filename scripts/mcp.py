#!/usr/bin/env python3
# Usage: mcp.py <tool_name> '<json args>'  -- calls Meta Ads MCP with the token from .env; never prints it.
import json, os, sys, urllib.request
env = {}
for line in open(os.path.expanduser(os.environ.get("ENV_FILE", "~/corgihack-secrets/.env"))):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1); env[k] = v
tok = env["META_ACCESS_TOKEN"]
body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": sys.argv[1], "arguments": json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}}}
req = urllib.request.Request("https://mcp.facebook.com/ads", data=json.dumps(body).encode(),
      headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json",
               "Accept": "application/json, text/event-stream"})
raw = urllib.request.urlopen(req, timeout=180).read().decode()
if not raw.lstrip().startswith("{"):
    raw = "".join(l[5:] for l in raw.splitlines() if l.startswith("data:"))
out = json.loads(raw)
res = out.get("result", out)
sc = res.get("structuredContent")
text = json.dumps(sc, indent=1) if sc else "\n".join(c.get("text", "") for c in res.get("content", [])) or json.dumps(out)
print(text.replace(tok, "[REDACTED]")[:6000])
