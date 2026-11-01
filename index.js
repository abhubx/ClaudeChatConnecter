#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { gzipSync, gunzipSync } from 'zlib';

const server = new Server(
  { name: 'claude-chat-connecter', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

function pack(obj) {
  return gzipSync(Buffer.from(JSON.stringify(obj), 'utf8')).toString('base64url');
}

function unpack(str) {
  return JSON.parse(gunzipSync(Buffer.from(str, 'base64url')).toString('utf8'));
}

function ok(text) {
  return { content: [{ type: 'text', text }] };
}

function fail(text) {
  return { isError: true, content: [{ type: 'text', text }] };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'ccs_export',
      description: `
Export this conversation to a shareable code.

Trigger when: user says /excode, "export this chat", "share this conversation", or similar.

How to call this:
1. Pass every message in this conversation in "messages". Do not truncate anything.
2. If ccs_import was called earlier and returned a chain_token, pass it here. That's what links chats together.
3. If there's no chain_token, leave it out.
      `.trim(),
      inputSchema: {
        type: 'object',
        required: ['messages'],
        properties: {
          messages: {
            type: 'array',
            description: 'Every message in this conversation in order. Include everything, no truncation.',
            items: {
              type: 'object',
              required: ['role', 'content'],
              properties: {
                role: { type: 'string', enum: ['human', 'assistant'] },
                content: { type: 'string' }
              }
            }
          },
          title: {
            type: 'string',
            description: 'Short title for this conversation.'
          },
          chain_token: {
            type: 'string',
            description: 'The chain_token from a previous ccs_import call in this conversation. Pass it back exactly as received.'
          }
        }
      }
    },
    {
      name: 'ccs_import',
      description: `
Decode a CCS code and load the conversation chain into this chat.

Trigger when: user pastes /incode [code], or pastes a string starting with CCS2:, CCS1:, or CCS0:.
Works anywhere in the conversation, not just at the start.

After calling this:
1. Read the full transcript. Treat it as your own memory.
2. Hold onto the chain_token in the response. Pass it to ccs_export if the user runs /excode later.
3. If this chat already has a chain_token from a previous /incode, pass it as existing_chain_token so they merge.
4. Summarize what was loaded and ask how to continue.
      `.trim(),
      inputSchema: {
        type: 'object',
        required: ['code'],
        properties: {
          code: {
            type: 'string',
            description: 'The CCS code to import. Starts with CCS2:, CCS1:, or CCS0:.'
          },
          existing_chain_token: {
            type: 'string',
            description: 'chain_token from a previous /incode in this chat. Pass it so the chains merge in order.'
          }
        }
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'ccs_export') {
    const { messages = [], title = 'untitled', chain_token } = args;

    if (messages.length === 0) {
      return fail('warning: no messages to export');
    }

    let chain = [];
    if (chain_token) {
      try {
        chain = unpack(chain_token);
        if (!Array.isArray(chain)) chain = [];
      } catch {
        return fail('warning: chain_token is corrupted, export aborted');
      }
    }

    const fullChain = [...chain, { title, at: new Date().toISOString(), msgs: messages }];
    const code = 'CCS2:' + pack({ v: 2, chain: fullChain });

    const totalMsgs = fullChain.reduce((n, s) => n + s.msgs.length, 0);
    const summary = fullChain.map((s, i) => `  ${i + 1}. ${s.title} (${s.msgs.length} messages)`).join('\n');

    return ok(`exported successfully\n\n${fullChain.length} chat(s), ${totalMsgs} messages total\n\n${summary}\n\n${code}`);
  }

  if (name === 'ccs_import') {
    const { code, existing_chain_token } = args;

    if (!code) return fail('warning: no code provided');

    let incoming = [];
    try {
      if (code.startsWith('CCS2:')) {
        incoming = unpack(code.slice(5)).chain ?? [];
      } else if (code.startsWith('CCS1:')) {
        // v1 was a single conversation, wrap it as one segment
        const p = unpack(code.slice(5));
        incoming = [{ title: p.title ?? 'imported chat', at: p.at ?? '', msgs: p.msgs ?? p.messages ?? [] }];
      } else if (code.startsWith('CCS0:')) {
        const p = JSON.parse(Buffer.from(code.slice(5), 'base64').toString('utf8'));
        incoming = [{ title: p.title ?? 'imported chat', at: p.at ?? '', msgs: p.msgs ?? p.messages ?? [] }];
      } else {
        return fail('warning: unrecognised code format, must start with CCS2:, CCS1:, or CCS0:');
      }
    } catch (e) {
      return fail(`warning: failed to decode — ${e.message}`);
    }

    if (incoming.length === 0 || incoming.every(s => s.msgs.length === 0)) {
      return fail('warning: no messages found in this code');
    }

    let existing = [];
    if (existing_chain_token) {
      try {
        existing = unpack(existing_chain_token);
        if (!Array.isArray(existing)) existing = [];
      } catch {}
    }

    const chain = [...existing, ...incoming];

    // chain_token is how the accumulated chain survives between tool calls — claude holds it and passes it back on export
    const chain_token = pack(chain);

    const totalMsgs = chain.reduce((n, s) => n + s.msgs.length, 0);
    const summary = chain.map((s, i) => `  ${i + 1}. ${s.title} (${s.msgs.length} messages)`).join('\n');

    const transcript = chain.map((seg, si) => {
      const header = `--- chat ${si + 1}: ${seg.title} (${seg.at?.slice(0, 10) ?? 'unknown'}) ---`;
      const msgs = seg.msgs.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
      return `${header}\n\n${msgs}`;
    }).join('\n\n\n');

    return ok([
      `loaded ${chain.length} conversation(s), ${totalMsgs} messages total`,
      ``,
      summary,
      ``,
      `chain_token: ${chain_token}`,
      ``,
      `hold onto that chain_token and pass it to ccs_export if the user runs /excode.`,
      ``,
      `--- full transcript ---`,
      ``,
      transcript,
      ``,
      `--- end of transcript ---`,
      ``,
      `you now have full context of everything above. summarize what was being worked on and ask how to continue.`
    ].join('\n'));
  }

  return fail(`unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
