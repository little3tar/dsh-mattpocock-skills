#!/usr/bin/env node
/**
 * Re-adapt upstream mattpocock/skills into this repository's skills/ directory.
 *
 * The upstream skills target Claude Code. This repository carries the dsh
 * adaptation: a small rule set applied on top of upstream bodies (see
 * PROVENANCE.md). Syncing means three-way merging upstream's changes into the
 * already-adapted skills, then re-applying the rules.
 *
 *   ours   = this repository's skills/ (already adapted)
 *   base   = upstream at the commit this repository last synced from
 *   theirs = upstream at the target commit
 *
 * Usage:
 *   node scripts/sync-upstream.mjs --to <sha|HEAD> [options]
 *
 * Options:
 *   --baseline <sha>   upstream commit this repo is adapted from; defaults to
 *                      .upstream.json's baseCommit
 *   --to <sha>         upstream commit to sync to (default: origin HEAD)
 *   --ours <dir>       current adapted skills, read-only (default: --out)
 *   --out <dir>        destination for the adapted skills (default: <repo>/skills)
 *   --cache <dir>      git cache for the upstream clone (default: .upstream-cache)
 *   --report <file>    conflict report path (default: .sync-conflicts.md)
 *   --eol <mode>       output line endings: lf (default — matches upstream and
 *                      .gitattributes), auto (match the existing pack), or crlf.
 *                      Comparison always normalizes to LF, so a sync never
 *                      rewrites a file just for its EOL.
 *   --prune            also delete local skills that upstream removed
 *   --keep-conflicts   leave conflict markers in the output instead of taking upstream's side
 *   --dry-run          do not write skills/, only report
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
 * dsh adaptation rules, applied to every upstream body (PROVENANCE.md).
 * Each rule is `{ name, pattern, replace }` applied with String.replace.
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
  // Model-side skill references lose the slash; user-typed commands keep it.
  {
    name: 'de-slash model-side skill reference',
    pattern: /`\/(codebase-design|grilling|domain-modeling)`/g,
    replace: '`$1`',
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
    name: 'parallel subagent -> parallel-subagent',
    pattern: /parallel subagent pattern/g,
    replace: 'parallel-subagent pattern',
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
const detectEol = (raw) => (raw.includes('\r\n') ? '\r\n' : '\n')
async function readRaw(file) {
  return fsp.readFile(file, 'utf8')
}
async function readText(file) {
  return normalize(await readRaw(file))
}
/** Write with the target EOL; comparison and merging stay LF-only. */
async function writeText(file, text, eol = '\n') {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, eol === '\n' ? text : text.replace(/\n/g, eol), 'utf8')
}

/**
 * Pick the default EOL for files with no local counterpart: whatever the
 * existing adapted pack mostly uses, so a sync never rewrites every line.
 */
async function detectDefaultEol(dir, fallback = '\r\n') {
  const files = (await listFiles(dir)).slice(0, 40)
  if (files.length === 0) return fallback
  let crlf = 0
  let lf = 0
  for (const rel of files) {
    const raw = await readRaw(path.join(dir, rel))
    if (raw.includes('\r\n')) crlf++
    else if (raw.includes('\n')) lf++
  }
  return crlf >= lf ? '\r\n' : '\n'
}

/** Apply the dsh adaptation rules; returns the text and the rules that fired. */
export function adapt(text) {
  const fired = new Set()
  let out = text
  for (const rule of ADAPT_RULES) {
    const before = out
    out = out.replace(rule.pattern, rule.replace)
    if (out !== before) fired.add(rule.name)
  }
  return { text: out, fired: [...fired] }
}

/** Recursively list files under `dir`, relative POSIX paths. */
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

/** Three-way merge `ours`/`base`/`theirs` through git merge-file on temp copies. */
function merge3(ours, base, theirs, tmpDir, key) {
  const safe = key.replace(/[\\/]/g, '__')
  const o = path.join(tmpDir, `${safe}.ours`)
  const b = path.join(tmpDir, `${safe}.base`)
  const t = path.join(tmpDir, `${safe}.theirs`)
  fs.writeFileSync(o, ours, 'utf8')
  fs.writeFileSync(b, base, 'utf8')
  fs.writeFileSync(t, theirs, 'utf8')
  const result = run('git', ['merge-file', '-p', '--diff3', o, b, t], { allowFailure: true })
  return { text: normalize(result.stdout), conflicts: result.status ?? 0 }
}

const CONFLICT_BLOCK = /<<<<<<< [^\n]*\n([\s\S]*?)\|\|\|\|\|\|\| [^\n]*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]*\n/g

/** Split a conflicted merge result into resolved text plus per-block records. */
function describeConflicts(text) {
  const blocks = []
  const resolved = text.replace(CONFLICT_BLOCK, (_, ours, base, theirs) => {
    blocks.push({ ours: ours.trimEnd(), base: base.trimEnd(), theirs: theirs.trimEnd() })
    return theirs
  })
  return { blocks, resolved }
}

async function main() {
  const cacheDir = path.resolve(arg('--cache', path.join(REPO_ROOT, '.upstream-cache')))
  const outDir = path.resolve(arg('--out', path.join(REPO_ROOT, 'skills')))
  const oursDir = path.resolve(arg('--ours', outDir))
  const reportPath = path.resolve(arg('--report', path.join(REPO_ROOT, '.sync-conflicts.md')))
  const target = arg('--to', 'HEAD')
  const eolMode = arg('--eol', 'lf')
  const defaultEol = eolMode === 'lf' ? '\n' : eolMode === 'crlf' ? '\r\n' : await detectDefaultEol(oursDir)
  const prune = flag('--prune')
  const keepConflicts = flag('--keep-conflicts')
  const dryRun = flag('--dry-run')

  // 1. Upstream cache: a bare-ish working repo we can add worktrees to.
  //    `init` + shallow `fetch` is used instead of `clone` because partial
  //    clone / filter negotiation is more fragile over flaky links.
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

  // 2. Resolve commits: baseline from state file (or flag), target as given
  const statePath = path.join(REPO_ROOT, STATE_FILE)
  const state = fs.existsSync(statePath) ? JSON.parse(await readText(statePath)) : {}
  const baseline = arg('--baseline', state.baseCommit)
  if (baseline === undefined) throw new Error(`no baseline: pass --baseline or record baseCommit in ${STATE_FILE}`)
  await ensureRef(baseline)
  await ensureRef(target)
  const baseSha = resolveRef(baseline)
  const targetSha = resolveRef(target)
  console.log(`baseline ${baseSha.slice(0, 8)} -> target ${targetSha.slice(0, 8)}`)

  // 3. Export both revisions as worktrees
  const workRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'mattpocock-sync-'))
  const worktrees = {}
  for (const [label, sha] of [['base', baseSha], ['theirs', targetSha]]) {
    const dir = path.join(workRoot, label)
    run('git', ['-C', cacheDir, 'worktree', 'add', '--detach', dir, sha])
    worktrees[label] = dir
  }

  try {
    const baseSkills = path.join(worktrees.base, 'skills')
    const theirsSkills = path.join(worktrees.theirs, 'skills')
    const manifest = JSON.parse(await readText(path.join(worktrees.theirs, MANIFEST)))
    const promoted = manifest.skills.map((entry) => entry.replace(/^\.\/skills\//, ''))
    const basePromoted = JSON.parse(await readText(path.join(worktrees.base, MANIFEST)))
      .skills.map((entry) => entry.replace(/^\.\/skills\//, ''))

    const tmpDir = await fsp.mkdtemp(path.join(workRoot, 'merge-'))
    const report = []
    const summary = { skills: 0, newSkills: [], removedSkills: [], files: 0, merged: 0, conflictedFiles: 0, conflictBlocks: 0, rules: new Set(), unchanged: 0 }

    for (const entry of promoted) {
      const name = path.posix.basename(entry)
      summary.skills++
      if (!basePromoted.includes(entry)) summary.newSkills.push(name)
      const oursSkill = path.join(oursDir, name)
      const theirsSkill = path.join(theirsSkills, entry)
      const baseSkill = path.join(baseSkills, entry)

      for (const rel of await listFiles(theirsSkill)) {
        if (EXCLUDED_FILES.has(rel)) continue
        const theirsText = await readText(path.join(theirsSkill, rel))
        const oursPath = path.join(oursSkill, rel)
        const basePath = path.join(baseSkill, rel)
        const oursRaw = fs.existsSync(oursPath) ? await readRaw(oursPath) : undefined
        const oursEol = oursRaw === undefined ? undefined : detectEol(oursRaw)
        const ours = oursRaw === undefined ? undefined : normalize(oursRaw)
        let text
        let conflicted = false

        if (ours !== undefined && fs.existsSync(basePath)) {
          const base = await readText(basePath)
          if (ours === theirsText) {
            text = ours
          } else if (base === theirsText) {
            text = ours // upstream untouched: keep the local adaptation
          } else {
            const merged = merge3(ours, base, theirsText, tmpDir, `${name}_${rel}`)
            text = merged.text
            if (merged.conflicts > 0) {
              conflicted = true
              if (!keepConflicts) {
                const { blocks, resolved } = describeConflicts(text)
                summary.conflictBlocks += blocks.length
                report.push({ skill: name, file: rel, blocks })
                text = resolved
              }
            }
            summary.merged++
          }
        } else {
          text = theirsText // new file or new skill: adapt from scratch
        }

        const { text: adapted, fired } = adapt(text)
        for (const rule of fired) summary.rules.add(rule)
        if (conflicted) summary.conflictedFiles++
        if (!dryRun) await writeText(path.join(outDir, name, rel), adapted, oursEol ?? defaultEol)
        summary.files++
        if (adapted === theirsText && oursRaw !== undefined) summary.unchanged++
      }
    }

    // Skills upstream dropped (kept locally unless --prune)
    for (const entry of basePromoted) {
      if (promoted.includes(entry)) continue
      const name = path.posix.basename(entry)
      summary.removedSkills.push(name)
      if (prune && !dryRun) await fsp.rm(path.join(outDir, name), { recursive: true, force: true })
    }

    // 4. State + report
    if (!dryRun) {
      await writeText(statePath, `${JSON.stringify({ upstream: UPSTREAM_URL, baseCommit: targetSha, syncedAt: new Date().toISOString() }, null, 2)}\n`)
      if (report.length > 0) {
        const lines = ['# Sync conflict report', '', `Upstream \`${baseSha.slice(0, 8)}\` -> \`${targetSha.slice(0, 8)}\`.`, '', 'Conflict blocks were resolved by taking upstream\'s side and re-applying the dsh adaptation rules. Verify each block below.', '']
        for (const item of report) {
          lines.push(`## ${item.skill} / ${item.file}`, '')
          item.blocks.forEach((block, index) => {
            lines.push(`### block ${index + 1}`, '', 'local adaptation (ours):', '', '```', block.ours, '```', '', 'upstream (theirs):', '', '```', block.theirs, '```', '')
          })
        }
        await writeText(reportPath, lines.join('\n'))
      }
    }

    console.log(JSON.stringify({
      skills: summary.skills,
      files: summary.files,
      threeWayMerged: summary.merged,
      conflictedFiles: summary.conflictedFiles,
      conflictBlocks: summary.conflictBlocks,
      newSkills: summary.newSkills,
      removedUpstream: summary.removedSkills,
      adaptedRulesFired: [...summary.rules],
      dryRun,
      report: report.length > 0 ? path.relative(REPO_ROOT, reportPath) : null,
    }, null, 2))
    if (!dryRun) {
      console.log(`\nnext: git tag sync/${targetSha.slice(0, 8)} && git push --tags   # record this sync point`)
    }
  } finally {
    for (const dir of Object.values(worktrees)) {
      run('git', ['-C', cacheDir, 'worktree', 'remove', '--force', dir], { allowFailure: true })
    }
    await fsp.rm(workRoot, { recursive: true, force: true })
  }
}

/** Run the sync only when executed directly, so the rules stay unit-testable. */
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
