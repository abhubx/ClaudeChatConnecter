# Claude Chat Connecter

MCP plugin for Claude that lets you share conversations between chats using a generated code. Paste the code in another chat and Claude knows everything that was said all the context, code, decisions, whatever. Works across accounts too.

## Requirements

- Node.js 18+
- Claude Desktop or Claude Code

## Install

You don't need to clone anything or run a server manually. Claude starts the MCP process itself using npx.

### Claude Desktop

Find your config file:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Add this to it (or merge `mcpServers` if you already have one):

```json
{
  "mcpServers": {
    "claude-chat-connecter": {
      "command": "npx",
      "args": ["-y", "github:abhubx/ClaudeChatConnecter"]
    }
  }
}
```

Restart Claude Desktop after saving.

### Claude Code

```bash
claude mcp add claude-chat-connecter -- npx -y github:abhubx/ClaudeChatConnecter
```

## Usage

Export the current chat:

```
/excode
```

Claude gives you a `CCS2:...` code. Copy it.

Import it in another chat (yours or someone else's):

```
/incode CCS2:H4sIAAAAAAAAA6tW...
```

Claude reads everything and picks up where it left off. Works at the start of a chat or in the middle of one.

## Example

You've been working on something with Claude for a while and want to hand it off:

```
you: /excode
```

Claude spits out a code. You send it to your friend.

Your friend opens a new chat:

```
them: /incode CCS2:H4sIAAAAAAAAA6tWKkktLlGyUlIq...

claude: loaded 1 conversation, 24 messages.

you were debugging a race condition in a useEffect — stale closure over
userId in an async fetch that wasn't getting cancelled on unmount. you
just added an AbortController. want to keep going from there?
```

Your friend keeps working, then does `/excode`. Now the code has both conversations in it.

## Troubleshooting

**Claude doesn't do anything when I type `/excode` or `/incode`**

The server isn't connected. In Claude Desktop go to Settings → Developer → MCP Servers and check if `claude-chat-connecter` shows up. If it's not there, your JSON config has a syntax error — run it through [jsonlint.com](https://jsonlint.com) and check for missing commas or braces.

In Claude Code: `claude mcp list`

**npx fails when Claude tries to start the server**

Run `node --version` and make sure it's 18 or higher. On macOS with Homebrew, Claude Desktop sometimes can't find npx because of PATH issues. Fix it by using the full path:

```json
"command": "/opt/homebrew/bin/npx"
```

Run `which npx` to get the right path for your machine.

**"Unrecognised code format" error**

You didn't copy the full code. They can get long. Make sure it starts with `CCS2:` and has nothing cut off at the end.

**Chain didn't carry over when I exported**

The chain survives through a token Claude holds in memory. If it gets lost in a long conversation you can just tell Claude "include the chain token when you export" and it'll sort it out.
