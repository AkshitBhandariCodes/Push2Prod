# AGENTS.md — Agent & AI IDE Guidelines

## Journey & Development Logging (`/journey` or `/devlog`)

This repository maintains an active developer journey log documenting architectural decisions, technical roadblocks ("twists & turns"), mitigation strategies, and git commit mappings.

When the user runs `/journey`, `/devlog`, `/journey-log`, or asks to document what was built or log progress:
1. Read and execute the procedures defined in [`.agents/skills/journey/SKILL.md`](./.agents/skills/journey/SKILL.md).
2. Gather git context using `.agents/skills/journey/scripts/gather-git-context.ps1` (or `.sh`).
3. Store journey entries in `docs/journey/YYYY-MM-DD-<slug>.md`.
4. Store architectural decision records in `docs/adr/00X-<slug>.md`.
5. Update `docs/journey/ARCHITECTURE.md` with relevant Mermaid diagrams when system topology evolves.
