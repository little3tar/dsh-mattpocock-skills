#!/usr/bin/env node
/**
 * Generate this repository's skills/ straight from upstream mattpocock/skills.
 *
 * The pack is a pure function of upstream: every promoted skill file is read
 * from the target commit, passed through the dsh adaptation rules below, and
 * written out. There is no merge base and no three-way merge, so a sync cannot
 * conflict. Upstream rewording that invalidates a rule is surfaced instead: the
 * rule stops firing, and --check reports it.
 *
 * Usage:
 *   node scripts/sync-upstream.mjs [--to <sha|HEAD>] [--out <dir>] [--cache <dir>]
 *                                  [--check] [--dry-run] [--prune] [--eol lf|crlf]
 *
 * Options:
 *   --to <sha>      upstream commit to generate from (default: HEAD)
 *   --out <dir>     destination for the generated skills (default: <repo>/skills)
 *   --cache <dir>   git clone used to read upstream (default: <repo>/.upstream-cache)
 *   --check         verify <dir> is reproducible from --to; writes nothing; exits
 *                   non-zero on any content drift, missing/extra file or skill,
 *                   or rule that no longer fires. --to defaults to the pinned
 *                   commit in .upstream.json, so --check answers "is what is
 *                   committed reproducible from its pin?".
 *   --dry-run       print what a sync would change; writes nothing
 *   --prune         also delete local skill directories upstream no longer promotes
 *   --eol <mode>    output line endings: lf (default, matches .gitattributes) or crlf
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const UPSTREAM_URL = 'https://github.com/mattpocock/skills.git'
const STATE_FILE = '.upstream.json'
/** Upstream buckets whose skills are promoted into the plugin manifest. */
const MANIFEST = '.claude-plugin/plugin.json'
/** Excluded from the adapted pack: harness-specific adapter files and bucket indexes. */
const EXCLUDED_FILES = new Set(['agents/openai.yaml', 'README.md'])

/**
 * dsh adaptation rules, applied in order to every upstream body (PROVENANCE.md).
 * Each rule is `{ name, pattern, replace }` applied with String.replace.
 * Every rule is expected to fire on the pinned commit; --check reports the ones
 * that do not, which is how upstream rewording of adapted prose is caught.
 */
const ADAPT_RULES = [
  { name: 'drop argument-hint frontmatter', pattern: /^argument-hint:.*\n/gm, replace: '' },
  // dsh's skill loader parses flat `key: value` frontmatter only, so a nested
  // block (upstream `pr` carries metadata.credits) would make the skill
  // unloadable. Attribution for `pr` lives in its CREDITS.md instead.
  {
    name: 'drop nested metadata frontmatter (flat keys only)',
    pattern: /^metadata:\n(?:[ \t]+.*\n)*/gm,
    replace: '',
  },
  {
    name: 'Skill tool -> `skill` tool (quoted name)',
    pattern: /([Cc]all(?:s|ing)?) the Skill tool with "([^"]+)"/g,
    replace: (_, verb, s) => `${verb} the \`skill\` tool with name \`${s}\``,
  },
  {
    name: 'Skill tool -> `skill` tool (backticked name)',
    pattern: /([Cc]all(?:s|ing)?) the Skill tool with `([^`]+)`/g,
    replace: (_, verb, s) => `${verb} the \`skill\` tool with name \`${s}\``,
  },
  {
    name: 'Skill tool for -> `skill` tool for',
    pattern: /([Cc]all(?:s|ing)?) the Skill tool for\b/g,
    replace: (_, verb) => `${verb} the \`skill\` tool for`,
  },
  {
    name: 'Skill tool twice -> `skill` tool twice',
    pattern: /([Cc]all(?:s|ing)?) the Skill tool twice, for "([^"]+)" and "([^"]+)"/g,
    replace: (_, verb, a, b) => `${verb} the \`skill\` tool twice, with names \`${a}\` and \`${b}\``,
  },
  { name: 'sub-agents -> subagents', pattern: /sub-agents/g, replace: 'subagents' },
  { name: 'sub-agent -> subagent', pattern: /sub-agent/g, replace: 'subagent' },
  // PROVENANCE per-skill log: /clear has no dsh counterpart; it becomes a new session.
  {
    name: '/clear -> new session (inline)',
    pattern: /If so, \*\*`\/clear`\*\*\./g,
    replace: 'If so, start a **new session**.',
  },
  {
    name: '/clear -> new session (resumable)',
    pattern: /`\/clear` also isn't terminal:/g,
    replace: "A new session also isn't terminal:",
  },
  {
    name: '/clear -> new session (list item)',
    pattern: /- \*\*`\/clear`\*\*: empty the window,/g,
    replace: '- **New session**: start from an empty window,',
  },
  {
    name: '/clear -> new session (gerund)',
    pattern: /`\/clear`ing context between each one/g,
    replace: 'starting a fresh session between each one',
  },
  {
    name: '/clear -> new session (table row)',
    pattern: /\| \*\*`\/clear`\*\* \| Empty the context window and start from nothing\./g,
    replace: '| **New session** | Start from an empty context window.',
  },
  // Model-side skill references lose the slash; user-typed commands keep it.
  // ask-matt is the exception: its body is a catalogue of the commands the
  // *user* types, and it writes every entry that way, so its slashes stay.
  {
    name: 'de-slash model-side skill reference',
    pattern: /`\/(codebase-design|grilling|domain-modeling)`/g,
    replace: '`$1`',
    skipFiles: ['ask-matt/SKILL.md'],
  },
  // Name the subagent tool where a body dispatches one.
  {
    name: 'name the `subagent` tool (walk the codebase)',
    pattern: /Then spawn a subagent to walk the codebase\./g,
    replace: 'Then spawn a subagent (the `subagent` tool) to walk the codebase.',
  },
  {
    name: 'name the `subagent` tool (resolved by)',
    pattern: /Resolved by a subagent that calls/g,
    replace: 'Resolved by a subagent (`subagent` tool) that calls',
  },
  {
    name: 'name the `subagent` tool (spin up)',
    pattern: /spin up a subagent that calls/g,
    replace: 'spin up a subagent (`subagent` tool) that calls',
  },
  {
    name: 'name the `subagent` tool (grilling facts)',
    pattern: /dispatch a subagent to find it/g,
    replace: 'dispatch a subagent (the `subagent` tool) to find it',
  },
  {
    name: 'background agent -> background subagent',
    pattern: /\*\*background agent\*\*/g,
    replace: '**background subagent** (the `subagent` tool with `run_in_background: true`)',
  },
  // dsh runs the two review subagents concurrently only when issued in one message.
  {
    name: 'code-review: name the concurrent dispatch',
    pattern: /\*\*Standards subagent prompt\*\* should include:/g,
    replace: 'Issue the two `subagent` tool calls in one message so they run concurrently.\n\n**Standards subagent prompt** — include:',
  },
  {
    name: 'code-review: Spec prompt wording',
    pattern: /\*\*Spec subagent prompt\*\* should include:/g,
    replace: '**Spec subagent prompt** — include:',
  },
  {
    name: 'codebase-design: name the one-message dispatch',
    pattern: /Spawn 3\+ subagents in parallel\. Each must/g,
    replace: 'Spawn 3+ subagents in parallel — one `subagent` tool call each, all issued in the same message. Each must',
  },
  // Model-side slash instructions the bodies hand the agent.
  {
    name: 'implement: /tdd -> `skill` tool',
    pattern: /Use \/tdd where possible, at pre-agreed seams\./g,
    replace: 'Call the `skill` tool with name `tdd` and follow it where possible, at pre-agreed seams.',
  },
  {
    name: 'implement: /code-review -> `skill` tool',
    pattern: /Once done, use \/code-review to review the work\./g,
    replace: 'Once done, call the `skill` tool with name `code-review` and review the work.',
  },
  {
    name: 'handoff: suggested-skills wording',
    pattern: /naming which skills the next agent should call the `skill` tool for\./g,
    replace: 'naming which skills the next agent should load via the `skill` tool, or ask the user to invoke by name.',
  },
  // Example harness swap: dsh is the second harness here, not Codex.
  {
    name: 'harness swap example',
    pattern: /\(Claude → Codex\)/g,
    replace: '(e.g. Claude Code → dsh)',
  },
]

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const flag = (name) => process.argv.includes(name)

/** Run a command, returning stdout; throws with stderr on failure. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.error) throw result.error
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${(result.stderr || '').trim()}`)
  }
  return result
}

const normalize = (text) => text.replace(/\r\n/g, '\n')

async function readText(file) {
  return normalize(await fsp.readFile(file, 'utf8'))
}

/** Write with the target EOL; comparison and generation stay LF-only. */
async function writeText(file, text, eol = '\n') {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, eol === '\n' ? text : text.replace(/\n/g, eol), 'utf8')
}

/**
 * Apply the dsh adaptation rules; returns the text and the rules that fired.
 * `file` is the repo-relative path (`<skill>/<file>`), so a rule can exempt a
 * file whose text is not model-facing (see the de-slash rule).
 */
export function adapt(text, file = '') {
  const fired = new Set()
  let out = text
  for (const rule of ADAPT_RULES) {
    if (rule.skipFiles?.includes(file)) continue
    const before = out
    out = out.replace(rule.pattern, rule.replace)
    if (out !== before) fired.add(rule.name)
  }
  return { text: out, fired: [...fired] }
}

/** Recursively list files under `dir`, relative POSIX paths; [] when missing. */
async function listFiles(dir) {
  const found = []
  async function walk(current) {
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(absolute)
      else found.push(path.relative(dir, absolute).split(path.sep).join('/'))
    }
  }
  if (fs.existsSync(dir)) await walk(dir)
  return found.sort()
}

/** Line-aligned difference between two texts, for the report. */
function diffLines(before, after, limit = 20) {
  const a = before.split('\n')
  const b = after.split('\n')
  const hunks = []
  for (let i = 0; i < Math.max(a.length, b.length) && hunks.length < limit; i++) {
    if (a[i] === b[i]) continue
    hunks.push({ line: i + 1, pack: a[i], expected: b[i] })
  }
  return hunks
}

/**
 * Compare a skill tree against the freshly generated one. The generated tree is
 * authoritative: every file it holds must match, and everything left over in
 * `currentDir` is drift. Leftovers inside a promoted skill are stale files;
 * leftovers that form a whole extra directory are skills upstream dropped.
 */
async function compareTrees(currentDir, generatedDir, promotedNames) {
  const current = await listFiles(currentDir)
  const generated = await listFiles(generatedDir)
  const currentSet = new Set(current)
  const generatedSet = new Set(generated)
  const added = generated.filter((rel) => !currentSet.has(rel))
  const stale = current.filter((rel) => !generatedSet.has(rel))
  const extraFiles = stale.filter((rel) => promotedNames.has(rel.split('/')[0]))
  const extraSkillDirs = [
    ...new Set(stale.filter((rel) => !promotedNames.has(rel.split('/')[0])).map((rel) => rel.split('/')[0])),
  ].sort()
  const changed = []
  for (const rel of generated) {
    if (!currentSet.has(rel)) continue
    const before = await readText(path.join(currentDir, rel))
    const after = await readText(path.join(generatedDir, rel))
    if (before === after) continue
    changed.push({ path: rel, hunks: diffLines(before, after) })
  }
  return { added, extraFiles, extraSkillDirs, changed }
}

async function main() {
  const check = flag('--check')
  const dryRun = flag('--dry-run')
  const prune = flag('--prune')
  const eol = arg('--eol', 'lf') === 'crlf' ? '\r\n' : '\n'
  const outDir = path.resolve(arg('--out', path.join(REPO_ROOT, 'skills')))
  const cacheDir = path.resolve(arg('--cache', path.join(REPO_ROOT, '.upstream-cache')))
  const statePath = path.join(REPO_ROOT, STATE_FILE)
  const state = fs.existsSync(statePath) ? JSON.parse(await readText(statePath)) : {}
  const requested = arg('--to', check ? state.baseCommit : 'HEAD')
  if (requested === undefined) {
    throw new Error(`no upstream commit: pass --to or record baseCommit in ${STATE_FILE}`)
  }

  // Upstream cache: a working repo we can add a worktree to. `init` + shallow
  // `fetch` is used instead of `clone` because partial clone / filter
  // negotiation is more fragile over flaky links.
  if (!fs.existsSync(path.join(cacheDir, '.git'))) {
    console.log(`initializing upstream cache at ${cacheDir}`)
    await fsp.mkdir(cacheDir, { recursive: true })
    run('git', ['-C', cacheDir, 'init', '--quiet'])
    run('git', ['-C', cacheDir, 'remote', 'add', 'origin', UPSTREAM_URL], { allowFailure: true })
  }

  const revParse = (ref) =>
    run('git', ['-C', cacheDir, 'rev-parse', '--verify', `${ref}^{commit}`], { allowFailure: true })
  function resolveRef(ref) {
    const result = revParse(ref)
    return result.status === 0 ? result.stdout.trim() : null
  }
  async function ensureRef(ref) {
    if (resolveRef(ref) !== null) return
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = run('git', ['-C', cacheDir, 'fetch', '--depth', '1', 'origin', ref], { allowFailure: true })
      if (result.status === 0) return
      const detail = (result.stderr || result.stdout || '').trim().split('\n').pop()
      console.warn(`fetch ${ref} attempt ${attempt}/3 failed: ${detail}`)
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    throw new Error(`unable to fetch ${ref} from ${UPSTREAM_URL}`)
  }

  await ensureRef(requested)
  const target = resolveRef(requested)
  const label = path.relative(REPO_ROOT, outDir).split(path.sep).join('/') || '.'
  console.log(`upstream ${target.slice(0, 8)} -> ${label}`)

  const workRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'mattpocock-sync-'))
  const upstreamDir = path.join(workRoot, 'upstream')
  run('git', ['-C', cacheDir, 'worktree', 'add', '--detach', upstreamDir, target])
  try {
    const manifest = JSON.parse(await readText(path.join(upstreamDir, MANIFEST)))
    const promoted = manifest.skills.map((entry) => entry.replace(/^\.\/skills\//, ''))
    const promotedNames = new Set(promoted.map((entry) => path.posix.basename(entry)))

    // Generate the whole pack from upstream, then compare: the pack must be
    // exactly what the rules produce, with nothing added or left behind.
    const generatedDir = path.join(workRoot, 'generated')
    const fired = new Set()
    let files = 0
    for (const entry of promoted) {
      const name = path.posix.basename(entry)
      for (const rel of await listFiles(path.join(upstreamDir, 'skills', entry))) {
        if (EXCLUDED_FILES.has(rel)) continue
        const { text, fired: rules } = adapt(await readText(path.join(upstreamDir, 'skills', entry, rel)), `${name}/${rel}`)
        for (const rule of rules) fired.add(rule)
        await writeText(path.join(generatedDir, name, rel), text, eol)
        files++
      }
    }
    const staleRules = ADAPT_RULES.map((rule) => rule.name).filter((name) => !fired.has(name))
    const diff = await compareTrees(outDir, generatedDir, promotedNames)
    const drift = diff.changed.length + diff.added.length + diff.extraFiles.length + diff.extraSkillDirs.length

    if (drift === 0) {
      console.log(`clean: all ${files} files in ${promoted.length} skills reproduce ${label}`)
    } else {
      console.log(`drift: ${drift} file(s) in ${label} differ from upstream ${target.slice(0, 8)} + the rules`)
      for (const item of diff.changed) {
        console.log(`  changed  ${item.path}`)
        for (const hunk of item.hunks) {
          console.log(`    L${hunk.line} pack     | ${hunk.pack ?? '<missing>'}`)
          console.log(`    L${hunk.line} expected | ${hunk.expected ?? '<missing>'}`)
        }
      }
      for (const rel of diff.added) console.log(`  missing  ${rel}`)
      for (const rel of diff.extraFiles) console.log(`  extra    ${rel}`)
      for (const name of diff.extraSkillDirs) console.log(`  extra skill dir  ${name}/`)
    }
    if (staleRules.length > 0) {
      console.log(`stale rules (never fired on upstream ${target.slice(0, 8)}): ${staleRules.join(', ')}`)
    }

    if (check) {
      if (drift > 0 || staleRules.length > 0) {
        console.error(`check failed: ${label} is not reproducible from upstream ${target.slice(0, 8)}`)
        process.exitCode = 1
      } else {
        console.log(`ok — all ${files} files reproducible from upstream ${target.slice(0, 8)}, ${ADAPT_RULES.length} rules live (0 stale)`)
      }
      return
    }
    if (dryRun) {
      console.log('dry run: nothing written')
      return
    }

    // Apply: the generated tree is authoritative, so stale files inside a
    // promoted skill always go; a whole extra skill directory needs --prune.
    for (const rel of diff.extraFiles) await fsp.rm(path.join(outDir, rel), { force: true })
    if (diff.extraSkillDirs.length > 0) {
      if (prune) {
        for (const name of diff.extraSkillDirs) await fsp.rm(path.join(outDir, name), { recursive: true, force: true })
      } else {
        console.log(`kept (pass --prune to remove): ${diff.extraSkillDirs.join(', ')}`)
      }
    }
    for (const rel of [...diff.added, ...diff.changed.map((item) => item.path)]) {
      await writeText(path.join(outDir, rel), await readText(path.join(generatedDir, rel)), eol)
    }
    await writeText(statePath, `${JSON.stringify({ upstream: UPSTREAM_URL, baseCommit: target, syncedAt: new Date().toISOString() }, null, 2)}\n`)

    console.log(`synced: ${diff.changed.length} updated, ${diff.added.length} added, ${diff.extraFiles.length} removed, ${diff.extraSkillDirs.length} skill dir(s) ${prune ? 'pruned' : 'extra'}`)
    if (state.baseCommit !== target) {
      console.log(`next: git tag -a sync/${target.slice(0, 8)} -m "generated from mattpocock/skills ${target}" && git push --tags`)
    }
  } finally {
    run('git', ['-C', cacheDir, 'worktree', 'remove', '--force', upstreamDir], { allowFailure: true })
    await fsp.rm(workRoot, { recursive: true, force: true })
  }
}

/** Run the sync only when executed directly, so the rules stay unit-testable. */
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
