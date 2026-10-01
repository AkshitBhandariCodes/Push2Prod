---
trigger: model_decision
description: Use when the user asks to log progress, record journey entries, document challenges and mitigation strategies, or update architecture diagrams.
---

# Developer Journey & Architecture Logging Rule

When documenting developer journey, progress, or architectural choices:
- Always follow the procedures in [`.agents/skills/journey/SKILL.md`](../skills/journey/SKILL.md).
- Extract git commit hash, branch, and commit message to link directly to GitHub (`https://github.com/AkshitBhandariCodes/Vercel-pro/commit/<hash>`).
- Always separate challenges faced ("Twists & Turns") from the winning mitigation strategy and why previous attempts failed.
- Include or update Mermaid diagrams for architecture and execution flows.
- Update `docs/journey/README.md` index and maintain `docs/adr/` for major architectural trade-offs.
