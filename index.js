#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { gzipSync, gunzipSync } from 'zlib';

// server

const server = new Server(
  { name: 'claude-context-share', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

// compress and decompress helpers

function pack(obj) {
  return gzipSync(Buffer.from(JSON.stringify(obj), 'utf8')).toString('base64url');
}

function unpack(b64url) {
  return JSON.parse(gunzipSync(Buffer.from(b64url, 'base64url')).toString('utf8'));
}

// tools stuff

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // excode
    {
      name: 'ccs_export',
      description: `
Export this conversation to a compact shareable code.

Trigger when: user says /excode, "export this chat", "share this conversation", or similar.

IMPORTANT — how to call this correctly:
1. Pass ALL messages from this conversation in "messages" (every human and assistant turn, full content, nothing truncated).
2. If ccs_import was called earlier in this conversation and returned a "chain_token", pass that exact string as "chain_token" here. This is what links all the chats together.
3. If no chain_token exists, omit it.

The returned code encodes the FULL chain (all previously imported chats + this one).
Anyone with the plugin can paste it with /incode to get everything.
      `.trim(),
      inputSchema: {
        type: 'object',
        required: ['messages'],
        properties: {
          messages: {
            type: 'array',
            description: 'Every message in this conversation, in order. Do NOT truncate. Include full code blocks, file contents, everything.',
            items: {
              type: 'object',
              required: ['role', 'content'],
              properties: {
                role: { type: 'string', enum: ['human', 'assistant'] },
                content: { type: 'string' },
              },
            },
          },
          title: {
            type: 'string',
            description: 'Short title describing this conversation segment.',
          },
          chain_token: {
            type: 'string',
            description: 'The chain_token returned by ccs_import earlier in this conversation, if any. Pass it back exactly as received — do not modify it.',
          },
        },
      },
    },

    // incode
    {
      name: 'ccs_import',
      description: `
Decode a CCS code and load its full conversation chain into this chat.

Trigger when: user pastes /incode [code], or pastes a string starting with CCS2:, CCS1:, or CCS0:.
Works at ANY point in the conversation — start, middle, anywhere.

IMPORTANT — after calling this tool:
1. Read the full transcript returned. Remember ALL of it as your own history.
2. STORE the returned "chain_token" string in your context — you MUST pass it to ccs_export if the user later runs /excode. This is what chains the conversations together.
3. If this conversation already had a chain_token (from a previous /incode), pass it as "existing_chain_token" so the chains are merged in order.
4. Briefly recap what the loaded conversation(s) were about, then ask how to continue.
      `.trim(),
      inputSchema: {
        type: 'object',
        required: ['code'],
        properties: {
          code: {
            type: 'string',
            description: 'The full CCS export code (starts with CCS2:, CCS1:, or CCS0:)',
          },
          existing_chain_token: {
            type: 'string',
            description: 'If this chat already imported a chain earlier, pass that chain_token here so the two chains are merged in order.',
          },
        },
      },
    },
  ],
}));

// more tool stuff

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // exporting
  if (name === 'ccs_export') {
    const {
      messages = [],
      title = 'Shared Conversation',
      chain_token,
    } = args;

    if (messages.length === 0) {
      return err('No messages to export. Make sure you pass all conversation messages.');
    }

    // decode existing chain
    let chain = [];
    if (chain_token) {
      try {
        chain = unpack(chain_token);
        if (!Array.isArray(chain)) chain = [];
      } catch {
        return err('chain_token is corrupted. Try exporting without it.');
      }
    }
    
    const segment = {
      title,
      at: new Date().toISOString(),
      msgs: messages,
    };
    const fullChain = [...chain, segment];

    // build the v2 payload
    const payload = { v: 2, chain: fullChain };
    const code = 'CCS2:' + pack(payload);

    const totalMsgs = fullChain.reduce((n, s) => n + s.msgs.length, 0);
    const chainSummary = fullChain.map((s, i) =>
      `  ${i + 1}. "${s.title}" — ${s.msgs.length} messages (${s.at?.slice(0, 10) ?? 'unknown date'})`
    ).join('\n');

    return ok([
      `✅ **Exported — ${fullChain.length} chat${fullChain.length > 1 ? 's' : ''} in this chain**`,
      ``,
      `**Chain contents:**`,
      chainSummary,
      ``,
      `**Total messages across all chats:** ${totalMsgs}`,
      ``,
      `**Share this code** — anyone with the plugin pastes \`/incode [code]\` to get everything:`,
      `─────────────────────────────────────────`,
      code,
      `─────────────────────────────────────────`,
    ].join('\n'));
  }

  // importing
  if (name === 'ccs_import') {
    const { code, existing_chain_token } = args;

    if (!code) return err('No code provided.');

    // decode the incoming code
    let incomingChain = [];
    try {
      if (code.startsWith('CCS2:')) {
        const payload = unpack(code.slice(5));
        incomingChain = payload.chain ?? [];
      } else if (code.startsWith('CCS1:')) {
        // v1 — single conversation, wrap it as one segment
        const payload = unpack(code.slice(5));
        incomingChain = [{
          title: payload.title ?? 'Imported chat',
          at: payload.at ?? '',
          msgs: payload.msgs ?? payload.messages ?? [],
        }];
      } else if (code.startsWith('CCS0:')) {
        const payload = JSON.parse(Buffer.from(code.slice(5), 'base64').toString('utf8'));
        incomingChain = [{
          title: payload.title ?? 'Imported chat',
          at: payload.at ?? '',
          msgs: payload.msgs ?? payload.messages ?? [],
        }];
      } else {
        return err('Unrecognised code format. Make sure you copied the full code starting with CCS2:, CCS1:, or CCS0:');
      }
    } catch (e) {
      return err(`Failed to decode: ${e.message}`);
    }

    if (incomingChain.length === 0 || incomingChain.every(s => s.msgs.length === 0)) {
      return err('No messages found in this code.');
    }

    // merge with any existing chain in this chat (for multiple /incode calls)
    let existingChain = [];
    if (existing_chain_token) {
      try {
        existingChain = unpack(existing_chain_token);
        if (!Array.isArray(existingChain)) existingChain = [];
      } catch { /* ignore corrupt token */ }
    }

    const mergedChain = [...existingChain, ...incomingChain];

    // build the chain_token Claude must hold onto
    const chain_token = pack(mergedChain);

    // build a readable transcript of all segments
    const transcriptParts = mergedChain.map((segment, si) => {
      const header = `${'═'.repeat(60)}\nCHAT ${si + 1} OF ${mergedChain.length}: "${segment.title}" (${segment.at?.slice(0, 10) ?? 'unknown date'})\n${'═'.repeat(60)}`;
      const msgs = segment.msgs.map((m, mi) => {
        const speaker = m.role === 'human' ? '👤 Human' : '🤖 Assistant';
        return `### [${si + 1}.${mi + 1}] ${speaker}\n${m.content}`;
      }).join('\n\n---\n\n');
      return `${header}\n\n${msgs}`;
    }).join('\n\n\n');

    const totalMsgs = mergedChain.reduce((n, s) => n + s.msgs.length, 0);
    const chainSummary = mergedChain.map((s, i) =>
      `  ${i + 1}. "${s.title}" — ${s.msgs.length} messages`
    ).join('\n');

    return ok([
      `📥 **Loaded ${mergedChain.length} chat${mergedChain.length > 1 ? 's' : ''} — ${totalMsgs} messages total**`,
      ``,
      `**Chain:**`,
      chainSummary,
      ``,
      `⚠️ CRITICAL INSTRUCTION — READ BEFORE RESPONDING:`,
      `You now have the full history of every conversation in this chain.`,
      `Treat all of it as your own memory — every line of code, every decision, every file.`,
      `Also: STORE this chain_token. You MUST pass it to ccs_export if the user runs /excode:`,
      ``,
      `chain_token: ${chain_token}`,
      ``,
      `${'═'.repeat(60)}`,
      `FULL CHAIN TRANSCRIPT`,
      `${'═'.repeat(60)}`,
      ``,
      transcriptParts,
      ``,
      `${'═'.repeat(60)}`,
      `END OF CHAIN — you are fully caught up on all ${mergedChain.length} conversations.`,
      `${'═'.repeat(60)}`,
      ``,
      `Now briefly recap what was being worked on across these chats and ask how to continue.`,
    ].join('\n'));
  }

  return err(`Unknown tool: ${name}`);
});

// ─── Response helpers ─────────────────────────────────────────────────────────

function ok(text) {
  return { content: [{ type: 'text', text }] };
}
function err(text) {
  return { isError: true, content: [{ type: 'text', text: `❌ ${text}` }] };
}

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
