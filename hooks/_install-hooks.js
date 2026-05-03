#!/usr/bin/env node
'use strict';

/**
 * _install-hooks.js — settings.json merger for thinkframe setup.sh.
 *
 * Reads paths from environment variables (no shell interpolation into JS source).
 * Idempotent: skips entries that already exist.
 */

const fs = require('fs');
const path = require('path');

// Normalize paths for cross-platform safety:
// On Windows, JSON-quoted commands with backslashes break shell parsing.
// Use forward slashes + double-quote the path argument.
function quoteCmd(execPath) {
  if (!execPath) return '';
  const norm = execPath.split(path.sep).join('/');
  return 'node "' + norm + '"';
}

const settingsPath = process.env.THINKFRAME_SETTINGS;
const advisorCmd = quoteCmd(process.env.THINKFRAME_ADVISOR);
const verifyCmd = quoteCmd(process.env.THINKFRAME_VERIFY);
const guardCmd = quoteCmd(process.env.THINKFRAME_GUARD);

if (!settingsPath || !process.env.THINKFRAME_ADVISOR || !process.env.THINKFRAME_VERIFY || !process.env.THINKFRAME_GUARD) {
  console.error('Missing required env vars (THINKFRAME_SETTINGS, THINKFRAME_ADVISOR, THINKFRAME_VERIFY, THINKFRAME_GUARD).');
  process.exit(1);
}

let s;
if (fs.existsSync(settingsPath)) {
  s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} else {
  s = {};
}

s.hooks = s.hooks || {};
s.hooks.UserPromptSubmit = s.hooks.UserPromptSubmit || [];
s.hooks.Stop = s.hooks.Stop || [];
s.hooks.PreToolUse = s.hooks.PreToolUse || [];

if (!JSON.stringify(s.hooks.UserPromptSubmit).includes('skill-advisor')) {
  s.hooks.UserPromptSubmit.unshift({
    matcher: '',
    hooks: [{ type: 'command', command: advisorCmd }]
  });
}

if (!JSON.stringify(s.hooks.Stop).includes('verify-step6')) {
  s.hooks.Stop.push({
    matcher: '',
    hooks: [{ type: 'command', command: verifyCmd }]
  });
}

if (!JSON.stringify(s.hooks.PreToolUse).includes('agent-model-guard')) {
  s.hooks.PreToolUse.push({
    matcher: 'Agent|Task',
    hooks: [{ type: 'command', command: guardCmd }]
  });
}

fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
console.log('✓ Hooks wired in', settingsPath);
