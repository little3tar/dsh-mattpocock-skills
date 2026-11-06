# Provenance and adaptation log

## Upstream

- Repository: https://github.com/mattpocock/skills
- Pinned commit: `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` (2026-11-04)
- Lineage: `skills/` is a **pure function of that commit** — `adapt(upstream @ pin)`, nothing else. Version 0.1.x came second-hand, via [`MynameisKcy/dsh-mattpocock-skills`](https://github.com/MynameisKcy/dsh-mattpocock-skills) 0.1.1 (which adapted upstream `9c9f36cc`, 2026-08-17); that repository is a historical source only and is not an input to any sync.
- Upstream version: v1.3.2 in `.claude-plugin/plugin.json`. Upstream ships substantive skill changes without bumping that file between pins, so the **commit**, not the version, is the identity to track: the release line moved to v1.3.2 between the last pin and this one, while the skills themselves changed independently of it.
- Scope: the 27 **promoted** skills — `skills/engineering/` (20) and `skills/productivity/` (7), as listed in upstream `.claude-plugin/plugin.json`. Buckets `misc/`, `in-progress/`, `deprecated/`, and `personal/` are intentionally not migrated. Since the 0.1.x adaptation (`9c9f36cc`), upstream added `implement-spec`, `pr`, and `retro`, and removed `resolving-merge-conflicts`.
- License: MIT, Copyright (c) 2026 Matt Pocock. This repository is a derivative work for DeepSeek Harness (dsh); see [LICENSE](LICENSE).

## Why a separate adaptation exists

The upstream skills target Claude Code. DeepSeek Harness (dsh) is format-compatible (same `<name>/SKILL.md` + YAML frontmatter, `disable-model-invocation` supported) but differs in tool surface and invocation mechanics, so the bodies needed rewriting to behave correctly under dsh.

## Adaptation rules applied

1. **Frontmatter**: fields dsh does not act on are dropped — `agents/openai.yaml` (Codex adapter metadata) from every skill, and `argument-hint` (`handoff`, `teach`). dsh's loader reads only `name`, `description`, `whenToUse`, `metadata`, `disable-model-invocation` and `user-invocable`; it **rejects** exactly three legacy camelCase aliases (`disableModelInvocation`, `modelInvocable`, `userInvocable` — a rejection drops the whole skill, `dsh-skill-filesystem/lib/index.js:850-862`) and silently ignores every other unknown key, so `argument-hint` is dead weight rather than a load error. `metadata` and `whenToUse` are **supported** (`optionalMetadata` accepts any non-array object), so upstream `pr`'s `metadata.credits` is kept alongside its `CREDITS.md`; an earlier revision dropped that block on the false premise that dsh parsed flat `key: value` only.
2. **Model-side skill invocations**: instructions like *"Call the Skill tool with X"* become *"call the `skill` tool with name `X`"*, and model-facing slash instructions the same way — `handoff`'s suggested-skills sentence either names the `skill` tool or asks the user to invoke the skill. Rationale: in dsh the `/name` gesture fires only on text the **user** types; output the model writes triggers nothing, and model-invocable skills load through the `skill` tool. A model-side reference written as `` `/codebase-design` `` loses the slash for the same reason; the alternation covers `codebase-design`, `grilling`, `domain-modeling`, `grill-with-docs` and `improve-codebase-architecture`, so a sentence naming several siblings ends up uniform rather than de-slashing whichever name happened to be listed first. `ask-matt` is exempt: its body is a catalogue of the commands the **user** types, and it writes every entry that way, so its slashes stay (`de-slash` skips `ask-matt/SKILL.md`; `verify-skills.mjs` applies the same scoping). Upstream has since adopted the harness-neutral *"Call the Skill tool with X"* form itself (upstream `e48341a`, in `implement`), so the two `implement`-specific slash rules retired at the `49dd158` pin and the generic Skill-tool rule carries that skill now.
3. **Subagent references**: *"sub-agent / background agent / parallel sub-agents"* become `subagent`, named as the `subagent` tool where spawning is described: `codebase-design`'s *"spawn 3+ subagents in parallel"* adds the one-message dispatch, and `grilling`'s fact-finding dispatch and `research`'s *"background agent"* name the tool. `research`'s **description** carries the same idiom un-bolded and is normalized too (the phrase only, so the routing trigger words stay); `verify-skills.mjs` now fails on any surviving `background agent`. Two dsh facts behind the mechanisms: parallel means multiple `subagent` calls in **one message** (the agent loop pools them), and background is the *default* in the web profile's preset (`backgroundMode: continuable`), so `run_in_background: true` is explicit-but-redundant there — foreground would need `false`. Upstream `4ae2317` starts each delegation with *"a fresh context window"*; dsh has both `subagent` (new context) and `subagent_fork` (inherits this conversation), so those sentences gain *"`subagent`, not `subagent_fork`, which inherits this conversation"* (7 skills).
4. **dsh-inexistent commands**: `/clear` (a Claude Code client command) becomes "start a new session" — in prose and in the phase-boundary table's option row; `/compact` is kept (dsh command).
5. **Harness-swap example**: "Claude → Codex" becomes "Claude Code → dsh".
6. **Skill naming**: every promoted skill is written as `dsh-<upstream-name>` — the directory and the frontmatter `name` — and every reference to it is renamed to match: backticked `skill`-tool names, backticked `` `/name` `` gestures, and plain `/name` after whitespace or a bracket (`namespace()` in the script, run after the text rules). Rationale: dsh merges skills from different roots by name, and a machine may also carry the official pack; the prefix keeps the two distinguishable in the skill list, on disk and in the user's `/` gestures. Values that merely look like a skill name are masked first (`NAMESPACE_PROTECT`): the ticket-type labels `research`/`prototype`/`grilling`/`task`, the literal word `prototype`, and GitLab's `` `mr` in place of `pr` ``. The rename is idempotent (`dsh-` names are not in the promoted set), and `verify-skills.mjs` fails a directory without the prefix.
7. **Kept unchanged**: every `description` / `disable-model-invocation` / `metadata` frontmatter value (all natively supported); description trigger words (description is the only routing signal); slash references that describe what the **user** types (valid dsh gesture — `user-invocable` defaults to true for all 27), with the prefix applied to the gesture itself rather than dropping it.

`scripts/sync-upstream.mjs` encodes rules 1–6 as data (the naming step runs last, over the text the earlier rules produced) and re-applies them on every sync; rule 7 is what it preserves by construction. Because the pack is regenerated rather than merged, **every rule must fire** on the pinned commit: `--check` names the ones that do not, which is how upstream rewriting adapted prose is caught. A deliberate local change therefore belongs in the rule table (plus a unit test and a row below), never in `skills/` directly.

## Per-skill log

| Skill | Changes |
|---|---|
| ask-matt | `/clear`ing → "starting a fresh session"; the "`/clear`" list option and the phase-boundary table row → "New session"; PHASE-BOUNDARIES.md §2 rewritten for a new session, harness example "Claude → Codex" → "Claude Code → dsh"; the "**background agent**" bullet under `/research` → named `subagent` tool; its command catalogue keeps upstream's slashes. The `/diagnosing-bugs` on-ramp follows upstream v1.3.1: the stale post-mortem hand-off to `/improve-codebase-architecture` is gone, replaced by "run `/retro` once the fix is in". The catalogue's slashes still stay — both entries are gestures the **user** types, and `retro` is user-invoked, so no model-side invocation is implied |
| code-review | "sub-agent(s)" → "subagent(s)" throughout; §4's dispatch is stated in dsh terms. At `4ae2317` the "start every subagent with a fresh context window" sentence gains the `subagent`/`subagent_fork` note. Upstream's *"issue both calls together, in the foreground"* is **replaced**, not annotated: dsh's `subagent` backgrounds by default, so "foreground" names an action dsh has no equivalent for, and the dsh mechanism is the one-message dispatch. One sentence now carries both the dispatch and the aggregation |
| codebase-design | SKILL.md: "parallel sub-agents" → "parallel subagents"; DESIGN-IT-TWICE.md: "parallel sub-agent(s)" → "subagent(s)", §2 names the `subagent` tool and the one-message parallel issue. At `4ae2317` the dispatch adds "each with a fresh context window"; the rule keeps the one-message phrasing and adds "each starting with a fresh context window" |
| diagnosing-bugs | none (harness-neutral) — the forced-mutation proof at `49dd158` follows upstream |
| domain-modeling | none from the adapter — upstream rewrote `CONTEXT-FORMAT.md` → `GLOSSARY-FORMAT.md` and the description's `CONTEXT.md` → `GLOSSARY.md`; the body follows upstream |
| grill-me | "Call the Skill tool with \"grilling\"" → `skill` tool wording |
| grill-with-docs | same rewrite, two names |
| grilling | "dispatch a sub-agent" → "dispatch a subagent (the `subagent` tool)"; the "yes accepts the recommendation" question rule at `49dd158` follows upstream. At `4ae2317` the fact-finding dispatch adds "with a fresh context window" |
| handoff | `argument-hint` removed; "suggested skills" wording → `skill` tool / ask-user-to-invoke; the OS temp-dir resolution order at `49dd158` follows upstream |
| implement | the two slash rules ("Use /tdd", "use /code-review") retired at `49dd158`: upstream `e48341a` rewrote both as "Call the Skill tool with …", which the generic Skill-tool rule converts. Upstream also added the ticket-reference fetch step, which needs no adaptation |
| implement-spec | new upstream skill: Skill-tool wording (×2), "sub-agent(s)" → "subagent(s)". At `4ae2317` upstream reworked the ticket loop (a fresh implementer subagent per ticket, one worktree/branch each); harness-neutral, no new rule |
| improve-codebase-architecture | Skill-tool wording (×4); "spawn a sub-agent" → `subagent` tool; "`/codebase-design`" → "`codebase-design`"; HTML-REPORT.md: de-slash. At `4ae2317` upstream added "start every subagent with a fresh context window", which gains the `subagent`/`subagent_fork` note |
| pr | new upstream skill: none — its `metadata.credits` and `CREDITS.md` are both kept (dsh supports `metadata`) |
| prototype | none (`/prototype/<name>` in UI.md is a URL route, not a command) |
| research | "background agent" → "background subagent (`subagent` tool, `run_in_background: true`)" in the body, and the same idiom in the description is normalized to `background subagent` (the phrase only — the routing trigger words around it are untouched). At `4ae2317` "Start it with a fresh context window." gains the `subagent`/`subagent_fork` note |
| retro | new upstream skill: Skill-tool wording |
| setup-matt-pocock-skills | none — dsh's agent-instructions loads both `AGENTS.md` and `CLAUDE.md`, so the file-selection logic is valid as-is. At `49dd158` upstream added the label-creation step and reworked the tracker commands (`gh` sub-issues, `glab -O json`, external-PR listing via the REST endpoint); at `4ae2317` it added the legacy `CONTEXT.md`→`GLOSSARY.md` migration and the reachable-repo precondition. All follow upstream — none is dsh-specific |
| tdd | Skill-tool wording for `codebase-design`; the per-seam catches/misses note at `49dd158` follows upstream |
| teach | `argument-hint` removed; the workspace-path anchoring and quiz answer-position rules at `49dd158` follow upstream |
| to-questionnaire | none |
| to-spec | none ("tell the user to run `/setup-matt-pocock-skills`" is already the correct dsh framing) |
| to-tickets | none — the sub-issue and Blocked-by omissions at `49dd158` follow upstream |
| triage | Skill-tool wording (grilling + domain-modeling) |
| wait-what | none |
| wayfinder | Skill-tool wording (×6); research tickets name the `subagent` + `skill` tools. At `49dd158` upstream added the no-triage-labels rule, real cross-reference ids, and the no-PR research-branch rule. At `4ae2317` the research-subagent step adds "with a fresh context window"; the tool is already named, so the fork note would be redundant and is not applied |
| wizard | none — at `49dd158` upstream rewrote `template.sh` (readline handling, `.env` quoting, symlinks, EOF and opener warnings, `_clear` fallback); the script is harness-neutral |

Upstream removed `resolving-merge-conflicts` after `9c9f36cc`, so this pack no longer carries it.

## Installation channels, rank, and layers

Rank constants live in `@deepseek-ai/dsh-skill-filesystem` (and `dsh-skill`): project roots 100/200, a *custom* root 300, user roots 400/500, bundled 600, plus `RUNTIME_RANK` 250. Lower wins, but **only within a layer**.

The skill registry is host+per-scope layered, and layers merge **last-wins**: `dsh-skill`'s `collectFresh` walks `[global, ...chainLayers(scope)]` and lets each layer's entries overwrite the previous (`dsh-skill/lib/index.js:298-311`), while `collectLayer` applies rank ordering only inside one layer (`:312-314`, `:519-521`). dsh documents the shape itself at `dsh-web-app/cordis.patch.yml:475-482`: deployment-level providers — repository plugins, a host `skill-filesystem` row — register into the **global** layer, a preset's `skill-filesystem` into **that preset's layer**, and the agent reads whichever the scope chain selects.

Consequence, and the reason this section exists: in the web profile the host `skill-filesystem` row is **disabled** (`dsh-web-app/cordis.patch.yml:484-485`) and a preset mounts its own with default roots enabled (`dsh-web-app/presets/cordis.patch.yml:143-147`), so `~/.dsh/skills` is collected *in the preset layer*. This pack's bundle registers into the global layer. The preset layer is nearer, so it overwrites the global one **whatever the ranks** — a same-named directory copy under `~/.dsh/skills` (400) **beats** this bundle (300). Installing the bundle therefore does not shadow a directory copy; that copy must be removed, or the pack deployed by directory copy alone. Rank 300 is also the *shared* custom rank (the preset uses a custom root too), so ties fall to provider registration order rather than never occurring. Earlier revisions of `AGENTS.md`, `README.md` and `cordis.patch.yml` claimed the opposite ("300 outranks 400/500", "no other layer uses 300"); both claims were wrong for this composition and were corrected on 2026-10-12.

## Re-syncing from upstream

```sh
node scripts/sync-upstream.mjs --to <sha|HEAD>   # regenerate skills/ from upstream
node scripts/verify-skills.mjs                   # frontmatter contract + adaptation leftovers
npm test                                         # the rules are data; this pins their behaviour
npm run check:reproducible                       # skills/ is exactly upstream + rules, no stale rule
git diff --stat                                  # review what moved; a pure re-sync is empty
git tag -a sync/<upstream short sha> -m "generated from mattpocock/skills <full sha>"
git push origin main refs/tags/sync/<short>      # push explicitly; --tags would push upstream's tags too
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

Tags name the **upstream** commit rather than ours, so a `sync/*` tag records
exactly which upstream revision a pack state was generated from.
`.upstream.json` describes only the current pin; the tags carry the history. If
the fetch through a local proxy setup fails, export `HTTPS_PROXY` for the run
(this host's local proxy is `http://127.0.0.1:2080`) — git on Windows does not
read the system WinINET settings.

### Tags

- `vX.Y.Z` — a release of this pack: the state of `skills/` we hand out. Bump `version`
  in `package.json` and tag the same commit; CI fails a `v*` tag whose name disagrees
  with `package.json`.
- `sync/<upstream short sha>` — **a sync point, not the newest pack for that pin**. The
  name records the upstream commit; the tagged commit is where that sync landed. Because
  the pack is `upstream + rules`, a later rule fix gives the same pin a newer pack:
  `sync/d81f3a1` (`518cb95`) predates the first audit's three content corrections (4 files,
  +14/−8), so checking it out yields the pre-audit adaptation. `git describe --tags
  --match 'sync/*'` places a commit relative to the last sync; the current pack is `main`
  or the newest `v*`.
