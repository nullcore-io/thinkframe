# Contributing

## Skill format
Each skill is a markdown file with YAML frontmatter:
```markdown
---
name: skill-name
description: one-line description
---
# Skill content
...
```

## Adding a skill
1. Create `skills/<name>/SKILL.md`
2. Update `README.md` skills table
3. Update `setup.sh` to copy the new skill
4. Test: `Skill("<name>")` in Claude Code

## Editing royal-treatment pipeline
Steps are numbered (`## STEP N`). Each step is self-contained.
- Changing bypass conditions → edit `## BYPASS CONDITIONS`
- Adding verification checks → edit `## STEP 6`
- Changing fix loop behavior → edit `## STEP 7`

## Testing
Trigger royal-treatment manually: `Skill("royal-treatment")`
Check STEP 6 verification fires after execution.
Check STEP 7 fix loop triggers on CRITICAL/HIGH failure.

## PRs
- One logical change per PR
- Update README if adding/removing skills
- No personal API keys, emails, or internal paths
