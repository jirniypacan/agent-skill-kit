import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cli = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

async function write(path, text) {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, text);
}

const read = path => fs.readFile(path, 'utf8');

async function profile(t) {
  const home = await fs.mkdtemp(join(tmpdir(), 'codex-skills-test-'));
  t.after(() => fs.rm(home, { recursive: true, force: true, maxRetries: 4 }));
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    CODEX_HOME: join(home, 'codex config'),
    CLAUDE_CONFIG_DIR: join(home, 'claude config'),
    XDG_CONFIG_HOME: join(home, 'xdg'),
  };
  const root = join(home, 'codex-skills');
  const library = join(root, 'library');
  return {
    home, env, root, library,
    index: join(library, 'index.json'),
    run: (...args) => spawnSync(process.execPath, [cli, ...args], { env, cwd: home, encoding: 'utf8' }),
  };
}

function success(result) {
  assert.equal(result.status, 0, result.stderr);
}

test('installs once and connects all three agents to a shared library', async t => {
  const setup = await profile(t);
  const codex = join(setup.env.CODEX_HOME, 'AGENTS.override.md');
  const claude = join(setup.env.CLAUDE_CONFIG_DIR, 'CLAUDE.md');
  const opencode = join(setup.env.XDG_CONFIG_HOME, 'opencode', 'AGENTS.md');
  const original = '# User instructions\r\nKeep my preferences.\r\n';
  for (const file of [codex, claude, opencode]) await write(file, original);
  const userSkill = join(setup.library, 'my-skill', 'SKILL.md');

  success(setup.run('--codex'));
  assert.deepEqual(JSON.parse(await read(setup.index)), { skills: [] });
  assert.equal(await read(claude), original);
  assert.equal(await read(opencode), original);
  const configuredCodex = await read(codex);
  assert.ok(configuredCodex.startsWith(original));
  assert.ok(configuredCodex.includes(setup.library));
  assert.ok(configuredCodex.includes('\r\n<!-- codex-skills:begin -->\r\n'));

  await write(userSkill, 'User skill content');
  success(setup.run('--codex'));
  success(setup.run('--claude'));
  success(setup.run('--opencode'));
  assert.equal(await read(codex), configuredCodex);
  assert.equal(await read(userSkill), 'User skill content');
  assert.deepEqual(JSON.parse(await read(setup.index)), { skills: [] });
  const locations = [
    join(setup.home, '.agents', 'skills'),
    join(setup.env.CLAUDE_CONFIG_DIR, 'skills'),
    join(setup.env.XDG_CONFIG_HOME, 'opencode', 'skills'),
  ];
  for (const location of locations) {
    for (const name of ['skill-router', 'skill-indexer']) {
      const centralSkill = join(setup.root, '.agents', 'skills', name);
      assert.equal(await fs.realpath(join(location, name)), await fs.realpath(centralSkill));
    }
  }
  for (const file of [claude, opencode]) assert.ok((await read(file)).startsWith(original));
});

test('rejects ambiguous commands and preserves a conflicting manager', async t => {
  const setup = await profile(t);
  for (const args of [[], ['--codex', '--claude'], ['--codex', '--codex'], ['--windows']]) {
    assert.equal(setup.run(...args).status, 1);
  }
  await assert.rejects(fs.stat(setup.root), { code: 'ENOENT' });
  const existing = join(setup.home, '.agents', 'skills', 'skill-router', 'SKILL.md');
  await write(existing, 'Another router');
  const result = setup.run('--codex');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /existing skill/);
  assert.equal(await read(existing), 'Another router');
  await assert.rejects(fs.stat(join(setup.root, '.install.lock')), { code: 'ENOENT' });
});

function git(repo, ...args) {
  execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    stdio: 'pipe',
  });
}

const skill = (name, description = 'Example description') =>
  `---\nname: ${name}\ndescription: >-\n  ${description}\n---\n\n# Example\n`;

test('imports recommendations, preserves custom content and recovers an incomplete index', async t => {
  const setup = await profile(t);
  const repositories = ['github/awesome-copilot', 'obra/superpowers'];
  const [copilot, superpowers] = repositories.map(repository => join(setup.home, repository));
  for (const repo of [copilot, superpowers]) {
    await write(join(repo, 'LICENSE'), 'Upstream license');
    git(repo, 'init', '-q');
    git(repo, 'config', 'uploadpack.allowFilter', 'true');
    git(repo, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  }
  await write(join(copilot, 'skills', 'example', 'SKILL.md'), skill('example', 'A: folded YAML description'));
  await write(join(copilot, 'skills', 'example', 'references', 'guide.md'), 'A supporting file');
  await write(join(copilot, 'skills', 'invalid', 'SKILL.md'), skill('mismatch'));
  await write(join(copilot, 'skills', 'custom', 'SKILL.md'), skill('custom'));
  await write(join(superpowers, 'skills', 'example', 'SKILL.md'), skill('example', 'Duplicate'));
  await write(join(superpowers, 'skills', 'debugging', 'SKILL.md'), skill('debugging'));
  for (const repo of [copilot, superpowers]) {
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'Initial skills');
  }
  // Exercise the normal Git download path against deterministic local repositories.
  setup.env.GIT_CONFIG_COUNT = '2';
  for (const [i, repo] of [copilot, superpowers].entries()) {
    setup.env[`GIT_CONFIG_KEY_${i}`] = `url.${pathToFileURL(repo).href}.insteadOf`;
    setup.env[`GIT_CONFIG_VALUE_${i}`] = `https://github.com/${repositories[i]}.git`;
  }

  const custom = join(setup.library, 'custom', 'SKILL.md');
  await write(custom, skill('custom', 'User copy'));
  await write(join(setup.library, 'manual', 'SKILL.md'), skill('manual'));
  const manualEntry = { name: 'custom', description: 'User copy', path: 'custom/SKILL.md' };
  await write(setup.index, JSON.stringify({ skills: [manualEntry] }));
  const initial = setup.run('--codex', '--rec');
  success(initial);
  assert.match(initial.stdout, /Skipped existing skill: custom/);
  assert.match(initial.stderr, /Skipped invalid skill/);
  assert.equal(await read(custom), skill('custom', 'User copy'));
  assert.equal(await read(join(setup.library, 'example', 'references', 'guide.md')), 'A supporting file');
  assert.match(await read(join(setup.library, 'example', 'CODEX-SKILLS-UPSTREAM.txt')), /Upstream license/);
  let index = JSON.parse(await read(setup.index));
  assert.deepEqual(index.skills.map(entry => entry.name), ['custom', 'debugging', 'example']);
  assert.equal(index.skills[2].description, 'A: folded YAML description');

  await write(join(copilot, 'skills', 'new-skill', 'SKILL.md'), skill('new-skill'));
  git(copilot, 'add', '.');
  git(copilot, 'commit', '-qm', 'Add a recommendation');
  index.skills.pop();
  await write(setup.index, JSON.stringify(index));
  const example = join(setup.library, 'example', 'SKILL.md');
  await write(example, skill('example', 'Edited after install'));
  success(setup.run('--claude', '--rec'));
  index = JSON.parse(await read(setup.index));
  assert.deepEqual(index.skills.map(entry => entry.name), ['custom', 'debugging', 'example', 'new-skill']);
  assert.equal(index.skills[2].description, 'Edited after install');
  assert.equal(await read(example), skill('example', 'Edited after install'));
});
