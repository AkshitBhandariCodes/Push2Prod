---
trigger: model_decision
description: Use when the user asks to log progress, record journey entries, document challenges and mitigation strategies, or update architecture diagrams.
---

# Developer Journey & Architecture Logging Rule

When documenting developer journey, progress, or architectural choices:
- Always follow the procedures in [`.agents/skills/journey/SKILL.md`](../skills/journey/SKILL.md).
- **DO NOT automatic push docs to git remote** (`git push`). Stage/commit locally if needed, but do not push without explicit user request.
- **System Design Depth & Blog-Ready Quality:**
  - Structure entries and ADRs with deep Computer Science and System Design terminology (e.g., Linux kernel cgroups, V8 heap memory management, OOM killer signals, Ingress routing, HTTP RFC compliance, reverse proxy semantics, multi-tenant isolation, process concurrency models).
  - Clearly articulate:
    1. *First Principles & Problem Context* (resource constraints, failure modes, scale barriers).
    2. *System Architecture & Trade-Off Matrix* (commercial enterprise benchmarks vs self-hosted free-tier design).
    3. *The Anatomy of Failure* (root cause analysis with exact code/kernel level mechanics).
    4. *The Engineering Mitigation* (patterns, algorithms, architectural adjustments).
    5. *Key Blog Takeaways / System Design Lessons* (ready to be adapted into technical blog posts).
- Extract git commit hash, branch, and commit message to link directly to GitHub (`https://github.com/AkshitBhandariCodes/Vercel-pro/commit/<hash>`).
- Always separate challenges faced ("Twists & Turns") from the winning mitigation strategy and why previous attempts failed.
- Include or update Mermaid diagrams for architecture and execution flows.
- Update `docs/journey/README.md` index and maintain `docs/adr/` for major architectural trade-offs.

