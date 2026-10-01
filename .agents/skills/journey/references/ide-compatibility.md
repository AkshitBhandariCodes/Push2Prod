# Multi-AI IDE Compatibility Guide for `/journey`

This skill is structured following the open standard for Agent Skills, making it portable and functional across all major AI coding IDEs and terminal agents.

---

## 1. Google Antigravity IDE
- **Discovery Root:** `.agents/skills/journey/SKILL.md` (Workspace-level) or `~/.gemini/config/skills/journey/` (Machine-global).
- **Trigger:** Type `/journey` or `/devlog` in the prompt box, or ask: *"Document my journey for the latest build"*.
- **Mechanism:** Antigravity loads the skill frontmatter into its active context and reads `SKILL.md` via progressive disclosure when triggered.

---

## 2. Cursor IDE
Cursor recognizes project rules and instructions via `.cursorrules` or `.cursor/rules/`:
- **Setup:** A symlink or rule pointer in `.cursorrules` or `.cursor/rules/journey.mdc` referencing `.agents/skills/journey/SKILL.md`.
- **Trigger:** Type `@journey` or `/journey` in Composer / Chat.
- **Workflow:** Cursor reads the workflow steps, runs the git extraction script, and outputs files into `docs/journey/` and `docs/adr/`.

---

## 3. Windsurf (Codeium)
- **Setup:** Reference in `.windsurfrules`:
  ```markdown
  When the user types /journey or asks for dev logs, follow the procedures in .agents/skills/journey/SKILL.md.
  ```
- **Trigger:** Type `/journey` or ask Cascade to log development progress.

---

## 4. Claude Code (Anthropic CLI)
- **Setup:** Reference in `CLAUDE.md` at repository root:
  ```markdown
  ## Journey & Decision Logging
  When prompted with `/journey` or when recording progress, execute the procedures detailed in `.agents/skills/journey/SKILL.md`. Store journey logs in `docs/journey/`, ADRs in `docs/adr/`, and progress in `docs/progress/`.
  ```
- **Trigger:** `claude "/journey log"` or inside interactive Claude Code session.

---

## 5. GitHub Copilot / VS Code Chat
- **Setup:** Reference in `.github/copilot-instructions.md`.
- **Trigger:** Ask `@workspace /journey` or prompt: *"Follow journey skill instructions in .agents/skills/journey/SKILL.md"*.
