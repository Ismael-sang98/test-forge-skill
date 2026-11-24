#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# TestForge — Universal Global Installer (macOS & Linux)
# Supports: Google Antigravity (Full Plugin + 4 Hooks + Rules + Subagents),
#           Claude Code (Skills + Subagents + Scripts), OpenAI Codex,
#           Cursor, Windsurf, and Universal ~/.agents/skills
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="test-forge"
SKILLS=(
  "test-auto"
  "test-security"
  "test-functional"
  "test-performance"
  "test-smoke-sanity"
  "test-parity"
  "test-resilience"
)
AGENTS=(
  "test-red-team.md"
  "test-qa-runner.md"
)

UNINSTALL=false
if [[ "${1:-}" == "--uninstall" || "${1:-}" == "uninstall" ]]; then
  UNINSTALL=true
fi

install_skills_into() {
  local target_skills_dir="$1"
  local label="$2"
  mkdir -p "$target_skills_dir"
  for skill in "${SKILLS[@]}"; do
    rm -rf "${target_skills_dir:?}/${skill}"
    cp -R "${SCRIPT_DIR}/skills/${skill}" "${target_skills_dir}/${skill}"
  done
  echo "  [OK] Installed ${#SKILLS[@]} TestForge skills for ${label} -> ${target_skills_dir}"
}

install_agents_into() {
  local target_agents_dir="$1"
  local label="$2"
  mkdir -p "$target_agents_dir"
  for agent in "${AGENTS[@]}"; do
    cp -f "${SCRIPT_DIR}/agents/${agent}" "${target_agents_dir}/${agent}"
  done
  echo "  [OK] Installed ${#AGENTS[@]} TestForge subagents for ${label} -> ${target_agents_dir}"
}

install_scripts_into() {
  local target_scripts_dir="$1"
  mkdir -p "$target_scripts_dir"
  rm -rf "${target_scripts_dir:?}/scripts"
  cp -R "${SCRIPT_DIR}/scripts" "${target_scripts_dir}/scripts"
  chmod +x "${target_scripts_dir}/scripts/"*.mjs || true
}

uninstall_skills_from() {
  local target_skills_dir="$1"
  local label="$2"
  if [[ -d "$target_skills_dir" ]]; then
    for skill in "${SKILLS[@]}"; do
      rm -rf "${target_skills_dir:?}/${skill}"
    done
    echo "  [OK] Removed TestForge skills from ${label} (${target_skills_dir})"
  fi
}

uninstall_agents_from() {
  local target_agents_dir="$1"
  local label="$2"
  if [[ -d "$target_agents_dir" ]]; then
    for agent in "${AGENTS[@]}"; do
      rm -f "${target_agents_dir:?}/${agent}"
    done
    echo "  [OK] Removed TestForge subagents from ${label} (${target_agents_dir})"
  fi
}

if [[ "$UNINSTALL" == true ]]; then
  echo "Uninstalling ${PLUGIN_NAME}..."
  if command -v agy >/dev/null 2>&1; then
    agy plugin uninstall "${PLUGIN_NAME}" >/dev/null 2>&1 || true
  fi
  rm -rf "${HOME}/.gemini/config/plugins/${PLUGIN_NAME}"
  echo "  [OK] Removed Antigravity global plugin (${HOME}/.gemini/config/plugins/${PLUGIN_NAME})"

  uninstall_skills_from "${HOME}/.claude/skills" "Claude Code"
  uninstall_agents_from "${HOME}/.claude/agents" "Claude Code"
  rm -rf "${HOME}/.claude/${PLUGIN_NAME}"

  uninstall_skills_from "${HOME}/.codex/skills" "OpenAI Codex"
  uninstall_skills_from "${HOME}/.cursor/skills" "Cursor"
  uninstall_skills_from "${HOME}/.codeium/windsurf/skills" "Windsurf"
  uninstall_skills_from "${HOME}/.agents/skills" "Universal Agent Skills"
  rm -rf "${HOME}/.agents/${PLUGIN_NAME}"

  echo "Done! Restart your AI IDE / CLI to complete removal."
  exit 0
fi

echo "=================================================================="
echo "  TestForge v1.0.0 — Autonomous QA & Security Testing Installer"
echo "=================================================================="

chmod +x "${SCRIPT_DIR}/scripts/"*.mjs || true

# 1. Google Antigravity Full Plugin Bundle (Skills + Subagents + Rule + 4 Hooks)
AGY_PLUGIN_DIR="${HOME}/.gemini/config/plugins/${PLUGIN_NAME}"
mkdir -p "${HOME}/.gemini/config/plugins"

INSTALLED_VIA_CLI=false
if command -v agy >/dev/null 2>&1; then
  if agy plugin install "${SCRIPT_DIR}" >/dev/null 2>&1; then
    INSTALLED_VIA_CLI=true
    echo "  [OK] Installed full Antigravity plugin via 'agy plugin install'"
  fi
fi

if [[ "$INSTALLED_VIA_CLI" == false ]]; then
  rm -rf "${AGY_PLUGIN_DIR}"
  mkdir -p "${AGY_PLUGIN_DIR}"
  cp -R "${SCRIPT_DIR}/plugin.json" \
        "${SCRIPT_DIR}/hooks.json" \
        "${SCRIPT_DIR}/assets" \
        "${SCRIPT_DIR}/rules" \
        "${SCRIPT_DIR}/agents" \
        "${SCRIPT_DIR}/scripts" \
        "${SCRIPT_DIR}/skills" \
        "${SCRIPT_DIR}/README.md" \
        "${AGY_PLUGIN_DIR}/"
  chmod +x "${AGY_PLUGIN_DIR}/scripts/"*.mjs || true
  echo "  [OK] Installed full Antigravity plugin -> ${AGY_PLUGIN_DIR}"
fi

# 2. Universal Agent Skills (~/.agents/skills — Codex, OpenCode, Gemini CLI, etc.)
install_skills_into "${HOME}/.agents/skills" "Universal Agent Skills (Codex/CLI)"
install_scripts_into "${HOME}/.agents/${PLUGIN_NAME}"

# 3. Claude Code (Skills + Subagents + Scripts)
if [[ -d "${HOME}/.claude" ]]; then
  install_skills_into "${HOME}/.claude/skills" "Claude Code"
  install_agents_into "${HOME}/.claude/agents" "Claude Code"
  install_scripts_into "${HOME}/.claude/${PLUGIN_NAME}"
fi

# 4. OpenAI Codex (~/.codex/skills)
if [[ -d "${HOME}/.codex" ]]; then
  install_skills_into "${HOME}/.codex/skills" "OpenAI Codex"
fi

# 5. Cursor
if [[ -d "${HOME}/.cursor" ]]; then
  install_skills_into "${HOME}/.cursor/skills" "Cursor"
fi

# 6. Windsurf
if [[ -d "${HOME}/.codeium/windsurf" ]]; then
  install_skills_into "${HOME}/.codeium/windsurf/skills" "Windsurf"
fi

echo ""
echo "TestForge v1.0.0 is installed globally!"
echo "-> Restart Antigravity / your AI IDE so the plugin, hooks, subagents, and skills load."
echo "-> Standalone & 100% conflict-free with SpecForge (works with or without SpecForge)."
echo "-> Try in any project: 'Use test-auto to test and audit my project'"
