---
name: skill-indexer
description: Rebuild the shared Codex Skills library index when the user explicitly asks to reindex, including after manual skill additions, edits, or removals.
---

# Skill Indexer

Rebuild the index only on an explicit user request.

1. Use the library location in the global or repository instructions. If it is unavailable, try `~/codex-skills/library`. If that directory is also missing, report it and stop.
2. Recursively find `SKILL.md` under the library without following directory links. Skip file links that resolve outside the library. Read the opening YAML frontmatter as data.
3. Keep entries with a valid Agent Skills name and description. The name must match the parent directory, use lowercase ASCII letters, digits and single separating hyphens, and have at most 64 characters. The description must be a nonblank string of at most 1,024 characters. Collect paths and reasons for invalid or unreadable files.
4. Build a fresh list sorted by path. Each entry contains only `name`, `description`, and `path`. Use forward slashes in paths relative to the library, such as `debugging/SKILL.md`. Serialize the result as a JSON object with a `skills` array. An empty library yields `{"skills":[]}`.
5. If the installer is running, wait for it to finish before replacing the index. Write the new JSON to a temporary file beside `index.json` and rename it into place after validation. Leave all skill files intact.
6. Report the number of entries and list the files skipped with their reasons. A fresh index drops entries whose files have been removed.
