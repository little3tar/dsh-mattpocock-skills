# dsh-mattpocock-skills

English | [中文](README.zh-CN.md)

[Matt Pocock's engineering skills](https://github.com/mattpocock/skills) — grilling, spec/ticket flows, TDD, code review, domain modelling — adapted for [DeepSeek Harness (dsh)](https://github.com/deepseek-harness). 27 skills, one install, every dsh session.

The bodies were rewritten for dsh's tool surface (`skill`, `subagent`, session commands) rather than Claude Code's; skill names and descriptions stay identical to upstream. See [PROVENANCE.md](PROVENANCE.md) for the pinned upstream commit and the per-skill adaptation log.

## Install

**Prerequisite**: the `dsh` CLI. Either install it globally once and use `dsh …` as written below:

```sh
npm install -g @deepseek-ai/dsh
```

or prefix every command with `npx -y @deepseek-ai/dsh` — no install, but the first run downloads the whole CLI and is slow.

### Option 1 — one command via `dsh plugin` (recommended)

```sh
dsh plugin --profile web add github:little3tar/dsh-mattpocock-skills
# no global dsh installed? same command via npx:
npx -y @deepseek-ai/dsh plugin --profile web add github:little3tar/dsh-mattpocock-skills
```

That is a pnpm install into the profile plus layer activation; verify with `dsh --profile web --dump-config` (a `# == dsh-mattpocock-skills` layer appears), then start a session on that profile.

> **Not published to npm.** Install from git as shown above. The bare name `dsh-mattpocock-skills` resolves to a different, unrelated npm package — do not use it.

The bundle carries its skills inside the package (mounted as a custom skill root at rank 300), so nothing else is needed.

### Option 2 — drop into a skill root (no bundle, every profile)

```sh
git clone https://github.com/little3tar/dsh-mattpocock-skills
cd dsh-mattpocock-skills
bash scripts/install.sh            # macOS / Linux / Git Bash → $DSH_HOME/skills (~/.dsh/skills)
# Windows PowerShell:
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

Flags: `--user-agents` (install to `~/.agents/skills` instead — shared with other Agent-Skills harnesses), `--project <dir>` (this project only, `<dir>/.dsh/skills`), `--uninstall`, `--list`. New sessions pick the skills up immediately — dsh watches its skill roots.

Because the bundle mounts at **rank 300** (a custom skill root) while the user roots are 400/500, a bundle install outranks any directory copy of the same names in `~/.dsh/skills` or `~/.agents/skills`, and project-level roots (100/200) still override both. Installing one channel is still the tidy choice, but unlike the original pack the two no longer tie: the bundle wins.

### Option 3 — just ask your agent

Tell any dsh session:

> Install dsh-mattpocock-skills from GitHub.

The agent reads [AGENTS.md](AGENTS.md) in this repo and completes the install (clone + `scripts/install.sh`, or `dsh plugin add` if you prefer).

### Advanced — mount the clone without copying

Add to `$DSH_HOME/cordis.patch.yml` (the row's config is replaced whole, so restate everything you need):

```yaml
- id: skill-filesystem
  config:
    customSkillDirs: ["<absolute path to this clone>/skills"]
```

Or, for a web-profile preset that carries the skills: copy this repo's `skills/` into your preset directory and give that preset's `skill-filesystem` row `customSkillDirs: [!!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('skills/', baseUrl))"]` — `baseUrl` is the preset's own directory.

## The 27 skills

**Flows (user-invoked — type `/name`)**

| Skill | What it does |
|---|---|
| `ask-matt` | Router: which skill or flow fits your situation |
| `grill-me` / `grill-with-docs` | Relentless interview to sharpen a plan; the docs variant persists to GLOSSARY.md + ADRs |
| `to-spec` / `to-tickets` | Synthesize the conversation into a spec / tracer-bullet tickets with blocking edges |
| `implement` | Build a spec or ticket, driving TDD and ending in code review |
| `implement-spec` | Build a whole spec in one run: tickets as a task graph, implementer subagents across the ready frontier, one integration branch |
| `pr` | Write the PR body (template adapted from Dex Horthy's `show-me` skill) |
| `retro` | Run a retrospective on a coding session and propose environment improvements |
| `triage` | Move issues and external PRs through a triage state machine |
| `wayfinder` | Chart a huge foggy effort as decision tickets on the tracker |
| `improve-codebase-architecture` | Scan for deepening opportunities, HTML report, then grill the pick |
| `handoff` | Compact the conversation into a handoff document |
| `teach` | Multi-session teaching workspace |
| `to-questionnaire` | Turn an unanswerable decision into a questionnaire for someone else |
| `wait-what` | Re-pitch the last message in plain language |
| `setup-matt-pocock-skills` | One-time per-repo setup: issue tracker, triage labels, doc layout — run this first |

**Disciplines (model-invoked — the agent reaches for them, or you can ask by name)**

`grilling`, `tdd`, `code-review`, `domain-modeling`, `codebase-design`, `prototype`, `research`, `diagnosing-bugs`, `wizard`, `writing-for-agents`.

Start with `/ask-matt` after running `/setup-matt-pocock-skills` once in your repo.

> Upstream dropped `resolving-merge-conflicts` after v1.2.3, so it is not part of this pack.

## Development

```sh
npm test                         # unit tests for the adaptation rules
node scripts/verify-skills.mjs   # frontmatter contract + adaptation checks
```

## Syncing from upstream

```sh
node scripts/sync-upstream.mjs --to <sha|HEAD>   # regenerate skills/ from upstream
npm run check:reproducible                       # verify the pack is reproducible
```

The pack is a pure function of upstream: every promoted skill file is read from
the target commit, passed through the adaptation rules, and written out. There is
no merge base and no three-way merge, so a sync cannot conflict. Two gates keep it
honest:

- `node scripts/verify-skills.mjs` — the dsh frontmatter contract, plus Claude
  Code artifacts the adaptation is supposed to have removed.
- `node scripts/sync-upstream.mjs --check` — the committed `skills/` is exactly
  what upstream at the pinned commit plus the rules produce, and every rule still
  fires. It exits non-zero on any drift, missing or extra file or skill, or a rule
  that upstream rewording has made stale.

`--dry-run` prints that same report without writing; `--prune` also deletes skill
directories upstream no longer promotes. The rules themselves live in the script;
[PROVENANCE.md](PROVENANCE.md) explains why each one exists.

## License

MIT — [Matt Pocock](https://github.com/mattpocock/skills) for the original skills; this repository's adaptations under the same license. See [LICENSE](LICENSE).
