#!/usr/bin/env bash
set -euo pipefail

# ── Platform check ────────────────────────────────────────────────────────────
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
  echo "Windows detected. Run this script in Git Bash or WSL."
  echo "Or install manually — see README.md."
fi

CLAUDE_DIR="${HOME}/.claude"
SKILLS_DIR="${CLAUDE_DIR}/skills"
HOOKS_DIR="${CLAUDE_DIR}/scripts/hooks"
SETTINGS="${CLAUDE_DIR}/settings.json"

echo "Installing claude-pipeline..."

# ── 1. Copy skills ────────────────────────────────────────────────────────────
mkdir -p "${SKILLS_DIR}"
cp -r skills/royal-treatment "${SKILLS_DIR}/"
cp -r skills/model-route "${SKILLS_DIR}/"
echo "✓ Skills installed → ${SKILLS_DIR}/"

# ── 2. Copy hook script ───────────────────────────────────────────────────────
mkdir -p "${HOOKS_DIR}"
cp hooks/skill-advisor.js "${HOOKS_DIR}/skill-advisor.js"
chmod +x "${HOOKS_DIR}/skill-advisor.js"
echo "✓ Hook installed → ${HOOKS_DIR}/skill-advisor.js"

# ── 3. Wire UserPromptSubmit hook in settings.json ────────────────────────────
HOOK_CMD="node ${HOOKS_DIR}/skill-advisor.js"
HOOK_ENTRY="{\"matcher\":\"\",\"command\":\"${HOOK_CMD}\",\"description\":\"claude-pipeline: skill advisor + royal treatment trigger\"}"

if [ ! -f "${SETTINGS}" ]; then
  # Create minimal settings.json
  echo "{\"hooks\":{\"UserPromptSubmit\":[${HOOK_ENTRY}]}}" > "${SETTINGS}"
  echo "✓ Created ${SETTINGS} with hook"
else
  # Check if hook already wired
  if grep -q "skill-advisor" "${SETTINGS}" 2>/dev/null; then
    echo "✓ Hook already present in ${SETTINGS} (skipped)"
  else
    # Inject into existing settings.json using node (handles JSON safely)
    node -e "
      const fs = require('fs');
      const s = JSON.parse(fs.readFileSync('${SETTINGS}', 'utf8'));
      s.hooks = s.hooks || {};
      s.hooks.UserPromptSubmit = s.hooks.UserPromptSubmit || [];
      s.hooks.UserPromptSubmit.unshift(${HOOK_ENTRY});
      fs.writeFileSync('${SETTINGS}', JSON.stringify(s, null, 2));
    " && echo "✓ Hook injected into ${SETTINGS}"
  fi
fi

# ── 4. Verify node is available ───────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "⚠ Node.js not found. The hook requires Node.js ≥ 18."
  echo "  Install: https://nodejs.org"
else
  NODE_VER=$(node -e "process.stdout.write(process.version)")
  echo "✓ Node.js ${NODE_VER} found"
fi

echo ""
echo "Done! claude-pipeline installed."
echo ""
echo "What was installed:"
echo "  ${SKILLS_DIR}/royal-treatment/SKILL.md"
echo "  ${SKILLS_DIR}/model-route/SKILL.md"
echo "  ${HOOKS_DIR}/skill-advisor.js"
echo "  Hook wired in ${SETTINGS}"
echo ""
echo "Usage in Claude Code:"
echo "  Auto-triggers on every prompt via the UserPromptSubmit hook."
echo "  Manual: Skill(\"royal-treatment\") or Skill(\"model-route\")"
