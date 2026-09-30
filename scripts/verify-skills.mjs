#!/usr/bin/env node
/**
 * Validate the packaged skills/: the frontmatter contract dsh requires, and the
 * absence of Claude Code artifacts the adaptation is supposed to have removed.
 *
 *   node scripts/verify-skills.mjs [--skills <dir>]
 *
 * Exits non-zero when any check fails, so it can gate a release.
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Upstream artifacts that must not survive into the dsh pack. */
const LEFTOVERS = [
  { label: 'Claude Code "Skill tool" call', pattern: /Skill tool/ },
  { label: 'hyphenated "sub-agent" spelling', pattern: /sub-agents?/ },
  { label: '`argument-hint` frontmatter (Codex adapter field)', pattern: /^argument-hint:/m },
  { label: '`/clear` command (no dsh counterpart)', pattern: /`\/clear`/ },
  // ask-matt is a catalogue of the commands the *user* types, so its slashes stay.
  {
    label: 'slash-prefixed model-side skill reference',
    pattern: /`\/(codebase-design|grilling|domain-modeling)`/,
    skipFiles: ['ask-matt/SKILL.md'],
  },
  { label: 'model-facing slash instruction (use the `skill` tool)', pattern: /[Uu]se \/(tdd|code-review)\b/ },
  { label: 'unnormalised "background agent" (use "background subagent")', pattern: /\*\*background agent\*\*/ },
  { label: 'harness-swap example still names Claude/Codex', pattern: /Claude → Codex/ },
]
/** Paths inside a skill that belong to another harness. */
const FORBIDDEN_PATHS = ['agents/openai.yaml']

const normalize = (text) => text.replace(/\r\n/g, '\n')

async function listFiles(dir) {
  const found = []
  async function walk(current) {
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(absolute)
      else found.push(path.relative(dir, absolute).split(path.sep).join('/'))
    }
  }
  await walk(dir)
  return found.sort()
}

/** Flat `key: value` frontmatter, the subset dsh's skill loader accepts. */
function parseFrontmatter(raw, label) {
  const lines = normalize(raw).split('\n')
  if (lines[0] !== '---') throw new Error(`${label}: no frontmatter block`)
  const fields = {}
  let index = 1
  for (; index < lines.length && lines[index] !== '---'; index++) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[index])
    if (match === null) throw new Error(`${label}: unparseable frontmatter line "${lines[index]}"`)
    fields[match[1]] = match[2].replace(/^["']|["']$/g, '').trim()
  }
  if (index >= lines.length) throw new Error(`${label}: frontmatter is not closed`)
  return fields
}

async function main() {
  const skillsArg = process.argv.indexOf('--skills')
  const skillsDir = path.resolve(skillsArg === -1 ? path.join(REPO_ROOT, 'skills') : process.argv[skillsArg + 1])
  const problems = []
  const names = []
  let fileCount = 0

  const entries = (await fsp.readdir(skillsDir, { withFileTypes: true })).filter((entry) => entry.isDirectory())
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = entry.name
    names.push(name)
    const dir = path.join(skillsDir, name)
    const skillPath = path.join(dir, 'SKILL.md')

    if (!fs.existsSync(skillPath)) {
      problems.push(`${name}: SKILL.md is missing`)
      continue
    }
    let fields
    try {
      fields = parseFrontmatter(await fsp.readFile(skillPath, 'utf8'), `${name}/SKILL.md`)
    } catch (error) {
      problems.push(error.message)
      continue
    }
    if (fields.name !== name) problems.push(`${name}: frontmatter name "${fields.name}" != directory name`)
    if (!fields.description) problems.push(`${name}: frontmatter has no description (the only routing signal)`)
    for (const key of Object.keys(fields)) {
      if (!['name', 'description', 'disable-model-invocation', 'user-invocable'].includes(key)) {
        problems.push(`${name}: unsupported frontmatter field "${key}"`)
      }
    }

    for (const rel of await listFiles(dir)) {
      fileCount++
      if (FORBIDDEN_PATHS.includes(rel)) problems.push(`${name}/${rel}: harness-specific file must not ship`)
      const text = normalize(await fsp.readFile(path.join(dir, rel), 'utf8'))
      for (const check of LEFTOVERS) {
        if (check.skipFiles?.includes(`${name}/${rel}`)) continue
        const line = text.split('\n').findIndex((candidate) => check.pattern.test(candidate))
        if (line !== -1) problems.push(`${name}/${rel}:${line + 1}: ${check.label}`)
      }
    }
  }

  if (problems.length > 0) {
    console.error(`verify-skills: ${problems.length} problem(s)`)
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exitCode = 1
    return
  }
  console.log(`verify-skills: ok — ${names.length} skills, ${fileCount} files, frontmatter and adaptation checks passed`)
}

await main()
