# Journey Log: {{TITLE}}

- **Date:** {{DATE}}
- **Author:** {{AUTHOR}}
- **Branch:** `{{BRANCH}}`
- **GitHub Commit:** [{{SHORT_HASH}}]({{GITHUB_COMMIT_URL}}) — *{{COMMIT_MESSAGE}}*
- **Milestone / Phase:** {{PHASE_OR_TAG}}
- **Status:** {{STATUS}} <!-- [In Progress | Completed | Pivoted] -->

---

## 1. What Was Built & Accomplished
<!-- Summary of new features, modules, endpoints, infrastructure, or refactoring completed in this step -->
- **Component / Service:** `{{COMPONENT_NAME}}`
- **Core Changes:**
  - {{BULLET_POINT_1}}
  - {{BULLET_POINT_2}}
- **Files Modified / Added:**
  - `{{FILE_1}}`
  - `{{FILE_2}}`

---

## 2. Twists, Turns & Challenges Faced
<!-- Every journey has unexpected roadblocks, subtle bugs, or toolchain surprises. Document them honestly here. -->
### Challenge 1: {{CHALLENGE_TITLE}}
- **Symptom / Error:**
  ```text
  {{ERROR_OR_LOG_SNIPPET}}
  ```
- **Root Cause Analysis:**
  {{ROOT_CAUSE_EXPLANATION}}

### Challenge 2 (if any): {{CHALLENGE_TITLE_2}}
- **Description:** {{CHALLENGE_DESCRIPTION_2}}

---

## 3. Mitigation Strategies & Resolutions
<!-- What failed first? What was the eventual fix? What lessons were learned? -->
- **Attempted Fixes (Failed / Suboptimal):**
  1. *Attempt 1:* {{ATTEMPT_1_DESCRIPTION}} (Why it didn't work)
- **Winning Solution:**
  {{WINNING_SOLUTION_DETAILS}}
- **Takeaway / Key Insight:**
  > [!TIP]
  > {{KEY_INSIGHT_OR_RULE_FOR_FUTURE}}

---

## 4. Architecture & Design Impact
<!-- How does this fit into the broader system architecture? Include an updated or localized Mermaid diagram. -->

```mermaid
{{MERMAID_DIAGRAM}}
```

- **Architectural Shift:** {{ARCHITECTURAL_SHIFT_EXPLANATION}}
- **Associated ADR:** [ADR-{{ADR_NUM}}: {{ADR_NAME}}](../adr/{{ADR_FILENAME}}.md) <!-- Or N/A if minor -->

---

## 5. Verification & Proof of Work
<!-- How was this validated? (Test output, curl response, docker logs, screenshot, benchmark) -->
- **Test Command:** `{{TEST_COMMAND}}`
- **Observed Result:**
  ```text
  {{VERIFICATION_OUTPUT}}
  ```

---

## 6. Next Steps & Trajectory
- [ ] {{NEXT_ACTION_ITEM_1}}
- [ ] {{NEXT_ACTION_ITEM_2}}
