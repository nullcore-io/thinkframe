#!/usr/bin/env bash
set -euo pipefail

REPO="https://raw.githubusercontent.com/nullcore-io/thinkframe/master"
CLAUDE_DIR="${HOME}/.claude"
SKILLS_DIR="${CLAUDE_DIR}/skills"
HOOKS_DIR="${CLAUDE_DIR}/scripts/hooks"
SETTINGS="${CLAUDE_DIR}/settings.json"

# ── Platform check ────────────────────────────────────────────────────────────
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
  echo "Windows detected. Use Git Bash or WSL to run this script."
  exit 1
fi

echo "Installing thinkframe..."

# ── 1. Download skills ────────────────────────────────────────────────────────
mkdir -p "${SKILLS_DIR}/royal-treatment" "${SKILLS_DIR}/model-route"

curl -fsSL "${REPO}/skills/royal-treatment/SKILL.md" -o "${SKILLS_DIR}/royal-treatment/SKILL.md"
curl -fsSL "${REPO}/skills/model-route/SKILL.md"     -o "${SKILLS_DIR}/model-route/SKILL.md"
echo "✓ Skills installed → ${SKILLS_DIR}/"

# ── 2. Download hook script ───────────────────────────────────────────────────
mkdir -p "${HOOKS_DIR}"
curl -fsSL "${REPO}/hooks/skill-advisor.js" -o "${HOOKS_DIR}/skill-advisor.js"
chmod +x "${HOOKS_DIR}/skill-advisor.js"
echo "✓ Hook installed → ${HOOKS_DIR}/skill-advisor.js"

# ── 3. Wire UserPromptSubmit hook in settings.json ────────────────────────────
HOOK_CMD="node ${HOOKS_DIR}/skill-advisor.js"
HOOK_ENTRY="{\"matcher\":\"\",\"command\":\"${HOOK_CMD}\",\"description\":\"thinkframe: skill advisor + royal treatment trigger\"}"

if [ ! -f "${SETTINGS}" ]; then
  echo "{\"hooks\":{\"UserPromptSubmit\":[${HOOK_ENTRY}]}}" > "${SETTINGS}"
  echo "✓ Created ${SETTINGS} with hook"
else
  if grep -q "skill-advisor" "${SETTINGS}" 2>/dev/null; then
    echo "✓ Hook already present in ${SETTINGS} (skipped)"
  else
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

# ── 4. Verify node ────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "⚠ Node.js not found. The hook requires Node.js ≥ 18."
  echo "  Install: https://nodejs.org"
else
  NODE_VER=$(node -e "process.stdout.write(process.version)")
  echo "✓ Node.js ${NODE_VER} found"
fi

echo ""
echo "Done! thinkframe installed."
echo ""
echo "  ${SKILLS_DIR}/royal-treatment/SKILL.md"
echo "  ${SKILLS_DIR}/model-route/SKILL.md"
echo "  ${HOOKS_DIR}/skill-advisor.js"
echo "  Hook wired in ${SETTINGS}"
echo ""
echo "Restart Claude Code to activate."
