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

# ── 4. Wire all hooks in settings.json ────────────────────────────────────────
ADVISOR_CMD="node ${HOOKS_DIR}/skill-advisor.js"
VERIFY_CMD="node ${HOOKS_DIR}/verify-step6.js"
GUARD_CMD="node ${HOOKS_DIR}/agent-model-guard.js"

if [ ! -f "${SETTINGS}" ]; then
  node -e "
    const s = {
      hooks: {
        UserPromptSubmit: [{matcher:'',hooks:[{type:'command',command:'${ADVISOR_CMD}'}]}],
        Stop: [{matcher:'',hooks:[{type:'command',command:'${VERIFY_CMD}'}]}],
        PreToolUse: [{matcher:'Agent|Task',hooks:[{type:'command',command:'${GUARD_CMD}'}]}]
      }
    };
    require('fs').writeFileSync('${SETTINGS}', JSON.stringify(s, null, 2));
  "
  echo "✓ Created ${SETTINGS} with all hooks"
else
  node -e "
    const fs = require('fs');
    const s = JSON.parse(fs.readFileSync('${SETTINGS}', 'utf8'));
    s.hooks = s.hooks || {};
    s.hooks.UserPromptSubmit = s.hooks.UserPromptSubmit || [];
    s.hooks.Stop = s.hooks.Stop || [];
    s.hooks.PreToolUse = s.hooks.PreToolUse || [];

    if (!JSON.stringify(s.hooks.UserPromptSubmit).includes('skill-advisor'))
      s.hooks.UserPromptSubmit.unshift({matcher:'',hooks:[{type:'command',command:'${ADVISOR_CMD}'}]});

    if (!JSON.stringify(s.hooks.Stop).includes('verify-step6'))
      s.hooks.Stop.push({matcher:'',hooks:[{type:'command',command:'${VERIFY_CMD}'}]});

    if (!JSON.stringify(s.hooks.PreToolUse).includes('agent-model-guard'))
      s.hooks.PreToolUse.push({matcher:'Agent|Task',hooks:[{type:'command',command:'${GUARD_CMD}'}]});

    fs.writeFileSync('${SETTINGS}', JSON.stringify(s, null, 2));
  "
  echo "✓ Hooks merged into ${SETTINGS}"
fi

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
