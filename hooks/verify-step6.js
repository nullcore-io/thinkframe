#!/usr/bin/env node
'use strict';

/**
 * verify-step6.js — Stop hook
 *
 * If this turn included Edit/Write/MultiEdit tool calls AND no STEP 6
 * VERIFICATION block was emitted in the assistant transcript, block the stop
 * with a reminder to run STEP 6.
 *
 * Triggers thinkframe / royal-treatment STEP 6 enforcement.
 */

const fs = require('fs');

let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  try { run(raw); } catch { process.exit(0); }
});

function run(raw) {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  const transcriptPath = input.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) process.exit(0);

  // Don't loop on our own reminder — if previously blocked, allow stop now
  if (input.stop_hook_active) process.exit(0);

  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);

  // Find the boundary of THIS user turn (last user message)
  let lastUserIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]);
      if (e.type === 'user' && !e.isMeta) { lastUserIdx = i; break; }
    } catch {}
  }
  if (lastUserIdx === -1) process.exit(0);

  const turnLines = lines.slice(lastUserIdx);

  let editFound = false;
  let verificationFound = false;
  let verifyBypassRequested = false;

  for (const line of turnLines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }

    // Check for code-modifying tool calls
    if (e.type === 'assistant' && e.message?.content) {
      for (const c of e.message.content) {
        if (c.type === 'tool_use' && /^(Edit|Write|MultiEdit)$/.test(c.name)) {
          editFound = true;
        }
        if (c.type === 'text' && typeof c.text === 'string') {
          if (/✅\s*VERIFICATION/i.test(c.text)) verificationFound = true;
          if (/\[ROYAL:VERIFY-SKIP\]/i.test(c.text)) verifyBypassRequested = true;
        }
      }
    }

    // Check user message for explicit skip
    if (e.type === 'user' && e.message?.content) {
      const txt = typeof e.message.content === 'string'
        ? e.message.content
        : JSON.stringify(e.message.content);
      if (/\/quick\b|skip\s+verification/i.test(txt)) verifyBypassRequested = true;
    }
  }

  if (editFound && !verificationFound && !verifyBypassRequested) {
    // Block stop, remind Claude to run STEP 6
    process.stderr.write(
      'STOP BLOCKED: Code was modified this turn but STEP 6 VERIFICATION did not run.\n' +
      'Per Skill("royal-treatment") STEP 6: dispatch 3 parallel Agent() calls (Reviewer + Auditor + Tester) with explicit model: params, emit the ✅ VERIFICATION block, then stop.\n' +
      'To bypass intentionally, include "[ROYAL:VERIFY-SKIP]" in output or have user prefix prompt with /quick.\n'
    );
    process.exit(2);
  }

  process.exit(0);
}
