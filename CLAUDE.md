# Claude Code Guidelines: Vercel-Pro

## Journey & Architectural Logging
When the user invokes `/journey`, `/devlog`, or asks to record development progress:
- Consult the skill instructions in [`.agents/skills/journey/SKILL.md`](./.agents/skills/journey/SKILL.md).
- Follow the entry template in [`.agents/skills/journey/templates/journey-entry.template.md`](./.agents/skills/journey/templates/journey-entry.template.md).
- Run `.agents/skills/journey/scripts/gather-git-context.ps1` (or `gather-git-context.sh`) to extract git commit hashes, branch, and GitHub URLs.
- Save progress entries in `docs/journey/`, architecture diagrams in `docs/journey/ARCHITECTURE.md`, and decision records in `docs/adr/`.
