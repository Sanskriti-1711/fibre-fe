#!/usr/bin/env node
/**
 * Fail when the repository tracks a file that its own ignore rules exclude.
 *
 * `.gitignore` only stops *untracked* files from being noticed -- it says
 * nothing about what is already in the index. So `npm ci --cache .npm`
 * followed by one `git add -A` put 422 cache blobs into a deploy commit and
 * every check stayed green, because none of them looked at the index.
 *
 * Two independent signals, because they catch different mistakes:
 *
 *   1. `git ls-files -ci --exclude-standard` -- anything tracked that the
 *      ignore rules already exclude (`git add -f`, or a rule added later).
 *   2. A short list of paths that are junk in any project (dependency trees,
 *      npm caches, OS droppings, bytecode). These fail even with no ignore
 *      rule, so a missing rule cannot hide them.
 *
 * Usage: node ci/no-tracked-ignored.cjs
 * Exit 0 = clean, 1 = offenders found (or git could not be asked).
 */
'use strict';

const { spawnSync } = require('node:child_process');

const ALWAYS_JUNK = [
  /(^|\/)node_modules\//,
  /(^|\/)\.npm\//,
  /(^|\/)\.DS_Store$/,
  /(^|\/)__pycache__\//,
  /(^|\/)\.venv\//,
];

const SHOWN = 20;

function git(args) {
  const res = spawnSync('git', args, { encoding: 'utf8' });
  return {
    status: res.status,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
  };
}

function list(args) {
  return git(args)
    .stdout.split('\0')
    .filter(Boolean);
}

function main() {
  const tracked = list(['ls-files', '-z']);
  if (!tracked.length) {
    console.error('✖ could not read the index — is this a git checkout?');
    return 1;
  }

  const ignoredRes = git(['ls-files', '-c', '-i', '--exclude-standard', '-z']);
  if (ignoredRes.status !== 0) {
    console.error(`✖ git ls-files failed: ${ignoredRes.stderr || 'no output'}`);
    return 1;
  }
  const ignored = ignoredRes.stdout.split('\0').filter(Boolean);
  const junk = tracked.filter((file) => ALWAYS_JUNK.some((re) => re.test(file)));

  const offenders = [...new Set([...ignored, ...junk])].sort();

  if (offenders.length) {
    console.error(`\n✖ ${offenders.length} tracked file(s) should not be in the repo:\n`);
    offenders.slice(0, SHOWN).forEach((file) => console.error(`   ${file}`));
    if (offenders.length > SHOWN) {
      console.error(`   … and ${offenders.length - SHOWN} more`);
    }
    console.error(
      '\nRemove them from the index without touching the working tree:\n' +
        '   git rm -r --cached <path>   (then commit, and add the path to .gitignore)\n'
    );
    return 1;
  }

  console.log(`✅ ${tracked.length} tracked file(s), none ignored or junk.`);
  return 0;
}

process.exit(main());
