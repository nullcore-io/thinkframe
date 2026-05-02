#!/usr/bin/env bash
set -euo pipefail

SKILLS_DIR="${HOME}/.claude/skills"

echo "Installing claude-pipeline skills to ${SKILLS_DIR}..."

mkdir -p "${SKILLS_DIR}"

cp -r skills/royal-treatment "${SKILLS_DIR}/"
cp -r skills/model-route "${SKILLS_DIR}/"

echo "Done. Skills installed:"
echo "  ${SKILLS_DIR}/royal-treatment/SKILL.md"
echo "  ${SKILLS_DIR}/model-route/SKILL.md"
echo ""
echo "Next: wire the UserPromptSubmit hook in ~/.claude/settings.json"
echo "See CLAUDE.md for full setup instructions."
