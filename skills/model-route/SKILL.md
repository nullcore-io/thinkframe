---
name: model-route
description: >
  Auto-routes tasks to correct model tier: Opus 4.7 for planning/arch,
  Sonnet 4.6 for dev/writing, Haiku 4.5 for editing/transforms.
  Apply before dispatching any Agent() or subagent call.
---

# Model Routing System

## Tier Map

| Model | ID | Use for |
|-------|----|---------|
| **Opus 4.7** | `opus` | Planning, architecture, complex reasoning, ambiguous problems, security review |
| **Sonnet 4.6** | `sonnet` | Code writing, feature dev, orchestration, research, code review, multi-step tasks |
| **Haiku 4.5** | `haiku` | Line edits, formatting, linting, summarization, simple transforms, repetitive worker tasks |

## Decision Tree

```
Is task in plan mode?
  YES → Opus (opusplan handles this automatically)
  NO  → continue ↓

Does task require architecture decision, security analysis, or deep reasoning?
  YES → Opus
  NO  → continue ↓

Does task involve writing code, feature implementation, orchestration, or research?
  YES → Sonnet (default)
  NO  → continue ↓

Is task a single-file edit, format, lint, summarize, or transform?
  YES → Haiku
  NO  → Sonnet (safe default)
```

## Task → Model Quick-Reference

| Task | Model |
|------|-------|
| Plan mode (any) | Opus (auto via opusplan) |
| Architecture design | Opus |
| Security audit | Opus |
| Complex debugging | Opus |
| Feature implementation | Sonnet |
| Code review | Sonnet |
| Writing tests | Sonnet |
| Research / deep-research | Sonnet |
| Multi-step orchestration | Sonnet |
| Summarize output | Haiku |
| Format / lint / fix style | Haiku |
| Single-file edit | Haiku |
| Simple data transform | Haiku |
| Repetitive worker (in loop) | Haiku |

## How to Apply in Agent Dispatch

Pass `model` parameter to Agent() calls:

```
Agent({
  subagent_type: "code-reviewer",
  model: "sonnet",          // or "haiku" / "opus"
  prompt: "..."
})
```

## Integration Points

1. **royal-treatment STEP 2.5** — already references this tier map. Pick model before decomposing.
2. **Multi-task dispatch** — every subagent brief MUST include model tier.
3. **opusplan** — already configured in settings. No change needed for plan mode.

## Cost Ratio (approximate)

Haiku : Sonnet : Opus ≈ 1 : 3 : 15

Route to Haiku aggressively for all worker/edit tasks. Typical session: 60%+ tasks qualify for Haiku or Sonnet; Opus only for 10-20% high-reasoning tasks.
