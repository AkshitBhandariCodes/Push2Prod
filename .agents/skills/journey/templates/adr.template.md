# ADR-{{NUMBER}}: {{TITLE}}

- **Status:** {{STATUS}} <!-- Proposed | Accepted | Deprecated | Superseded by ADR-XXX -->
- **Date:** {{DATE}}
- **Deciders:** {{DECIDERS}}
- **Related Commits:** [{{SHORT_HASH}}]({{GITHUB_COMMIT_URL}})
- **Related Journey Entry:** [{{JOURNEY_TITLE}}](../journey/{{JOURNEY_ENTRY_FILE}})

---

## Context and Problem Statement
{{PROBLEM_DESCRIPTION}}
- What problem are we trying to solve?
- What are the operational, technical, or scaling constraints?

## Decision Drivers
- {{DRIVER_1}} (e.g. Isolation between tenant builds)
- {{DRIVER_2}} (e.g. AWS vs Local Minikube compatibility)
- {{DRIVER_3}} (e.g. Low startup latency and resource efficiency)

## Considered Options
1. **Option 1:** {{OPTION_1_NAME}}
2. **Option 2:** {{OPTION_2_NAME}}
3. **Option 3:** {{OPTION_3_NAME}}

---

## Decision Outcome
**Chosen Option:** `{{CHOSEN_OPTION}}`

### Rationale
{{RATIONALE_EXPLANATION}}

```mermaid
{{DECISION_MERMAID_DIAGRAM}}
```

### Positive Consequences
- {{PRO_1}}
- {{PRO_2}}

### Negative Consequences / Trade-offs
- {{CON_1}}
- {{CON_2}}

### Mitigation for Trade-offs
- {{MITIGATION_STRATEGY}}

---

## Pros and Cons of Other Options

### {{OPTION_2_NAME}}
- **Good:** {{OPTION_2_PRO}}
- **Bad:** {{OPTION_2_CON}}
- **Reason Rejected:** {{OPTION_2_REJECTION_REASON}}

### {{OPTION_3_NAME}}
- **Good:** {{OPTION_3_PRO}}
- **Bad:** {{OPTION_3_CON}}
- **Reason Rejected:** {{OPTION_3_REJECTION_REASON}}
