# Claude Context Share

> Share full Claude conversations with anyone. One code exports everything — every message, all code, all context. Paste it in any chat and Claude picks up exactly where you left off.

---

## Install in 1 command

### Claude Desktop

Open your Claude Desktop config file:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Add this block (or merge into your existing `mcpServers`):

```json
{
  "mcpServers": {
    "claude-context-share": {
      "command": "npx",
      "args": ["-y", "github:yourusername/claude-context-share"]
    }
  }
}
```

Save the file and **restart Claude Desktop**. Done.

---

### Claude Code (one terminal command)

```bash
claude mcp add claude-context-share -- npx -y github:yourusername/claude-context-share
```

---

## Usage

Once installed, just talk to Claude like normal. The plugin adds two commands:

### `/excode` — Export a conversation

Type this in any chat:

```
/excode
```

Claude will pack up the **entire conversation** — every message, all code, all context — into a compact shareable code and show it to you. Copy it and send it to whoever you want.

---

### `/incode [code]` — Import someone's conversation

Paste this in a fresh chat:

```
/incode CCS1:H4sIAAAAAAAAA6tWKkktLlGyUlIqS...
```

Claude instantly reads the full transcript and picks up exactly where the other person left off. Same context, same code, same everything.

---

## How it works

```
Your chat  →  /excode  →  Claude calls ccs_export tool
                        →  Packs all messages into compressed JSON
                        →  Returns a CCS1: code (base64url gzip)

Their chat →  /incode [code]  →  Claude calls ccs_import tool
                               →  Decodes the full transcript
                               →  Claude reads it and continues seamlessly
```

No servers. No accounts. No storage. The entire conversation lives in the code itself — it's just compressed text you can paste anywhere.

---

## Example flow

**Person A** is debugging a React component with Claude:

```
> /excode

✅ Conversation exported!
💬 Messages: 24
Share this code:
─────────────────────────────────────────
CCS1:H4sIAAAAAAAAA6tWKkktLlGyUlIqS04tKU...
─────────────────────────────────────────
```

**Person B** opens a new Claude chat and pastes:

```
> /incode CCS1:H4sIAAAAAAAAA6tWKkktLlGyUlIqS...

📥 Conversation loaded!
💬 24 messages · "React useEffect bug"

I've read the full conversation. You were debugging a race condition
in your useEffect — the async fetch wasn't being cancelled on unmount.
You had just added the cleanup function. Want to continue from there?
```

---

## Requirements

- Node.js 18 or higher
- Claude Desktop **or** Claude Code

---

## License

MIT
