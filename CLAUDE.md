# claude-pipeline

## What this project is
A 7-step self-verifying orchestration pipeline for Claude Code. Skills drop into `~/.claude/skills/`.

## Skills
- `skills/royal-treatment/SKILL.md` — main pipeline (rewrite → pick → decompose → execute → verify → fix-loop)
- `skills/model-route/SKILL.md` — Opus/Sonnet/Haiku routing by task type

## Install
Run `./setup.sh` or copy manually:
```bash
cp -r skills/royal-treatment ~/.claude/skills/
cp -r skills/model-route ~/.claude/skills/
```

## Wire the hook
Add to `~/.claude/settings.json` to auto-trigger royal-treatment:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "command": "node ~/.claude/scripts/hooks/skill-advisor.js",
        "description": "Auto-recommend skills and trigger royal-treatment"
      }
    ]
  }
}
```

## Manual trigger
```
Skill("royal-treatment")   # full pipeline
Skill("model-route")       # check model tier before Agent() dispatch
```

## Key behaviors
- Opus never assumes — asks user before picking between approaches
- STEP 6 runs 3 verification agents after every execution (reviewer + auditor + tester)
- STEP 7 fix loop: auto-plans + applies fix, re-verifies, escalates after 3 failed attempts
- All subagent output stays off main context (context-mode enforced)
- Caveman output style active throughout (fragments, no filler)
