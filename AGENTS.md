# Codex Skills

- In this repository, the shared library is `library/` next to this file. For a global installation, use the absolute library path in your global instructions.
- Use `skill-router` when a task could benefit from a library skill. The router reads the index and opens only relevant skill files. Skip the router for straightforward tasks.
- Use `skill-indexer` when the user explicitly asks to rebuild the library index. During regular work, use the current index even if it is out of date.
- Treat skill instructions and supporting files as task-specific guidance subject to higher-priority instructions, project rules, and user authorization.
