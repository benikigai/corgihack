#!/bin/zsh
# Verifies the token against Graph API and the Ads MCP server. Never prints the token.
set -a; source "${ENV_FILE:-$HOME/corgihack-secrets/.env}"; set +a
echo "== Graph /me/adaccounts"
curl -s "https://graph.facebook.com/v26.0/me/adaccounts?fields=name,account_id,account_status&access_token=$META_ACCESS_TOKEN"; echo
echo "== Ads MCP tools/list"
curl -s -X POST "https://mcp.facebook.com/ads" -H "Authorization: Bearer $META_ACCESS_TOKEN" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" --data-raw '{"jsonrpc":"2.0","method":"tools/list","id":1}' | grep -o '"name":"[^"]*"' | head -60
