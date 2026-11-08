---
name: skill-router
description: Select relevant skills from the shared Codex Skills library for a task that could benefit from specialist guidance. Use the existing library index to decide which skill files to read.
---

# Skill Router

1. Use the library location in the global or repository instructions. If it is unavailable, try `~/codex-skills/library`.
2. Read `index.json` from that library. If it is missing or unreadable, continue the task without library skills.
3. Compare the indexed names and descriptions with the current request. Choose the smallest set that directly helps, which can be empty.
4. Resolve each chosen path relative to the library. Check that it resolves to a file within the library and skip missing or out-of-library paths.
5. Read the selected `SKILL.md` files and only the supporting material needed for this task. Resolve skill references from the selected skill directory unless the skill specifies another base. Follow higher-priority instructions and project rules when applying a skill.

Use the index as it stands. Leave scanning, reindexing, installation and library changes to their separate workflows.
