#!/usr/bin/env bash
set -euo pipefail

REPO="https://raw.githubusercontent.com/nullcore-io/thinkframe/master"
CLAUDE_DIR="${HOME}/.claude"
SKILLS_DIR="${CLAUDE_DIR}/skills"
HOOKS_DIR="${CLAUDE_DIR}/scripts/hooks"
STATE_DIR="${CLAUDE_DIR}/state"
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
echo "✓ Skills → ${SKILLS_DIR}/"

# ── 2. Download hook scripts ──────────────────────────────────────────────────
mkdir -p "${HOOKS_DIR}"
curl -fsSL "${REPO}/hooks/skill-advisor.js"     -o "${HOOKS_DIR}/skill-advisor.js"
curl -fsSL "${REPO}/hooks/verify-step6.js"      -o "${HOOKS_DIR}/verify-step6.js"
curl -fsSL "${REPO}/hooks/agent-model-guard.js" -o "${HOOKS_DIR}/agent-model-guard.js"
chmod +x "${HOOKS_DIR}"/*.js
echo "✓ Hooks → ${HOOKS_DIR}/"

# ── 3. State directory ────────────────────────────────────────────────────────
mkdir -p "${STATE_DIR}"
[ -f "${STATE_DIR}/fix-iter.json" ] || echo '{"iter":0}' > "${STATE_DIR}/fix-iter.json"
echo "✓ State → ${STATE_DIR}/"

# ── 4. Wire hooks in settings.json (via env vars — no shell→JS interpolation) ─
INSTALLER="${HOOKS_DIR}/_install-hooks.js"
curl -fsSL "${REPO}/hooks/_install-hooks.js" -o "${INSTALLER}"

THINKFRAME_SETTINGS="${SETTINGS}" \
THINKFRAME_ADVISOR="${HOOKS_DIR}/skill-advisor.js" \
THINKFRAME_VERIFY="${HOOKS_DIR}/verify-step6.js" \
THINKFRAME_GUARD="${HOOKS_DIR}/agent-model-guard.js" \
  node "${INSTALLER}"

rm -f "${INSTALLER}"

# ── 5. Verify node ────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "⚠ Node.js not found. Hooks require Node.js ≥ 18. Install: https://nodejs.org"
else
  NODE_VER=$(node -e "process.stdout.write(process.version)")
  echo "✓ Node.js ${NODE_VER}"
fi

echo ""
echo "Done! thinkframe installed:"
echo "  Skills:  royal-treatment, model-route"
echo "  Hooks:   skill-advisor (UserPromptSubmit)"
echo "           verify-step6  (Stop — blocks completion if STEP 6 didn't run)"
echo "           agent-model-guard (PreToolUse — requires model: param on Agent/Task)"
echo ""
echo "Restart Claude Code to activate."
