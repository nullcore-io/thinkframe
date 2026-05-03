#!/usr/bin/env node
'use strict';

/**
 * agent-model-guard.js — PreToolUse hook on Agent / Task tool
 *
 * Rejects any Agent() / Task() dispatch that omits the `model` parameter.
 * Forces Claude to follow Skill("model-route") tier map: haiku | sonnet | opus.
 */

let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  try { run(raw); } catch { process.exit(0); }
});

const VALID = new Set(['haiku', 'sonnet', 'opus']);

function run(raw) {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  const tool = input.tool_name || '';
  if (tool !== 'Agent' && tool !== 'Task') process.exit(0);

  const ti = input.tool_input || {};
  const model = (ti.model || '').toLowerCase();

  if (!model || !VALID.has(model)) {
    process.stderr.write(
      `BLOCKED: ${tool}() dispatch missing valid model parameter.\n` +
      `Set model: "haiku" | "sonnet" | "opus" per Skill("model-route") tier map:\n` +
      `  haiku  → lint, format, summarize, simple edits\n` +
      `  sonnet → code writing, review, research, orchestration (default)\n` +
      `  opus   → planning, architecture, security audit, complex reasoning\n` +
      `Cost ratio Haiku:Sonnet:Opus ≈ 1:3:15 — pick the cheapest tier that fits.\n`
    );
    process.exit(2);
  }

  process.exit(0);
}
