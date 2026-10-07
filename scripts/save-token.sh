#!/bin/zsh
# Reads the Meta token from the clipboard into .env without printing it.
set -e
umask 077
f=${ENV_FILE:-$HOME/corgihack-secrets/.env}
t=$(pbpaste | tr -d '[:space:]')
if [[ ! "$t" =~ ^EAA[A-Za-z0-9]{50,}$ ]]; then echo "Clipboard doesn't look like a Meta token (len ${#t}). Not saved."; exit 1; fi
{ echo "META_ACCESS_TOKEN=$t"; echo "META_AD_ACCOUNT_ID=${1:-act_0000000000000000}"; echo "META_PAGE_ID=0000000000000000"; } > "$f"
chmod 600 "$f"
printf '' | pbcopy
echo "Saved token (length ${#t}) to $f, mode $(stat -f %Lp "$f"). Clipboard cleared."
