# Provenance and adaptation log

## Upstream

- Repository: https://github.com/mattpocock/skills
- Pinned commit: `d81f3a183412e71a5b1e84ca21bc1a35eea03a60` (2026-09-29)
- Previous pin: `9c9f36ccd3995266cd675468af71639c8dde1ec5` (2026-08-17) — the commit the first adaptation was built from
- Upstream version: v1.2.3 in `.claude-plugin/plugin.json` at both pins — upstream ships substantive skill changes without bumping that version, so the **commit**, not the version, is the identity to track.
- Scope: the 27 **promoted** skills — `skills/engineering/` (20) and `skills/productivity/` (7), as listed in upstream `.claude-plugin/plugin.json`. Buckets `misc/`, `in-progress/`, `deprecated/`, and `personal/` are intentionally not migrated. Since the previous pin, upstream added `implement-spec`, `pr`, and `retro`, and removed `resolving-merge-conflicts`.
- License: MIT, Copyright (c) 2026 Matt Pocock. This repository is a derivative work for DeepSeek Harness (dsh); see [LICENSE](LICENSE).

## Why a separate adaptation exists

The upstream skills target Claude Code. DeepSeek Harness (dsh) is format-compatible (same `<name>/SKILL.md` + YAML frontmatter, `disable-model-invocation` supported) but differs in tool surface and invocation mechanics, so the bodies needed rewriting to behave correctly under dsh.

## Adaptation rules applied

1. **Removed dsh-unrecognized artifacts**: `agents/openai.yaml` (Codex adapter metadata) from every skill; `argument-hint` frontmatter field (`handoff`, `teach`); nested `metadata:` frontmatter — upstream `pr` carries `metadata.credits`, and dsh's loader parses flat `key: value` only, so a nested block makes the skill unloadable. `pr`'s attribution lives in its own `CREDITS.md`.
2. **Model-side skill invocations**: instructions like *"Call the Skill tool with X"* or *"use /tdd"* become *"call the `skill` tool with name `X`"*. Rationale: in dsh the `/name` gesture fires only on text the **user** types; output the model writes triggers nothing, and model-invocable skills load through the `skill` tool. A model-side reference written as `` `/codebase-design` `` loses the slash for the same reason.
3. **Subagent references**: *"sub-agent / background agent / parallel sub-agents"* become `subagent`, named as the `subagent` tool where spawning is described (parallel = multiple `subagent` calls in one message; background = `run_in_background: true`).
4. **dsh-inexistent commands**: `/clear` (a Claude Code client command) becomes "start a new session"; `/compact` is kept (dsh command).
5. **Harness-swap example**: "Claude → Codex" becomes "Claude Code → dsh".
6. **Kept unchanged**: all 27 skill names (so installing into `~/.dsh/skills` shadows any older copy in `~/.agents/skills` — rank 400 beats rank 500); every `name`/`description`/`disable-model-invocation` frontmatter (natively supported); description trigger words (description is the only routing signal); slash references that describe what the **user** types (valid dsh gesture — `user-invocable` defaults to true for all 27).

`scripts/sync-upstream.mjs` encodes rules 1–5 as data and re-applies them on every sync; rule 6 is what it preserves by construction.

## Per-skill log

| Skill | Changes |
|---|---|
| ask-matt | `/clear`ing → "starting a fresh session"; the "`/clear`" list option → "New session"; PHASE-BOUNDARIES.md: table row + §2 rewritten for a new session, harness example "Claude → Codex" → "Claude Code → dsh" |
| code-review | "sub-agent(s)" → "subagent(s)" throughout; §4 names the one-message concurrent dispatch of the two `subagent` calls |
| codebase-design | SKILL.md: "parallel sub-agents" → "parallel subagents"; DESIGN-IT-TWICE.md: "parallel sub-agent pattern" → "parallel-subagent pattern", §2 names the `subagent` tool and the one-message parallel issue |
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

Upstream removed `resolving-merge-conflicts` after the previous pin, so this pack no longer carries it.

## Re-syncing from upstream

```sh
node scripts/sync-upstream.mjs --ours skills --out skills --baseline <pinned sha> --to <sha|HEAD>
npm test                        # the rules are data; this pins their behaviour
node scripts/verify-skills.mjs  # frontmatter contract + adaptation leftovers
git tag -a sync/<upstream short sha> -m "adapted from mattpocock/skills <full sha>"
git push --tags
```

The script shallow-fetches both commits, three-way merges every promoted skill
(`ours` = this pack, `base` = the pinned commit, `theirs` = the target),
re-applies rules 1–5, and writes `.sync-conflicts.md` listing every block it
resolved by taking upstream's side. Review that report, run the checks above,
then update the pinned commit in this file and `.upstream.json`. The script
prints the tag command for the target commit when it finishes. `--prune` also
drops skills upstream removed; without it they are kept and reported, so a
removal stays a deliberate step.

Tags name the **upstream** commit rather than ours, so `sync/d81f3a1` records
exactly which upstream revision a given pack state was adapted from.
`.upstream.json` describes only the current pin; the tags carry the history.
