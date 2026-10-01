---
name: journey
description: >-
  Comprehensive developer journey, milestone, and architecture logger.
  Use when the user runs /journey, /devlog, /journey-log, or /log-progress,
  or asks to document what was built, capture challenges faced and mitigation
  strategies, generate Mermaid architecture diagrams, create Architectural Decision
  Records (ADRs), map git commits/pushes, or maintain development journey logs.
---

# Developer Journey & Architecture Logging Skill (`/journey`)

This skill enables autonomous, structured documentation of your development journey, capturing what was built, technical roadblocks, trial-and-error pivots ("twists & turns"), mitigation strategies, system architecture diagrams (Mermaid), and direct mappings to GitHub commits and pushes.

---

## 1. Storage Layout

All journey artifacts are stored in your documentation tree:
```text
docs/
├── journey/
│   ├── README.md                  # Central journey timeline index
│   ├── ARCHITECTURE.md            # System architecture & evolution diagrams
│   └── YYYY-MM-DD-<topic>.md      # Daily / milestone log entries
├── adr/
│   ├── README.md                  # Architecture Decision Records index
│   └── 001-<decision-title>.md    # Individual ADR documents
└── progress/
    └── README.md                  # High-level milestone tracking
```

---

## 2. Command Modes & Triggers

When invoked via `/journey` or aliases (`/devlog`, `/journey-log`), check the user's arguments or intent:

| Command | Action | Output File |
| :--- | :--- | :--- |
| `/journey` or `/journey log` | Document current progress, roadblocks, mitigation, & git commit | `docs/journey/YYYY-MM-DD-<slug>.md` |
| `/journey arch` | Update or visualize system architecture & component diagrams | `docs/journey/ARCHITECTURE.md` |
| `/journey adr <title>` | Create an Architectural Decision Record | `docs/adr/<num>-<title>.md` |
| `/journey retro` | Backfill / summarize previous git commits into milestone logs | `docs/journey/` & `docs/progress/` |
| `/journey status` | Show logged milestones vs unlogged git commits | Chat Summary |

---

## 3. Step-by-Step Procedure: `/journey log`

### Step 1: Collect Git & Repository Context
Run the git extraction helper to obtain the current branch, latest commit hash, message, and GitHub URL:
- **Windows (PowerShell):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .agents/skills/journey/scripts/gather-git-context.ps1
  ```
- **Linux / macOS / WSL (Bash):**
  ```bash
  bash .agents/skills/journey/scripts/gather-git-context.sh
  ```
Inspect the output JSON: `hash`, `shortHash`, `message`, `githubUrl`, `branch`, and `uncommitted`.

### Step 2: Extract Journey Dimensions
Synthesize the recent work across the 5 essential pillars:
1. **What was made:** Features, services, Dockerfiles, K8s manifests, SQL migrations, scripts, or API endpoints added or refactored.
2. **Twists & Turns (Challenges):** Errors encountered, runtime crashes, networking hurdles (e.g. Docker-in-Docker socket issues, MinIO vs S3 differences, Redis queue disconnects), or version incompatibilities.
3. **Mitigation Strategy:**
   - What failed initially (the naive or first attempt).
   - Why it failed.
   - The winning mitigation that unlocked the fix.
4. **Architecture & Visual Diagram:**
   - Craft a concise Mermaid diagram illustrating the flow or component relationship for this specific milestone.
5. **Git & GitHub Mapping:**
   - Direct clickable link to the commit: `[hash](https://github.com/<owner>/<repo>/commit/<hash>)`.
   - Record whether changes are pushed or local.

### Step 3: Generate the Entry
Use the template at [.agents/skills/journey/templates/journey-entry.template.md](./templates/journey-entry.template.md).
- Create file: `docs/journey/YYYY-MM-DD-<slug>.md` (e.g. `docs/journey/2026-10-01-docker-in-docker-aws.md`).
- Populate all placeholders with rich, precise technical detail.

### Step 4: Update the Master Journey Index
Open `docs/journey/README.md` and append/prepend the new entry to the Timeline Table:
```markdown
| Date | Milestone / Topic | GitHub Commit | Key Challenge Faced | Mitigation | Entry Link |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-10-01 | Docker in Docker with AWS | [`d2b560b`](https://...) | DinD socket permissions | Mount dind socket with privileged flag | [Read Log](./2026-10-01-docker-in-docker-aws.md) |
```

---

## 4. Step-by-Step Procedure: `/journey adr <title>`

When a major architectural fork or design decision is made (e.g., *Minikube vs ECS Fargate*, *Kafka vs Redis Streams*, *Postgres polling vs Webhooks*):
1. Determine next ADR number (check `docs/adr/` count, e.g., `001`, `002`).
2. Use [.agents/skills/journey/templates/adr.template.md](./templates/adr.template.md).
3. Create `docs/adr/00X-<slug>.md`.
4. Document the context, decision drivers, considered options, trade-offs, and mitigation.
5. Update `docs/adr/README.md` index.

---

## 5. Step-by-Step Procedure: `/journey arch`

When the user asks to update the architecture or inspect current system topology:
1. Examine `docs/journey/ARCHITECTURE.md`.
2. Inspect the latest monorepo services (`apps/`, `services/`, `infra/`, `docker-compose.yml`, Kubernetes manifests).
3. Update `docs/journey/ARCHITECTURE.md` with:
   - System Overview Mermaid graph.
   - Component & Service Matrix.
   - Sequence Diagram of deployment / request lifecycle.
   - Cloud vs Local Infrastructure topology.

---

## 6. Multi-IDE Compatibility Instructions

This skill is designed to work across all AI IDEs:
- **Google Antigravity:** Native execution via `.agents/skills/journey/SKILL.md`.
- **Cursor:** Triggered via `@journey` or `/journey`, reading `.agents/skills/journey/SKILL.md` or `.cursorrules`.
- **Windsurf:** Triggered via Cascade prompt or `/journey` referencing `.agents/skills/journey/SKILL.md`.
- **Claude Code:** Invoked via `claude "/journey"` leveraging `CLAUDE.md`.

Refer to [IDE Compatibility Guide](./references/ide-compatibility.md) for detailed toolchain configuration.
