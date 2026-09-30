# Provenance and adaptation log

## Upstream

- Repository: https://github.com/mattpocock/skills
- Pinned commit: `d81f3a183412e71a5b1e84ca21bc1a35eea03a60` (2026-09-29)
- Lineage: `skills/` is a **pure function of that commit** — `adapt(upstream @ pin)`, nothing else. Version 0.1.x came second-hand, via [`MynameisKcy/dsh-mattpocock-skills`](https://github.com/MynameisKcy/dsh-mattpocock-skills) 0.1.1 (which adapted upstream `9c9f36cc`, 2026-08-17); that repository is a historical source only and is not an input to any sync.
- Upstream version: v1.2.3 in `.claude-plugin/plugin.json` — upstream ships substantive skill changes without bumping that version, so the **commit**, not the version, is the identity to track.
- Scope: the 27 **promoted** skills — `skills/engineering/` (20) and `skills/productivity/` (7), as listed in upstream `.claude-plugin/plugin.json`. Buckets `misc/`, `in-progress/`, `deprecated/`, and `personal/` are intentionally not migrated. Since the 0.1.x adaptation (`9c9f36cc`), upstream added `implement-spec`, `pr`, and `retro`, and removed `resolving-merge-conflicts`.
- License: MIT, Copyright (c) 2026 Matt Pocock. This repository is a derivative work for DeepSeek Harness (dsh); see [LICENSE](LICENSE).

## Why a separate adaptation exists

The upstream skills target Claude Code. DeepSeek Harness (dsh) is format-compatible (same `<name>/SKILL.md` + YAML frontmatter, `disable-model-invocation` supported) but differs in tool surface and invocation mechanics, so the bodies needed rewriting to behave correctly under dsh.

## Adaptation rules applied

1. **Removed dsh-unrecognized artifacts**: `agents/openai.yaml` (Codex adapter metadata) from every skill; `argument-hint` frontmatter field (`handoff`, `teach`); nested `metadata:` frontmatter — upstream `pr` carries `metadata.credits`, and dsh's loader parses flat `key: value` only, so a nested block makes the skill unloadable. `pr`'s attribution lives in its own `CREDITS.md`.
2. **Model-side skill invocations**: instructions like *"Call the Skill tool with X"* become *"call the `skill` tool with name `X`"*, and model-facing slash instructions the same way — `implement`'s *"Use /tdd"* / *"use /code-review"* become `skill` tool calls, and `handoff`'s suggested-skills sentence either names the `skill` tool or asks the user to invoke the skill. Rationale: in dsh the `/name` gesture fires only on text the **user** types; output the model writes triggers nothing, and model-invocable skills load through the `skill` tool. A model-side reference written as `` `/codebase-design` `` loses the slash for the same reason. `ask-matt` is exempt: its body is a catalogue of the commands the **user** types, and it writes every entry that way, so its slashes stay (`de-slash` skips `ask-matt/SKILL.md`; `verify-skills.mjs` applies the same scoping).
3. **Subagent references**: *"sub-agent / background agent / parallel sub-agents"* become `subagent`, named as the `subagent` tool where spawning is described: `codebase-design`'s *"spawn 3+ subagents in parallel"* adds the one-message dispatch, and `grilling`'s fact-finding dispatch and `research`'s *"background agent"* name the tool (parallel = multiple `subagent` calls in one message; background = `run_in_background: true`).
4. **dsh-inexistent commands**: `/clear` (a Claude Code client command) becomes "start a new session" — in prose and in the phase-boundary table's option row; `/compact` is kept (dsh command).
5. **Harness-swap example**: "Claude → Codex" becomes "Claude Code → dsh".
6. **Kept unchanged**: all 27 skill names (so installing into `~/.dsh/skills` shadows any older copy in `~/.agents/skills` — rank 400 beats rank 500); every `name`/`description`/`disable-model-invocation` frontmatter (natively supported); description trigger words (description is the only routing signal); slash references that describe what the **user** types (valid dsh gesture — `user-invocable` defaults to true for all 27).

`scripts/sync-upstream.mjs` encodes rules 1–5 as data and re-applies them on every sync; rule 6 is what it preserves by construction. Because the pack is regenerated rather than merged, **every rule must fire** on the pinned commit: `--check` names the ones that do not, which is how upstream rewriting adapted prose is caught. A deliberate local change therefore belongs in the rule table (plus a unit test and a row below), never in `skills/` directly.

## Per-skill log

| Skill | Changes |
|---|---|
| ask-matt | `/clear`ing → "starting a fresh session"; the "`/clear`" list option and the phase-boundary table row → "New session"; PHASE-BOUNDARIES.md §2 rewritten for a new session, harness example "Claude → Codex" → "Claude Code → dsh"; the "**background agent**" bullet under `/research` → named `subagent` tool; its command catalogue keeps upstream's slashes |
| code-review | "sub-agent(s)" → "subagent(s)" throughout; §4 names the one-message concurrent dispatch of the two `subagent` calls |
| codebase-design | SKILL.md: "parallel sub-agents" → "parallel subagents"; DESIGN-IT-TWICE.md: "parallel sub-agent(s)" → "subagent(s)", §2 names the `subagent` tool and the one-message parallel issue |
| diagnosing-bugs | none (harness-neutral) |
| domain-modeling | none from the adapter — upstream rewrote `CONTEXT-FORMAT.md` → `GLOSSARY-FORMAT.md` and the description's `CONTEXT.md` → `GLOSSARY.md`; the body follows upstream |
| grill-me | "Call the Skill tool with \"grilling\"" → `skill` tool wording |
| grill-with-docs | same rewrite, two names |
| grilling | "dispatch a sub-agent" → "dispatch a subagent (the `subagent` tool)" |
| handoff | `argument-hint` removed; "suggested skills" wording → `skill` tool / ask-user-to-invoke |
| implement | "Use /tdd" / "use /code-review" (model-facing) → `skill` tool calls |
| implement-spec | new upstream skill: Skill-tool wording (×2), "sub-agent(s)" → "subagent(s)" |
| improve-codebase-architecture | Skill-tool wording (×4); "spawn a sub-agent" → `subagent` tool; "`/codebase-design`" → "`codebase-design`"; HTML-REPORT.md: de-slash |
| pr | new upstream skill: nested `metadata:` frontmatter dropped (rule 1); attribution stays in CREDITS.md |
| prototype | none (`/prototype/<name>` in UI.md is a URL route, not a command) |
| research | "background agent" → "background subagent (`subagent` tool, `run_in_background: true`)" |
| retro | new upstream skill: Skill-tool wording |
| setup-matt-pocock-skills | none — dsh's agent-instructions loads both `AGENTS.md` and `CLAUDE.md`, so the file-selection logic is valid as-is |
| tdd | Skill-tool wording for `codebase-design` |
| teach | `argument-hint` removed |
| to-questionnaire | none |
| to-spec | none ("tell the user to run `/setup-matt-pocock-skills`" is already the correct dsh framing) |
| to-tickets | none |
| triage | Skill-tool wording (grilling + domain-modeling) |
| wait-what | none |
| wayfinder | Skill-tool wording (×6); research tickets name the `subagent` + `skill` tools |
| wizard | none |

Upstream removed `resolving-merge-conflicts` after `9c9f36cc`, so this pack no longer carries it.

## Re-syncing from upstream

```sh
node scripts/sync-upstream.mjs --to <sha|HEAD>   # regenerate skills/ from upstream
node scripts/verify-skills.mjs                   # frontmatter contract + adaptation leftovers
npm test                                         # the rules are data; this pins their behaviour
npm run check:reproducible                       # skills/ is exactly upstream + rules, no stale rule
git diff --stat                                  # review what moved; a pure re-sync is empty
git tag -a sync/<upstream short sha> -m "generated from mattpocock/skills <full sha>"
git push --tags
```

The script shallow-fetches the target commit, reads every promoted skill in
`.claude-plugin/plugin.json`, re-applies the rules above, and writes the result
out — `skills/` is a pure function of upstream, so there is no merge and no
conflict. Upstream rewording that invalidates a rule surfaces instead as a
**stale rule** in `--check`, which is the signal to re-derive that rule (and its
unit test) before landing the sync. `--dry-run` prints the same report without
writing; `--prune` also drops skills upstream removed — without it they are kept
and listed, so a removal stays a deliberate step. Update the pinned commit in
this file after landing a sync.

Tags name the **upstream** commit rather than ours, so `sync/d81f3a1` records
exactly which upstream revision a given pack state was generated from.
`.upstream.json` describes only the current pin; the tags carry the history. If
the fetch through a local proxy setup fails, export `HTTPS_PROXY` for the run
(this host's local proxy is `http://127.0.0.1:2080`) — git on Windows does not
read the system WinINET settings.
