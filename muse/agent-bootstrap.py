"""Install persistent agent tools. Never print credential input or command output."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


def run(args, *, timeout=180):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                            env={**os.environ, "NO_COLOR": "1"})
    if result.returncode:
        # argv and output may contain a credential. Return only an operation label.
        raise RuntimeError(f"{Path(args[0]).name} {args[1] if len(args) > 1 else ''} failed (exit {result.returncode})")
    return result.stdout


def install(version, key_file):
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise RuntimeError("Invalid Monid CLI version")
    key = None
    try:
        if key_file.exists():
            key_file.chmod(0o600)
            key = json.loads(key_file.read_text()).get("api_key")
        missing = [name for name in ("node", "npm", "python3", "ffmpeg", "ffprobe") if not shutil.which(name)]
        if missing:
            raise RuntimeError("Agent image is missing: " + ", ".join(missing))
        root = Path.home() / ".local/share/muse/monid"
        cli = root / "node_modules/.bin/monid"
        manifest = root / "node_modules/@monid-ai/cli/package.json"
        if not manifest.exists() or json.loads(manifest.read_text()).get("version") != version:
            root.mkdir(parents=True, exist_ok=True)
            run(["npm", "install", "--prefix", str(root), "--no-audit", "--no-fund", "--ignore-scripts", f"@monid-ai/cli@{version}"])
            run([str(cli), "setup", "--client", "hermes"])
        bin_dir = Path.home() / ".local/bin"
        bin_dir.mkdir(parents=True, exist_ok=True)
        link = bin_dir / "monid"
        # Preserve a pre-existing user executable. The full managed path still works.
        if not link.exists() and not link.is_symlink():
            link.symlink_to(cli)
        active = False
        if key:
            label = "muse-" + hashlib.sha256(key.encode()).hexdigest()[:12]
            records = json.loads(run([str(cli), "keys", "list", "--json"]))
            if isinstance(records, dict):
                records = records.get("data", [])
            if not any(row.get("label") == label for row in records):
                run([str(cli), "keys", "add", "--key", key, "--label", label, "--json"])
            run([str(cli), "keys", "activate", "--label", label])
            run([str(cli), "whoami", "--json"], timeout=45)
            active = True
        return {"monid": {"version": version, "authenticated": active},
                "media": {"python3": True, "ffmpeg": True, "ffprobe": True}}
    finally:
        key_file.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        print(json.dumps(install(sys.argv[1], Path.home() / "muse/.setup/monid-key.json")))
    except Exception as error:
        # Our own messages contain no secrets; suppress subprocess/JSON exception text.
        message = str(error) if type(error) is RuntimeError else type(error).__name__
        print(json.dumps({"error": message}), file=sys.stderr)
        sys.exit(1)
