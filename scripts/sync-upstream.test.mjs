#!/usr/bin/env node
/**
 * Unit tests for the dsh adaptation rules that sync-upstream.mjs replays.
 *
 *   node --test scripts/
 *
 * The rules are data in sync-upstream.mjs; these tests pin their behaviour
 * against realistic upstream lines. The last block checks idempotence, which is
 * what catches two rules fighting over the same text.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { adapt } from './sync-upstream.mjs'

const applies = (input, expected) => assert.equal(adapt(input).text, expected)

test('model-side skill calls: quoted, backticked, twice, for', () => {
  applies('Call the Skill tool with "grilling".', 'Call the `skill` tool with name `grilling`.')
  applies(
    'calls the Skill tool with `tdd` to build the ticket;',
    'calls the `skill` tool with name `tdd` to build the ticket;',
  )
  applies(
    'Call the Skill tool twice, for "grilling" and "domain-modeling".',
    'Call the `skill` tool twice, with names `grilling` and `domain-modeling`.',
  )
  applies(
    'call the Skill tool for whichever skills the `## Notes` block names',
    'call the `skill` tool for whichever skills the `## Notes` block names',
  )
})

test('subagent spelling and tool naming', () => {
  applies('Spawn 3+ sub-agents in parallel.', 'Spawn 3+ subagents in parallel.')
  applies('use this parallel sub-agent pattern.', 'use this parallel subagent pattern.')
  applies(
    "Then spawn a sub-agent to walk the codebase. Don't follow rigid heuristics;",
    "Then spawn a subagent (the `subagent` tool) to walk the codebase. Don't follow rigid heuristics;",
  )
  applies(
    'Resolved by a subagent that calls the Skill tool with "research".',
    'Resolved by a subagent (`subagent` tool) that calls the `skill` tool with name `research`.',
  )
  applies(
    'spin up a subagent that calls the Skill tool with "prototype"',
    'spin up a subagent (`subagent` tool) that calls the `skill` tool with name `prototype`',
  )
})

test('/clear has no dsh counterpart', () => {
  applies(
    'disposable? If so, **`/clear`**. It is the cheapest move',
    'disposable? If so, start a **new session**. It is the cheapest move',
  )
  applies(
    "`/clear` also isn't terminal: the old session stays resumable.",
    "A new session also isn't terminal: the old session stays resumable.",
  )
  applies(
    '- **`/clear`**: empty the window, when nothing here matters',
    '- **New session**: start from an empty window, when nothing here matters',
  )
  applies(
    '**`/implement`** per ticket, **`/clear`ing context between each one**.',
    '**`/implement`** per ticket, **starting a fresh session between each one**.',
  )
})

test('model-side references lose the slash', () => {
  applies('straight from the `/codebase-design` skill', 'straight from the `codebase-design` skill')
})

test("ask-matt's command catalogue keeps its slashes", () => {
  const line = '- **`/domain-modeling`**: sharpen the domain language.'
  applies(line, '- **`domain-modeling`**: sharpen the domain language.')
  assert.equal(adapt(line, 'ask-matt/SKILL.md').text, line)
})

test('frontmatter dsh cannot parse is dropped', () => {
  applies(
    '---\nname: handoff\nargument-hint: "What will the next session be used for?"\n---\nbody\n',
    '---\nname: handoff\n---\nbody\n',
  )
  applies(
    '---\nname: pr\ndescription: "Use when writing a PR body."\nmetadata:\n  credits:\n    skill: show-me\n    author: Dex Horthy\n---\nbody\n',
    '---\nname: pr\ndescription: "Use when writing a PR body."\n---\nbody\n',
  )
})

test('code-review section 4 keeps the one-message dispatch note', () => {
  applies(
    '**Standards sub-agent prompt** should include:',
    'Issue the two `subagent` tool calls in one message so they run concurrently.\n\n**Standards subagent prompt** — include:',
  )
  applies('**Spec sub-agent prompt** should include:', '**Spec subagent prompt** — include:')
})

test('user-typed slash commands are left alone', () => {
  const text = 'run `/setup-matt-pocock-skills` once, then `/ask-matt`; `/compact` is a real dsh command.'
  assert.equal(adapt(text).text, text)
})

test('/clear in the phase-boundary table becomes a new session', () => {
  applies(
    '| **`/clear`** | Empty the context window and start from nothing.                  |',
    '| **New session** | Start from an empty context window.                  |',
  )
})

test('the harness-swap example names dsh, not Codex', () => {
  applies(
    '- swapping to a **new harness** (Claude → Codex),',
    '- swapping to a **new harness** (e.g. Claude Code → dsh),',
  )
})

test('background agent becomes the named subagent tool', () => {
  applies(
    'Spin up a **background agent** to do the research, so you keep working while it reads.',
    'Spin up a **background subagent** (the `subagent` tool with `run_in_background: true`) to do the research, so you keep working while it reads.',
  )
  // The un-bolded mention in research's description is a routing signal: untouched.
  const description = 'Use when the user wants a topic researched, or legwork delegated to a background agent.'
  assert.equal(adapt(description).text, description)
})

test('model-facing slash instructions become `skill` tool calls', () => {
  applies(
    'Use /tdd where possible, at pre-agreed seams.',
    'Call the `skill` tool with name `tdd` and follow it where possible, at pre-agreed seams.',
  )
  applies(
    'Once done, use /code-review to review the work.',
    'Once done, call the `skill` tool with name `code-review` and review the work.',
  )
})

test('the parallel dispatch names the one-message issue', () => {
  applies(
    'Spawn 3+ sub-agents in parallel. Each must produce a **radically different** interface.',
    'Spawn 3+ subagents in parallel — one `subagent` tool call each, all issued in the same message. Each must produce a **radically different** interface.',
  )
})

test('fact-finding dispatch names the subagent tool', () => {
  applies(
    "dispatch a sub-agent to find it; don't ask the user",
    "dispatch a subagent (the `subagent` tool) to find it; don't ask the user",
  )
})

test('handoff points at the `skill` tool and the user gesture', () => {
  applies(
    'naming which skills the next agent should call the Skill tool for.',
    'naming which skills the next agent should load via the `skill` tool, or ask the user to invoke by name.',
  )
})

test('rules are idempotent', () => {
  const upstream = [
    'Call the Skill tool with "grilling".',
    'Resolved by a subagent that calls the Skill tool with "research".',
    "`/clear` also isn't terminal: the old session stays resumable.",
    'straight from the `/codebase-design` skill',
    '**Spec sub-agent prompt** should include:',
    '| **`/clear`** | Empty the context window and start from nothing. |',
    '- swapping to a **new harness** (Claude → Codex),',
    'Spin up a **background agent** to do the research.',
    'Use /tdd where possible, at pre-agreed seams.',
    'Spawn 3+ subagents in parallel. Each must produce an interface.',
    'dispatch a subagent to find it',
    'naming which skills the next agent should call the `skill` tool for.',
  ].join('\n')
  const once = adapt(upstream).text
  assert.equal(adapt(once).text, once)
})
