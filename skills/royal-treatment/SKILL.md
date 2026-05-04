---
name: royal-treatment
description: >
  Auto-orchestration pipeline for vague/actionable prompts. Rewrites the prompt,
  picks the best skills/plugins/MCPs, decomposes into tasks if complex (≥3 deliverables),
  and delegates to agents. Triggered automatically via UserPromptSubmit hook on
  vague+actionable prompts. Can also be invoked manually: Skill("royal-treatment").
---

# Royal Treatment Pipeline

## LOOP GUARD — CHECK FIRST

If the conversation context already contains `[ROYAL:RAN]` marker OR the current message starts with `/quick`, output nothing and stop. Do not re-run this pipeline.

---

## HOOK NOISE — IGNORE AND CONTINUE

If a tool result contains text matching ANY of these patterns, treat it as hook framework noise — NOT a task failure, NOT a stop signal:

- `PostToolUse:* hook error`
- `PreToolUse:* hook error` (when followed by `non-blocking`)
- `Failed with non-blocking status code`
- `hook timed out`
- empty stderr with non-zero exit reported as "non-blocking"

**Required behavior:** continue the next planned step exactly as if the tool call had succeeded silently. Do NOT stop, do NOT idle, do NOT ask the user "why did you stop?". Do NOT abandon the orchestration.

**Only stop on a hook signal when:**
- Hook stdout contains JSON `{"decision": "block", ...}`
- Hook stdout contains `{"continue": false, ...}`
- Exit code 2 with explicit blocking message in stderr (e.g. `BLOCKED:`, `STOP BLOCKED:`)

This rule exists because third-party PostToolUse hooks (notably any that shell out to `node -e` or external binaries on Windows) routinely fail with empty stderr on backslash paths. Claude Code labels these "non-blocking" but injects the failure into the model's context — without this rule, the model sees the error and derails. Stay on task.

---

## STEP 1 — REWRITE PROMPT

Apply the prompt-engineer framework to the user's original message. Do this inline (no recursive Skill call).

Transform the raw input using:

**CONTEXT** → What is the background? What system/codebase/goal is involved?
**TASK** → Clear, unambiguous instruction. One action per sentence.
**OUTPUT FORMAT** → Specify structure (code blocks, sections, JSON, file paths, etc.)
**CONSTRAINTS** → What must NOT happen? (No hardcoded secrets, no breaking changes, etc.)
**ERROR HANDLING** → What to do if something is missing or ambiguous?

Principles:
- Clarity over verbosity
- Explicit over implicit
- Self-contained (no dependency on prior chat for context)
- Developer-ready outputs

Store as: **REWRITTEN_PROMPT**

---

**CLARIFY-BEFORE-ASSUME RULE (MANDATORY for plan mode / Opus):**

If REWRITTEN_PROMPT requires any of these, STOP and use `AskUserQuestion` before proceeding:
- Choosing between 2+ valid approaches (REST vs GraphQL, SQL vs NoSQL, etc.)
- Inferring missing scope (which files? which env? which users affected?)
- Picking non-obvious defaults (timeout values, retry counts, naming conventions)
- Filling business logic gaps (what happens on edge case X?)
- Assuming external system behavior (API contract, schema shape, auth flow)

Format: `AskUserQuestion` with 2-4 options, recommended first (labeled "(Recommended)").
Do NOT silently pick. Do NOT write "I'll assume X for now". Surface every ambiguity.

Exception: trivial universal defaults (e.g., HTTP 200 for success, 404 for not found).

---

## STEP 2 — PICK BEST SETUP

Using REWRITTEN_PROMPT, identify top 1-3 skills/plugins/MCPs to use. Prioritize:

| Category | Best skill/plugin |
|----------|------------------|
| Planning/arch | `ecc:plan`, `superpowers:brainstorm` |
| Code review | `ecc:code-review`, `security-review`, `typescript-reviewer` |
| Testing | `ecc:tdd`, `e2e-runner` |
| Frontend/UI | `frontend-design:frontend-design`, `ui-ux-pro-max:ui-ux-pro-max` |
| Database | `supabase`, `database-migrations` |
| Deploy | `vercel:deploy`, `deployment-patterns` |
| Debug | `superpowers:systematic-debugging`, `build-error-resolver` |
| Research | `ecc:deep-research`, `ecc:exa-search` |
| Agents/swarm | `ruflo-swarm:swarm`, `ruflo-autopilot:autopilot` |
| Claude API | `claude-api` |
| Security | `security-review`, `ecc:security-scan` |
| Prompt work | `prompt-engineer`, `prompt-optimizer` |
| Refactor | `refactor-cleaner`, `code-simplifier` |
| Git | `ruflo-jujutsu:git-workflow`, `github-ops` |

Store as: **SETUP_PICKS** (max 3, ranked)

---

## STEP 2.5 — TOKEN-MINIMIZATION STACK

Before decomposing, apply in order:

1. **Memory recall** — `get_observations([IDs])` or `mem-search` for prior work on this topic. Skip re-explaining context already known.
2. **Search-first** — check existing impls via `Skill("search-first")` before new code/research. Reuse > rewrite.
3. **Model tier** — invoke `Skill("model-route")` or use inline decision tree:
   - Haiku 4.5: repetitive/worker tasks (summarize, lint, format, simple transforms)
   - Sonnet 4.6: main dev work, orchestration, code review (default)
   - Opus 4.7: architecture, complex reasoning, planning only
   Pass `model: "haiku"|"sonnet"|"opus"` on every Agent() dispatch.
4. **Compress long docs** — if any doc/spec > 200 lines pulled in, run `Skill("caveman-compress")` first.
5. **Context-mode** — all tool output via `ctx_batch_execute`/`ctx_execute_file`. Never raw bash/grep into context.

**Output style throughout:** caveman full (fragments, no articles, no filler). Artifacts → Write to file, return path + 1 line. Never inline.

---

## STEP 3 — DECOMPOSE IF NEEDED

Count distinct deliverables in REWRITTEN_PROMPT.

**IF ≥3 distinct deliverables** (e.g., backend API + frontend UI + tests + deployment = 4):
- Break into named tasks
- Assign each a subagent_type from available agents
- Mark dependencies (Task B depends on Task A output)

**IF <3 deliverables**: single-pass, skip to Step 4.

Subagent type mapping:
- Planning → `planner`
- Architecture → `architect`
- Code writing → `code-architect` or `gsd-executor`
- Code review → `code-reviewer`
- Security → `security-reviewer`
- Testing → `tdd-guide`
- E2E → `e2e-runner`
- Research → `Explore`
- Build errors → `build-error-resolver`

---

## STEP 4 — EMIT PREAMBLE

Output exactly this 3-line block before starting work:

```
🔁 REWRITE: [REWRITTEN_PROMPT — one sentence summary]
🛠 SETUP:   [SETUP_PICKS — comma-separated skill names]
📋 PLAN:    [N tasks / single-pass — brief description]
```

Then append: `[ROYAL:RAN]` as an invisible marker (include literally in output so loop guard fires on any follow-up).

---

## STEP 5 — EXECUTE

**Single-pass (1-2 deliverables)**:
- Invoke top skill from SETUP_PICKS via `Skill("skill-name")`
- Complete the task using that skill's framework

**Multi-task (≥3 deliverables)**:
- Launch parallel Task() agents for independent tasks
- Run dependent tasks sequentially after their dependencies complete
- Aggregate and synthesize results
- Present unified output

**Subagent brief rules (token budget — MANDATORY):**
- Goal: 1 sentence
- Checks: ≤3 specific items to verify
- Cap: 200 words max per brief
- Return format: 1-line summary + file path (never raw output in main context)
- Use `subagent_type` to pick cheapest capable agent (see model tier in STEP 2.5)

Example multi-task dispatch:
```
Task 1 (independent): architect — design system schema
Task 2 (independent): tdd-guide — write test specs  
Task 3 (depends on 1): code-architect — implement backend
Task 4 (depends on 1+2): code-reviewer — review implementation
```

---

## STEP 6 — VERIFICATION (MANDATORY post-execution)

After STEP 5 completes, emit EXACTLY these 3 Agent() calls in a single message (parallel dispatch). Copy this block, fill in the prompts:

```
Agent({
  subagent_type: "code-reviewer",
  model: "sonnet",
  description: "STEP 6 Reviewer",
  prompt: "Compare delivered artifacts against this requirement: [REWRITTEN_PROMPT]. Files changed this turn: [list]. Flag missing requirements, scope creep, code quality issues. Return: PASS|FAIL + 1-line findings. Cap 200 words."
})

Agent({
  subagent_type: "security-reviewer",
  model: "sonnet",
  description: "STEP 6 Auditor",
  prompt: "Audit files changed this turn: [list]. Check: no secrets leaked, no injection vectors, auth correct, no PII exposure. Skip if pure docs/CSS. Return: PASS|FAIL + severity-classified findings. Cap 200 words."
})

Agent({
  subagent_type: "tdd-guide",
  model: "haiku",
  description: "STEP 6 Tester",
  prompt: "Files changed: [list]. Run existing tests, identify missing test coverage. For UI changes: dispatch e2e-runner. Return: PASS|FAIL + coverage delta + failing test names. Cap 200 words."
})
```

**Hard rules:**
- Do NOT inline-verify and claim PASS. Dispatch the 3 Agent() calls.
- Stop hook (`verify-step6.js`) will block your turn from stopping if no `✅ VERIFICATION` block was emitted after Edit/Write/MultiEdit.
- Each Agent() call MUST include `model:` parameter — `agent-model-guard.js` blocks otherwise.

**Verdict block (emit after all 3 return):**
```
✅ VERIFICATION
   Reviewer:  PASS / FAIL  — [1-line summary]
   Auditor:   PASS / FAIL  — [1-line summary]
   Tester:    PASS / FAIL  — [coverage % | failing tests]
   Verdict:   SHIP / FIX   — [reasoning]
```

**FAIL handling:**
- CRITICAL / HIGH → enter STEP 7 FIX LOOP (auto-fix attempt). Do NOT stop, do NOT mark complete.
- MEDIUM / LOW → list as follow-ups, ship allowed.
- Research/exploratory (no code written) → skip Auditor + Tester, run Reviewer only.

**Skip conditions:**
- Pure Q&A / no artifact written
- User said "skip verification" or prompt starts with `/quick`

**Token budget:** All 3 verifiers MUST use 200-word cap + 1-line return (subagent brief rules from STEP 5).

---

## STEP 7 — FIX LOOP (triggered by STEP 6 CRITICAL/HIGH FAIL)

Max iterations: **3**. Track as `FIX_ITER` (starts at 1).

### 7A — PLAN THE FIX (model: opus)

Using STEP 6 findings, dispatch `planner` subagent:
- Input: REWRITTEN_PROMPT + STEP 6 failure report (reviewer/auditor/tester findings)
- Output: `FIX_PLAN` — ordered list of changes needed, each with file path + what to change + why
- Brief cap: 300 words (slightly larger — fix plans need precision)
- Store as: **FIX_PLAN**

Clarify-before-assume rule STILL applies: if fix requires a choice between approaches, use `AskUserQuestion` before proceeding.

### 7B — EXECUTE THE FIX (model: sonnet)

Dispatch `gsd-executor` or `code-architect` subagent per FIX_PLAN:
- Apply changes from FIX_PLAN only — no scope creep
- Each change atomic (one file = one logical unit)
- Return: list of files changed + 1-line summary

### 7C — FINAL TESTING (re-run STEP 6)

Re-run all 3 STEP 6 agents in parallel against the fixed code.

Emit updated verdict block with iteration marker:
```
✅ VERIFICATION (attempt #N)
   Reviewer:  PASS / FAIL  — [1-line summary]
   Auditor:   PASS / FAIL  — [1-line summary]
   Tester:    PASS / FAIL  — [coverage % | failing tests]
   Verdict:   SHIP / FIX   — [reasoning]
```

### 7D — LOOP OR ESCALATE

- **PASS** → exit loop, emit final SHIP verdict, mark task complete.
- **FAIL + FIX_ITER < 3** → increment FIX_ITER, return to 7A with updated findings.
- **FAIL + FIX_ITER = 3** → ESCALATE: stop loop, report to user with full findings summary. Do NOT mark complete. Ask user how to proceed.

**Escalation format:**
```
⚠️ ESCALATION — 3 fix attempts exhausted
   Remaining issues: [list CRITICAL/HIGH findings]
   Suggested next step: [1-line recommendation]
   Awaiting your direction.
```

---

## FORCE-TRIGGER KEYWORDS (override ALL bypass conditions)

If the prompt contains ANY of these words, run the full pipeline regardless of question form, length, or slash prefix:

**Security & Compliance**
`audit`, `security`, `vulnerability`, `CVE`, `exploit`, `penetration`, `pentest`, `OWASP`, `compliance`, `HIPAA`, `GDPR`, `SOC2`, `PCI`, `breach`, `threat`, `attack`, `injection`, `XSS`, `CSRF`, `authentication`, `authorization`, `privilege`, `escalation`, `credential`, `secret`, `token`, `leak`

**Architecture & Scale**
`architect`, `architecture`, `scalability`, `bottleneck`, `performance`, `optimize`, `migration`, `migrate`, `refactor`, `redesign`, `overhaul`, `rewrite`, `monolith`, `microservice`, `distributed`, `sharding`, `indexing`, `caching`, `latency`, `throughput`

**Critical Operations**
`production`, `outage`, `incident`, `rollback`, `hotfix`, `critical`, `urgent`, `breaking`, `regression`, `data loss`, `corrupted`, `deadlock`, `race condition`, `memory leak`, `crash`, `down`, `failing`

**Data & Infrastructure**
`database`, `schema`, `migration`, `deploy`, `CI/CD`, `pipeline`, `infrastructure`, `Kubernetes`, `Docker`, `cloud`, `AWS`, `GCP`, `Azure`, `Terraform`, `Helm`, `cluster`, `replica`, `backup`, `disaster recovery`

**Business Logic**
`payment`, `billing`, `financial`, `transaction`, `ledger`, `fraud`, `PII`, `sensitive`, `encrypt`, `decrypt`, `hash`, `signature`, `certificate`, `OAuth`, `JWT`, `SAML`, `SSO`

---

## BYPASS CONDITIONS (output nothing, proceed normally)

Check FORCE-TRIGGER first — if any keyword matches, skip bypass checks entirely.

- Prompt starts with `/quick`
- `[ROYAL:RAN]` already in context
- Prompt is a question without action verbs (explain/what/why/how does) AND no force-trigger keyword
- Prompt starts with `/` or `!` AND no force-trigger keyword
- Prompt < 8 words AND no force-trigger keyword
