# Claude Chat Connecter

An MCP plugin for Claude that lets separate conversations share context through a portable exported code. Type `/excode` in any chat to get a shareable code; anyone else with the plugin pastes it with `/incode` and Claude loads the full history. Conversations chain — each export carries everything from all previously imported chats, so context accumulates across any number of sessions or accounts.

## How it works

The plugin registers two tools with Claude via MCP:

- `ccs_export` — triggered by `/excode`. Claude serializes every message in the current conversation, appends it to any accumulated chain from previous imports, compresses the result (gzip, base64url), and returns a `CCS2:` code.
- `ccs_import` — triggered by `/incode [code]`. Claude decodes the chain, reads the full transcript, and retains a `chain_token` in context. If you run `/excode` later in the same chat, Claude passes that token back to the tool so the chain is carried forward intact.

The server is stateless. Nothing is stored anywhere — the accumulated chain lives in Claude's context as an opaque compressed token passed between tool calls.

## Requirements

- Node.js 18 or later
- Claude Desktop or Claude Code

## Installation

No local clone or manual setup needed. Both Claude Desktop and Claude Code launch the MCP server automatically via `npx` when they start.

### Claude Desktop

Open the config file:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Add an entry under `mcpServers` (create the key if it doesn't exist):

```json
{
  "mcpServers": {
    "claude-chat-connecter": {
      "command": "npx",
      "args": ["-y", "github:yourusername/claude-chat-connecter"]
    }
  }
}
```

Replace `yourusername` with your GitHub username. Restart Claude Desktop.

### Claude Code

```bash
claude mcp add claude-chat-connecter -- npx -y github:yourusername/claude-chat-connecter
```

Again, replace `yourusername` with your actual GitHub username.

## Usage

### `/excode` — export a conversation

Type `/excode` at any point in a chat. Claude packages the entire conversation — including any previously imported chain — into a `CCS2:` code and displays it. Copy the code and share it however you like.

### `/incode [code]` — import a conversation

Paste the following into any chat, at the start or mid-conversation:

```
/incode CCS2:H4sIAAAAAAAAA...
```

Claude decodes and reads the full chain, then briefly summarizes what was loaded and asks how to continue.

You can run `/incode` more than once in the same chat. Each call merges the new chain into the existing one in order, so you can pull in context from multiple separate conversations before exporting.

### Chaining across multiple people

Each exported code contains the full history of everything imported into that chat before the export. It compounds:

```
Chat A  →  /excode  →  CCS2:aaa (contains: A)
Chat B  →  /incode CCS2:aaa  →  ...work continues...  →  /excode  →  CCS2:bbb (contains: A + B)
Chat C  →  /incode CCS2:bbb  →  ...work continues...  →  /excode  →  CCS2:ccc (contains: A + B + C)
```

There's no limit on chain depth.

## Example

Person A has been working through a bug:

```
/excode
```

Claude packages the conversation and returns a code. Person A sends it to Person B.

Person B opens a new Claude chat:

```
/incode CCS2:H4sIAAAAAAAAA6tWKkktLlGyUlIqS04tKU4tLk4tKkktLlGyUlIqS...
```

Claude responds:

```
Loaded 1 conversation — 22 messages.

You were debugging a race condition in a React useEffect. The issue was a stale
closure over `userId` in an async fetch callback. The cleanup wasn't cancelling
the in-flight request on unmount. You'd just introduced an AbortController and
were testing whether the ref-based approach was cleaner. Want to pick up there?
```

Person B continues, then runs `/excode`. The resulting code contains both conversations. Anyone who imports that gets the full thread from the beginning.

## Code format

All codes are self-contained and prefixed with a version tag:

| Prefix | Description |
|---|---|
| `CCS2:` | Current format. Supports chained conversations. |
| `CCS1:` | v1 single-conversation format. Importable by this plugin. |
| `CCS0:` | v0 uncompressed fallback format. Importable by this plugin. |

## Project structure

```
claude-chat-connecter/
├── src/
│   └── index.js    # MCP server — tool definitions and request handlers
├── package.json
├── README.md
└── LICENSE
```

The only runtime dependency is `@modelcontextprotocol/sdk`. Compression uses Node's built-in `zlib` module.

## Troubleshooting

**Claude ignores `/excode` or `/incode`**

The server probably isn't connected. In Claude Desktop, go to Settings → Developer → MCP Servers and check that `claude-chat-connecter` appears with a green status indicator. If it's missing, the JSON config likely has a syntax error — a trailing comma or mismatched brace is enough to break it silently. Run the config file through a JSON validator.

In Claude Code, run `claude mcp list` to see registered servers and their status.

**`npx` fails on startup**

Check that `node --version` returns 18 or higher. On macOS with Homebrew, the `npx` binary may not be on the PATH that Claude Desktop inherits. If that's the case, use the full path to npx in the config:

```json
{
  "mcpServers": {
    "claude-chat-connecter": {
      "command": "/opt/homebrew/bin/npx",
      "args": ["-y", "github:yourusername/claude-chat-connecter"]
    }
  }
}
```

Find the correct path with `which npx`.

**"Unrecognised code format" when importing**

The code wasn't copied in full. CCS codes can be several kilobytes — make sure nothing was truncated, particularly at the end. The code must start with `CCS2:`, `CCS1:`, or `CCS0:` and contain no line breaks or extra whitespace.

**Chain is missing after `/excode` following an `/incode`**

The chain is preserved through a `chain_token` that Claude holds in context and passes back to the tool on export. If Claude doesn't do this automatically, prompt it: *"use the chain token from the import when you export."* The token is explicitly included in the `/incode` response, but in a long conversation it can drift out of active attention.

## License

MIT — see [LICENSE](./LICENSE).
