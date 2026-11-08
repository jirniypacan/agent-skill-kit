#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const managerNames = ['skill-router', 'skill-indexer'];
const recommendations = ['github/awesome-copilot', 'obra/superpowers'];
const skillName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const startMarker = '<!-- agent-skill-kit:begin -->';
const endMarker = '<!-- agent-skill-kit:end -->';
const legacyMarkers = ['<!-- codex-skills:begin -->', '<!-- codex-skills:end -->'];
const upstreamNotice = 'AGENT-SKILL-KIT-UPSTREAM.txt';
const usage = 'Usage: agent-skill-kit-cli (--codex | --claude | --opencode) [--rec]';

async function readIfPresent(file, encoding) {
  try {
    return await fs.readFile(file, encoding);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function copyIfMissing(source, target) {
  try {
    await fs.copyFile(source, target, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

async function entryExists(path) {
  try {
    await fs.lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function agentPaths(agent, home) {
  if (agent === 'codex') {
    const config = resolve(process.env.CODEX_HOME || join(home, '.codex'));
    const override = join(config, 'AGENTS.override.md');
    const instructions = (await readIfPresent(override))?.length
      ? override : join(config, 'AGENTS.md');
    return { instructions, skills: join(home, '.agents', 'skills') };
  }
  if (agent === 'claude') {
    const config = resolve(process.env.CLAUDE_CONFIG_DIR || join(home, '.claude'));
    return { instructions: join(config, 'CLAUDE.md'), skills: join(config, 'skills') };
  }
  const xdg = process.env.XDG_CONFIG_HOME || join(home, '.config');
  const config = resolve(xdg, 'opencode');
  return { instructions: join(config, 'AGENTS.md'), skills: join(config, 'skills') };
}

async function connectAgent(agent, home, root) {
  const { instructions, skills } = await agentPaths(agent, home);
  await fs.mkdir(skills, { recursive: true });
  for (const name of managerNames) {
    const source = join(root, '.agents', 'skills', name);
    const target = join(skills, name);
    if (await entryExists(target)) {
      if (await fs.realpath(target).catch(() => null) !== await fs.realpath(source)) {
        throw new Error(`An existing skill occupies ${target}. Move it before connecting this agent.`);
      }
    } else {
      const linkType = process.platform === 'win32' ? 'junction' : 'dir';
      await fs.symlink(source, target, linkType);
    }
  }

  await fs.mkdir(resolve(instructions, '..'), { recursive: true });
  const existing = (await readIfPresent(instructions, 'utf8')) ?? '';
  if ([[startMarker, endMarker], legacyMarkers].some(markers => markers.every(marker => existing.includes(marker)))) {
    return;
  }
  const common = await fs.readFile(join(packageRoot, 'AGENTS.md'), 'utf8');
  const guidance = common.replace(
    /^- In this repository,.*$/m,
    () => '- Use the shared library at `' + join(root, 'library') + '`.',
  ).trimEnd();
  const newline = existing.includes('\r\n') ? '\r\n' : '\n';
  const block = `${startMarker}\n${guidance}\n${endMarker}\n`.replaceAll('\n', newline);
  const separator = existing ? newline + newline : '';
  await fs.appendFile(instructions, separator + block, 'utf8');
}

function git(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
      stdio: ['ignore', 'pipe', 'inherit'],
      windowsHide: true,
    }).trim();
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Git is required for --rec.');
    throw error;
  }
}

function readMetadata(markdown, folder, parse) {
  const frontmatter = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown);
  if (!frontmatter) throw new Error('Missing YAML frontmatter');
  const { name, description } = parse(frontmatter[1]) ?? {};
  if (name !== folder || name.length > 64 || !skillName.test(name)) {
    throw new Error('Invalid name or mismatch with the directory');
  }
  if (typeof description !== 'string' || !description.trim() || description.length > 1024) {
    throw new Error('Invalid description');
  }
  return { name, description: description.trim(), path: `${folder}/SKILL.md` };
}

async function rename(source, target) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(source, target);
      return;
    } catch (error) {
      if (process.platform !== 'win32' || attempt === 4 || !['EPERM', 'EBUSY'].includes(error.code)) {
        throw error;
      }
      await delay(100 * (attempt + 1));
    }
  }
}

async function importRecommendations(library, stage) {
  const { parse } = await import('yaml');
  const indexFile = join(library, 'index.json');
  const index = JSON.parse(await fs.readFile(indexFile, 'utf8'));
  if (!Array.isArray(index?.skills)) throw new Error(`Invalid index at ${indexFile}`);
  const entries = new Map(index.skills.map(entry => [entry.path, entry]));
  let changed = false;
  let added = 0;

  for (const repository of recommendations) {
    const url = `https://github.com/${repository}`;
    const checkout = join(stage, repository.split('/')[1]);
    git(['clone', '--quiet', '--depth=1', '--filter=blob:none', '--sparse',
      '--config', 'core.autocrlf=false', '--config', 'core.longpaths=true',
      '--', `${url}.git`, checkout]);
    git(['-C', checkout, 'sparse-checkout', 'set', 'skills']);
    const revision = git(['-C', checkout, 'rev-parse', 'HEAD']);
    const license = await fs.readFile(join(checkout, 'LICENSE'), 'utf8');
    const sourceRoot = join(checkout, 'skills');
    const folders = await fs.readdir(sourceRoot, { withFileTypes: true });
    for (const folder of folders.filter(entry => entry.isDirectory())) {
      const source = join(sourceRoot, folder.name);
      const target = join(library, folder.name);
      const markdown = await readIfPresent(join(source, 'SKILL.md'), 'utf8');
      if (markdown === undefined) continue;
      const sourceLine = `Source: ${url}\n`;
      let installedMarkdown = markdown;
      const exists = await entryExists(target);
      if (exists) {
        console.log(`Skipped existing skill: ${folder.name}`);
        const path = `${folder.name}/SKILL.md`;
        if (entries.has(path) || !(await fs.lstat(target)).isDirectory()) continue;
        const existingNotice = await readIfPresent(join(target, upstreamNotice), 'utf8')
          ?? await readIfPresent(join(target, 'CODEX-SKILLS-UPSTREAM.txt'), 'utf8');
        if (!existingNotice?.startsWith(sourceLine)) continue;
        installedMarkdown = await readIfPresent(join(target, 'SKILL.md'), 'utf8');
        if (installedMarkdown === undefined) continue;
      }
      let entry;
      try {
        entry = readMetadata(installedMarkdown, folder.name, parse);
      } catch (error) {
        console.warn(`Skipped invalid skill ${repository}/${folder.name}: ${error.message}`);
        continue;
      }
      if (!exists) {
        await fs.writeFile(join(source, upstreamNotice), `${sourceLine}Commit: ${revision}\n\n${license}`, { flag: 'wx' });
        if (await entryExists(target)) {
          console.log(`Skipped existing skill: ${folder.name}`);
          continue;
        }
        await rename(source, target);
        added += 1;
      }
      entries.set(entry.path, entry);
      changed = true;
    }
  }

  if (changed) {
    const skills = [...entries.values()].sort((first, second) => first.path.localeCompare(second.path));
    const temporaryIndex = join(stage, 'index.json');
    await fs.writeFile(temporaryIndex, JSON.stringify({ skills }, null, 2) + '\n');
    await rename(temporaryIndex, indexFile);
  }
  console.log(`Added recommended skills: ${added}`);
}

async function install(agent, recommended) {
  const home = homedir();
  const currentRoot = join(home, 'agent-skill-kit');
  const legacyRoot = join(home, 'codex-skills');
  const hasLegacyLibrary = await entryExists(join(legacyRoot, 'library', 'index.json'));
  const root = hasLegacyLibrary && !(await entryExists(currentRoot)) ? legacyRoot : currentRoot;
  const library = join(root, 'library');
  await fs.mkdir(root, { recursive: true });
  const lock = join(root, '.install.lock');
  try {
    await fs.mkdir(lock);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Installation lock exists at ${lock}. Check for a running installer.`);
    throw error;
  }

  try {
    await fs.mkdir(library, { recursive: true });
    await copyIfMissing(join(packageRoot, 'library', 'index.json'), join(library, 'index.json'));
    await copyIfMissing(join(packageRoot, 'AGENTS.md'), join(root, 'AGENTS.md'));
    const managers = join('.agents', 'skills');
    for (const name of managerNames) {
      const directory = join(root, managers, name);
      await fs.mkdir(directory, { recursive: true });
      await copyIfMissing(join(packageRoot, managers, name, 'SKILL.md'), join(directory, 'SKILL.md'));
    }
    if (recommended) await importRecommendations(library, lock);
    await connectAgent(agent, home, root);
    console.log(`Connected ${agent}. Library: ${library}`);
  } finally {
    await fs.rm(lock, { recursive: true, force: true, maxRetries: 4 });
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      codex: { type: 'boolean', multiple: true },
      claude: { type: 'boolean', multiple: true },
      opencode: { type: 'boolean', multiple: true },
      rec: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  const agents = ['codex', 'claude', 'opencode'].flatMap(agent => (values[agent] ?? []).map(() => agent));
  if (agents.length !== 1) throw new Error(`Choose exactly one agent. ${usage}`);
  await install(agents[0], values.rec);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
