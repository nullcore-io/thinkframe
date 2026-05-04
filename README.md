# thinkframe

Self-verifying orchestration layer for Claude Code. Drop-in skill set that transforms any vague prompt into a planned, executed, reviewed, and auto-fixed result.

## What it does

Every prompt goes through a 7-step pipeline automatically:

```
STEP 1  Rewrite + surface assumptions (asks before guessing)
STEP 2  Pick best skills/plugins for the task
STEP 2.5 Token budget: Haiku/Sonnet/Opus routing + context-mode
STEP 3  Decompose into tasks if ≥3 deliverables
STEP 4  Emit plan preamble
STEP 5  Execute (parallel agents, terse briefs, artifacts to files)
STEP 6  Verify (Reviewer + Auditor + Tester in parallel)
STEP 7  Fix loop — plan fix → apply → re-verify (max 3 iterations, then escalate)
```

## Prerequisites

- [Claude Code](https://claude.ai/code) installed
- Node.js ≥ 18 (for the hook script)
- macOS or Linux (Windows: use Git Bash or WSL)

## Skills included

| Skill | Purpose |
|-------|---------|
| `royal-treatment` | Main orchestration pipeline (STEP 1–7) |
| `model-route` | Cost-aware model routing — Opus/Sonnet/Haiku by task type |

## Install

```bash
git clone https://github.com/nullcore-io/thinkframe.git
cd thinkframe
chmod +x setup.sh && ./setup.sh
```

`setup.sh` does everything:
- Copies skills to `~/.claude/skills/`
- Copies `hooks/skill-advisor.js` to `~/.claude/scripts/hooks/`
- Wires the `UserPromptSubmit` hook in `~/.claude/settings.json` (creates it if missing)

Restart Claude Code after install. Done.

## Model routing

| Model | Task type | Cost ratio |
|-------|-----------|------------|
| Haiku 4.5 | Lint, format, summarize, simple edits | 1x |
| Sonnet 4.6 | Code writing, review, research | 3x |
| Opus 4.7 | Planning, architecture, security audit | 15x |

Routing Haiku aggressively on worker tasks cuts session cost 40-70%.

## Verification (STEP 6)

After every execution, 3 agents run in parallel:

- **Reviewer** (`code-reviewer`) — did output match the request?
- **Auditor** (`security-reviewer`) — any leaks, injections, auth gaps?
- **Tester** (`tdd-guide` / `e2e-runner`) — do tests pass?

CRITICAL/HIGH failures trigger the fix loop (STEP 7). Task never marked complete until all pass or user decides.

## Fix loop (STEP 7)

```
STEP 6 FAIL → 7A plan fix (Opus) → 7B apply fix (Sonnet) → 7C re-verify
                                                                    ↓
                                                           PASS → ship
                                                           FAIL < 3 → loop
                                                           FAIL = 3 → escalate to user
```

## Clarify-before-assume rule

Opus never silently picks between approaches. If the prompt is ambiguous across any of:
- Multiple valid approaches
- Missing scope
- Non-obvious defaults
- Business logic gaps
- External system behavior

It surfaces an `AskUserQuestion` before proceeding.

## Troubleshooting

### Agent stops mid-task with "Failed with non-blocking status code"

**Symptom:** Mid-orchestration the agent emits something like:

```
PostToolUse:Edit hook error
  Failed with non-blocking status code: No stderr output
```

…then idles until you ask "why did you stop?".

**Cause:** Some other PostToolUse / PreToolUse hook in your `~/.claude/settings.json` exited non-zero with empty stderr — typically a third-party hook that shells out to `node -e`, `bash`, `tsc`, `eslint`, or similar binaries on Windows. Claude Code labels the failure "non-blocking" but injects the error text into the model's context, and the model derails.

**Mitigation already shipped:** The `royal-treatment` skill contains a HOOK NOISE section that tells the model to ignore these messages and continue. After installing thinkframe + restarting Claude Code, royal-treatment runs will keep going.

**To find the offending hook yourself:**

```bash
grep -B1 -A2 'PostToolUse\|PreToolUse' ~/.claude/settings.json
```

Look for entries that shell out to `node -e`, raw shell scripts, or external binaries with Windows-style paths. Common culprits: `gsd-phase-boundary.sh`, anything piping `$FILE` through `node -e` inline.

**Permanent fix at the noisy hook:** add `2>/dev/null` to its command and ensure it always exits 0 unless it actually means to block.

## Related

- [patchframe](https://github.com/nullcore-io/patchframe) — token-efficient LLM edit protocol (companion project)

## License

- [MIT](https://github.com/nullcore-io/thinkframe/blob/master/LICENSE)
