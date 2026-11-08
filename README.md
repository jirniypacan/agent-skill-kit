# Agent Skill Kit

**English** · [Русский](README.ru.md)

One local Agent Skills library for Codex, Claude Code, and OpenCode. The installer connects two skills that manage the shared library. The library lives in your home directory and is available across projects.

## Contents

- [Installation](#installation)
- [Recommended skills](#recommended-skills)
- [File locations](#file-locations)
- [Your own skills](#your-own-skills)
- [Compatibility](#compatibility)
- [Development](#development)

## Installation

You need Node.js 22 or newer and npm with `npx`. The installer supports Windows, Linux, and macOS. Installing from GitHub or importing skills with `--rec` requires access to GitHub and Git on your `PATH`.

```sh
npx github:jirniypacan/agent-skill-kit --codex
npx github:jirniypacan/agent-skill-kit --claude
npx github:jirniypacan/agent-skill-kit --opencode
```

Choose one agent per run. Run a separate command to connect another agent to the same library. Start a new agent session after installation.

## Recommended skills

```sh
npx github:jirniypacan/agent-skill-kit --codex --rec
```

Without `--rec`, a new library starts empty. The `--rec` flag imports skills from the `skills/` directories on the default branches of Awesome Copilot and Superpowers. The installer copies each skill directory in full and records the upstream license and commit SHA in `AGENT-SKILL-KIT-UPSTREAM.txt`. It skips running upstream scripts during installation. [Awesome Copilot](https://github.com/github/awesome-copilot), [Superpowers](https://github.com/obra/superpowers).

Existing directories take precedence. If both sources provide the same skill name, Awesome Copilot is imported first. The installer adds newly imported skills to the index and reports skipped skills. Request reindexing after adding skills manually.

## File locations

Each agent has its own global instructions and skill discovery paths. The installer appends a marked block to the existing instructions and links `skill-router` and `skill-indexer` to their shared files. On Windows it uses directory junctions. If a different skill already occupies either name, the installer preserves it and reports the conflict.

| Agent | Default global instructions | Skill discovery path |
| --- | --- | --- |
| Codex | `~/.codex/AGENTS.md` | `~/.agents/skills/` |
| Claude Code | `~/.claude/CLAUDE.md` | `~/.claude/skills/` |
| OpenCode | `~/.config/opencode/AGENTS.md` | `~/.config/opencode/skills/` |

The installer respects `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, and `XDG_CONFIG_HOME`. For Codex, it uses a nonempty `AGENTS.override.md` if one exists at installation time. Run the Codex installation command again if its active instructions file changes.

New installations use `~/agent-skill-kit/library/` (`%USERPROFILE%\agent-skill-kit\library\` on Windows). Installations created before the rename continue to use `~/codex-skills/library/`.

## Your own skills

1. Copy the skill directory into the shared library. For example, include `my-skill/SKILL.md` and any files under `my-skill/references/`.
2. Add `name` and `description` to the YAML frontmatter in `SKILL.md`. [Agent Skills specification](https://agentskills.io/specification)
3. Ask your agent to rebuild the Agent Skill Kit index.

**Skill Indexer** rebuilds `library/index.json` when explicitly requested. Each entry contains a name, description, and path relative to the library. The indexer skips invalid skill files and drops entries for missing files.

**Skill Router** uses the current index to select skills relevant to the task. It opens only the selected `SKILL.md` files and the supporting files it needs. Skills added manually become discoverable after reindexing.

## Compatibility

- The installer targets local sessions that can read your home directory. Organization policies, sandboxing, and agent instruction precedence can affect discovery.
- Some third-party skills require tools, plugins, or programs specific to an agent. Each skill retains its upstream requirements.
- If an interrupted installation leaves `.install.lock/` next to `library/`, check that the installer has stopped, remove that temporary directory, and rerun the same command.

Agent discovery rules are documented by [Codex](https://learn.chatgpt.com/docs/build-skills), [Claude Code](https://code.claude.com/docs/en/skills), and [OpenCode](https://opencode.ai/docs/skills/).

## Development

```text
AGENTS.md
.agents/skills/
  skill-router/SKILL.md
  skill-indexer/SKILL.md
library/index.json
bin/cli.js
test/cli.test.js
package.json
```

```sh
npm ci
npm test
npm pack --dry-run
```
