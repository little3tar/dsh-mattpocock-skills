# AGENTS.md

This repository is `dsh-mattpocock-skills`: a dsh (DeepSeek Harness) skill pack adapted from mattpocock/skills. You are likely reading it because a user asked you to install it.

## How to install this pack (for agents)

The user's dsh version determines nothing about these steps — all channels work on any dsh with the standard base composition. Ask the user which they prefer only if installation fails; otherwise pick by context:

1. **Preferred — `dsh plugin` (bundle channel, per-profile):**

   ```sh
   dsh plugin --profile <name> add github:little3tar/dsh-mattpocock-skills
   ```

   This pack is **not published to npm**: always install it from git, as above. The bare name `dsh-mattpocock-skills` resolves to a different, unrelated npm package.

   If `dsh` is not a global command, run the same through the CLI package: `npx -y @deepseek-ai/dsh plugin --profile <name> add github:little3tar/dsh-mattpocock-skills` (first run downloads the CLI; or install it once with `npm install -g @deepseek-ai/dsh`).

   Verify with `dsh --profile <name> --dump-config` — a `# == dsh-mattpocock-skills` layer must appear.

2. **Fallback — directory drop (all profiles, no CLI needed):** from this repository's root:

   - POSIX / Git Bash: `bash scripts/install.sh`
   - Windows PowerShell: `powershell -ExecutionPolicy Bypass -File scripts\install.ps1`
   - Other targets: `--user-agents` → `~/.agents/skills`; `--project <dir>` → `<dir>/.dsh/skills`; `--uninstall` removes the pack.

If this clone is the user's own checkout, install from the local path: `dsh plugin --profile <name> add <absolute path of this repo>`.

After installing either way, tell the user: new sessions pick the skills up automatically; to start, run `/setup-matt-pocock-skills` once in the target repo, then `/ask-matt`.

**Ranks.** The bundle mounts the built-in filesystem provider over `skills/` as a *custom* root (rank 300), so it outranks the user-level roots (`~/.dsh/skills` 400, `~/.agents/skills` 500) and yields to project roots (100/200). No other layer uses 300, so a bundle install never ties with a directory copy of the same names — installing both is redundant rather than ambiguous.

## Repository layout

- `skills/` — the 27 adapted skills (`<name>/SKILL.md`, dsh format)
- `cordis.patch.yml` + `package.json` — the dsh bundle: it mounts a second instance of the built-in filesystem skill provider over `skills/` as a *custom* root (rank 300). This package ships no plugin code of its own.
- `scripts/install.sh`, `scripts/install.ps1` — directory-drop installers
- `scripts/verify-skills.mjs` — frontmatter contract and adaptation checks; run before committing
- `scripts/sync-upstream.mjs` — regenerate `skills/` from upstream (upstream + adaptation rules, no merge), or `--check` the pack against its pin; see PROVENANCE.md
- `scripts/sync-upstream.test.mjs` — unit tests for those rules (`npm test`); extend them whenever you add or change a rule
- `.github/workflows/checks.yml` — CI: `npm test`, `verify-skills.mjs`, and `sync-upstream.mjs --check` on every push
- `PROVENANCE.md` — pinned upstream commit and the adaptation rules; read it before editing skill bodies
- `README.md` / `README.zh-CN.md` — install and usage documentation

## Conventions when editing skills

- Frontmatter stays within what dsh's loader actually reads: `name` and `description` (required), plus `whenToUse`, `metadata`, `disable-model-invocation`, `user-invocable`. Unknown keys are ignored by the loader, so a field like `argument-hint` is dropped as dead weight; `agents/openai.yaml` never ships; upstream `pr`'s nested `metadata:` is kept as-is.
- Model-facing instructions load other skills via the `skill` tool ("call the `skill` tool with name `x`"); `/name` slash syntax is reserved for text the user types (a valid dsh gesture for every skill here).
- Subagents are spawned with the `subagent` tool; parallel means several calls in one message, background means `run_in_background: true`.
- `/compact` is a real dsh command; there is no `/clear` — write "start a new session" instead.
- Keep all 27 skill names identical to upstream (shadowing and re-sync depend on it). Run `npm test` and `node scripts/verify-skills.mjs` before committing.
- A deliberate change to a skill body belongs in the adaptation-rule table in `scripts/sync-upstream.mjs` (with a unit test and a PROVENANCE entry): `skills/` is regenerated from upstream, so a hand edit there is overwritten by the next sync.

## Re-syncing from upstream

```sh
node scripts/sync-upstream.mjs --to HEAD    # regenerate skills/ from upstream
node scripts/verify-skills.mjs              # frontmatter contract + adaptation leftovers
npm test                                    # the rules are data; this pins their behaviour
npm run check:reproducible                  # skills/ is exactly upstream + rules, no stale rule
git diff --stat                             # review; a pure re-sync shows only what upstream changed
```

`skills/` is a pure function of upstream: the script reads every promoted skill at the target commit, re-applies the adaptation rules, and writes it out — there is no merge base, so a sync cannot conflict. `--check` re-derives the pack from the pinned commit in `.upstream.json` and fails on any drift, missing or extra file or skill, or rule that no longer fires (upstream rewording is the usual cause). `--dry-run` reports without writing; `--prune` also drops skills upstream removed — without it they are kept and listed.
