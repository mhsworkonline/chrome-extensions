#!/usr/bin/env node
/**
 * deploy.js - commit everything in this folder and push it to GitHub.
 *
 * Usage (from this folder):
 *   node deploy.js                       commit with an automatic message, then push
 *   node deploy.js "Fix popup layout"    commit with your own message, then push
 *   node deploy.js --dry-run             run every check and show what would happen; change nothing
 *   node deploy.js --skip-scan "msg"     bypass the secret scan (only after you've reviewed a false positive)
 *
 * What it does, in order:
 *   1. makes sure this folder is a git repository on the right branch with `origin` set
 *   2. stages your changes (respecting .gitignore)
 *   3. refuses to continue if it spots secrets, private keys, .env files or oversized files
 *   4. commits, then pushes (setting the upstream if needed)
 *   5. if GitHub rejects the push because the remote has newer commits, it rebases once and retries
 *
 * It never force-pushes and never rewrites history that has already been pushed.
 * Sign-in is handled by Git Credential Manager: if GitHub needs a login, a browser window opens.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------- settings
const REMOTE_URL = 'https://github.com/mhsworkonline/chrome-extensions.git';
const BRANCH = 'main';
const MAX_FILE_BYTES = 95 * 1024 * 1024; // GitHub rejects files over 100 MB

// Patterns that should never reach a repository.
const SECRET_PATTERNS = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9]{32,}/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{40,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Google OAuth token', /\bya29\.[0-9A-Za-z_-]{20,}/],
  ['Private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
const FORBIDDEN_NAMES = [/(^|\/)\.env(\..*)?$/i, /\.pem$/i, /\.p12$/i, /\.pfx$/i, /(^|\/)id_(rsa|ed25519|ecdsa)$/i, /(^|\/)credentials.*\.json$/i, /(^|\/)node_modules\//];
// Placeholders and examples are fine.
const ALLOWED_NAMES = [/\.env\.example$/i];

// ---------------------------------------------------------------- helpers
const ROOT = __dirname;
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const customMessage = argv.filter((a) => !a.startsWith('--')).join(' ').trim();
const DRY_RUN = flags.has('--dry-run');
const SKIP_SCAN = flags.has('--skip-scan');

const say = (msg) => console.log(msg);
const step = (msg) => console.log(`\n> ${msg}`);
const fail = (msg, code = 1) => {
  console.error(`\nx ${msg}`);
  process.exit(code);
};

function git(args, { allowFail = false, inheritIO = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    // Pushing may need to show a credential prompt, so stdin/stdout stay connected; stderr is captured to inspect failures.
    stdio: inheritIO ? ['inherit', 'inherit', 'pipe'] : ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    if (result.error.code === 'ENOENT') fail('Git is not installed or not on PATH. Install it from https://git-scm.com and try again.');
    fail(`Could not run git: ${result.error.message}`);
  }
  const out = {
    ok: result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
  if (!out.ok && !allowFail) fail(`git ${args.join(' ')} failed:\n${out.stderr || out.stdout}`);
  return out;
}

const hasCommits = () => git(['rev-parse', '--verify', 'HEAD'], { allowFail: true }).ok;
const currentBranch = () => git(['symbolic-ref', '--short', 'HEAD'], { allowFail: true }).stdout;

// ---------------------------------------------------------------- 1. repository, branch, remote
function ensureRepo() {
  step('Checking the git repository');
  const inside = git(['rev-parse', '--is-inside-work-tree'], { allowFail: true });
  const top = inside.ok ? path.resolve(git(['rev-parse', '--show-toplevel']).stdout) : null;

  if (!inside.ok || top !== path.resolve(ROOT)) {
    if (DRY_RUN) return say(`  (dry run) would run: git init -b ${BRANCH}`);
    git(['init', '-b', BRANCH]);
    say(`  Initialised a new repository on branch ${BRANCH}.`);
  } else {
    say('  Already a git repository.');
  }
}

function ensureBranch() {
  step('Checking the branch');
  const branch = currentBranch();
  if (!branch) return;
  if (branch === BRANCH) return say(`  On ${BRANCH}.`);

  if (!hasCommits()) {
    if (DRY_RUN) return say(`  (dry run) would rename the empty branch "${branch}" to ${BRANCH}.`);
    git(['branch', '-M', BRANCH]);
    return say(`  Renamed the empty branch "${branch}" to ${BRANCH}.`);
  }
  say(`  Note: you are on "${branch}", not ${BRANCH}. This run will push "${branch}".`);
}

function ensureRemote() {
  step('Checking the GitHub remote');
  const current = git(['remote', 'get-url', 'origin'], { allowFail: true });
  if (!current.ok) {
    if (DRY_RUN) return say(`  (dry run) would add origin -> ${REMOTE_URL}`);
    git(['remote', 'add', 'origin', REMOTE_URL]);
    return say(`  Added origin -> ${REMOTE_URL}`);
  }
  if (current.stdout.replace(/\.git$/, '') !== REMOTE_URL.replace(/\.git$/, '')) {
    if (DRY_RUN) return say(`  (dry run) would change origin from ${current.stdout} to ${REMOTE_URL}`);
    git(['remote', 'set-url', 'origin', REMOTE_URL]);
    return say(`  Updated origin: ${current.stdout} -> ${REMOTE_URL}`);
  }
  say(`  origin is ${REMOTE_URL}`);
}

// ---------------------------------------------------------------- 2. staging and the safety scan
function stage() {
  step('Staging changes');
  if (DRY_RUN) {
    // `git add -n` lists what would be staged without touching the index.
    const preview = git(['add', '-A', '-n']).stdout;
    const count = preview ? preview.split('\n').length : 0;
    return say(`  (dry run) ${count} file(s) would be staged.`);
  }
  git(['add', '-A']);
  const names = git(['diff', '--cached', '--name-only']).stdout;
  say(`  ${names ? names.split('\n').length : 0} file(s) staged.`);
}

function stagedFiles() {
  const cmd = DRY_RUN ? ['add', '-A', '-n'] : ['diff', '--cached', '--name-only', '--diff-filter=ACMR'];
  const out = git(cmd).stdout;
  if (!out) return [];
  return out.split('\n').map((l) => (DRY_RUN ? l.replace(/^add '/, '').replace(/'$/, '') : l));
}

function safetyScan() {
  step('Scanning for secrets and oversized files');
  const problems = [];
  const files = stagedFiles();

  for (const file of files) {
    if (ALLOWED_NAMES.some((re) => re.test(file))) continue;
    if (FORBIDDEN_NAMES.some((re) => re.test(file))) problems.push(`${file}: this kind of file should not be committed`);

    const full = path.join(ROOT, file);
    try {
      const size = fs.statSync(full).size;
      if (size > MAX_FILE_BYTES) problems.push(`${file}: ${(size / 1048576).toFixed(0)} MB is over GitHub's 100 MB limit`);
    } catch {
      /* file vanished between listing and checking */
    }
  }

  // Look only at lines being added, so old history and untouched files are not re-scanned.
  if (!DRY_RUN) {
    const diff = git(['diff', '--cached', '-U0', '--no-color', '--diff-filter=ACMR']).stdout;
    let current = '';
    for (const line of diff.split('\n')) {
      if (line.startsWith('+++ b/')) current = line.slice(6);
      else if (line.startsWith('+') && !line.startsWith('+++')) {
        for (const [label, re] of SECRET_PATTERNS) {
          if (re.test(line)) problems.push(`${current}: looks like a ${label}`);
        }
      }
    }
  }

  if (!problems.length) return say(`  Clean (${files.length} file(s) checked).`);

  const unique = [...new Set(problems)];
  console.error('\nx Stopped before committing. Please look at these:');
  unique.slice(0, 25).forEach((p) => console.error(`    - ${p}`));
  console.error('\n  Remove the secret (and rotate it if it was real), or add the file to .gitignore, then run again.');
  console.error('  If you have confirmed a match is a false positive, re-run with --skip-scan.');
  if (!DRY_RUN) git(['reset', '-q'], { allowFail: true }); // leave nothing half-staged
  if (SKIP_SCAN) return say('  Problems were found but --skip-scan was given, continuing.');
  process.exit(2);
}

// ---------------------------------------------------------------- 3. commit
function commit() {
  step('Committing');
  if (DRY_RUN) return say('  (dry run) nothing committed.');

  const pending = git(['diff', '--cached', '--quiet'], { allowFail: true });
  if (pending.ok) return say('  Nothing new to commit.');

  const stat = git(['diff', '--cached', '--shortstat']).stdout.trim();
  const message = customMessage || `Update ${new Date().toISOString().slice(0, 16).replace('T', ' ')}: ${stat}`;
  git(['commit', '-m', message]);
  say(`  Committed: ${message.split('\n')[0]}`);
}

// ---------------------------------------------------------------- 4. push
const AUTH_HINT = /authentication failed|could not read username|terminal prompts disabled|permission denied|403|invalid credentials/i;
const REJECTED = /non-fast-forward|fetch first|rejected|failed to push some refs|updates were rejected/i;

function push(branch) {
  step(`Pushing ${branch} to GitHub`);
  if (DRY_RUN) return say(`  (dry run) would run: git push -u origin ${branch}`);
  if (!hasCommits()) fail('There is nothing to push yet.');

  const attempt = () => git(['push', '-u', 'origin', branch], { allowFail: true, inheritIO: true });
  let result = attempt();
  if (result.stderr) say(result.stderr.split('\n').map((l) => `  ${l}`).join('\n'));
  if (result.ok) return;

  if (REJECTED.test(result.stderr)) {
    say('\n  GitHub has commits this copy does not. Rebasing onto them once (no force-push)...');
    const pull = git(['pull', '--rebase', 'origin', branch], { allowFail: true });
    if (!pull.ok) {
      git(['rebase', '--abort'], { allowFail: true });
      fail(`Could not combine your changes with the ones on GitHub automatically:\n${pull.stderr || pull.stdout}\n\nYour local work is untouched. Resolve it by hand with: git pull --rebase origin ${branch}`);
    }
    result = attempt();
    if (result.stderr) say(result.stderr.split('\n').map((l) => `  ${l}`).join('\n'));
    if (result.ok) return;
  }

  if (AUTH_HINT.test(result.stderr)) {
    fail('GitHub did not accept the login. Run this command once in a normal terminal, sign in when the browser opens, then run deploy.js again:\n    git push -u origin ' + branch + '\nMake sure you are signed in as the account that owns ' + REMOTE_URL + '.');
  }
  fail(`Push failed:\n${result.stderr}`);
}

// ---------------------------------------------------------------- 5. verify
function verify(branch) {
  step('Verifying');
  if (DRY_RUN) return say('  (dry run) done. Nothing was changed.');
  const local = git(['rev-parse', 'HEAD']).stdout;
  const remote = git(['ls-remote', 'origin', `refs/heads/${branch}`], { allowFail: true }).stdout.split(/\s+/)[0];
  if (remote !== local) fail(`The push finished but GitHub reports a different commit (${remote || 'none'}) than this one (${local}).`);

  say('  Push succeeded.');
  say(`  Repository : ${REMOTE_URL.replace(/\.git$/, '')}`);
  say(`  Branch     : ${branch}`);
  say(`  Commit     : ${git(['rev-parse', '--short', 'HEAD']).stdout}  ${git(['log', '-1', '--pretty=%s']).stdout}`);
}

// ---------------------------------------------------------------- run
ensureRepo();
ensureBranch();
ensureRemote();
stage();
if (!SKIP_SCAN || DRY_RUN) safetyScan();
else say('\n> Skipping the secret scan (--skip-scan).');
commit();
const branchToPush = currentBranch() || BRANCH;
push(branchToPush);
verify(branchToPush);
