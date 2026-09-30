# dsh-mattpocock-skills

[English](README.md) | 中文

[Matt Pocock 的工程技能集](https://github.com/mattpocock/skills)——拷问式访谈（grilling）、spec/工单流、TDD、代码评审、领域建模——面向 [DeepSeek Harness (dsh)](https://github.com/deepseek-harness) 的适配版。27 个技能，一次安装，所有 dsh 会话可用。

技能正文已按 dsh 的工具面（`skill`、`subagent`、会话命令）改写而非照搬 Claude Code；技能名与描述与上游完全一致。上游钉定 commit 与逐技能适配日志见 [PROVENANCE.md](PROVENANCE.md)。

## 安装

**前置条件**：`dsh` CLI。全局装一次，之后按下面写的 `dsh …` 使用：

```sh
npm install -g @deepseek-ai/dsh
```

或者给每条命令加 `npx -y @deepseek-ai/dsh` 前缀——免安装，但首次运行要下载整个 CLI，较慢。

### 方式 1 —— `dsh plugin` 一行命令（推荐）

```sh
dsh plugin --profile web add dsh-mattpocock-skills
# 没装全局 dsh？用 npx 跑同一条命令：
npx -y @deepseek-ai/dsh plugin --profile web add dsh-mattpocock-skills
```

这是向 profile 内做一次 pnpm 安装并激活配置层；用 `dsh --profile web --dump-config` 验证（会出现 `# == dsh-mattpocock-skills` 层），然后在该 profile 上开启会话。npm 与 git 源均可：

```sh
dsh plugin --profile web add github:little3tar/dsh-mattpocock-skills
```

技能随包携带（由插件以 rank 400 注册），无需其他配置。

### 方式 2 —— 投递到技能根目录（不经 bundle，全部 profile 生效）

```sh
git clone https://github.com/little3tar/dsh-mattpocock-skills
cd dsh-mattpocock-skills
bash scripts/install.sh            # macOS / Linux / Git Bash → $DSH_HOME/skills（~/.dsh/skills）
# Windows PowerShell：
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

参数：`--user-agents`（改装到 `~/.agents/skills`，与其他 Agent-Skills harness 共享）、`--project <目录>`（仅该项目，`<目录>/.dsh/skills`）、`--uninstall`、`--list`。新会话即时生效——dsh 监听技能根目录。

rank 400（`~/.dsh/skills`）会遮蔽 `~/.agents/skills`（rank 500）里的同名旧版，所以本适配包优先于任何已装的原版。两种方式选其一；若同时安装，bundle 与目录副本会在同层内打平。

### 方式 3 —— 直接对你的 agent 说

对任意 dsh 会话说：

> 从 GitHub 安装 dsh-mattpocock-skills。

agent 会读本仓库的 [AGENTS.md](AGENTS.md) 并完成安装（clone + `scripts/install.sh`，或按你的偏好走 `dsh plugin add`）。

### 进阶 —— 挂载克隆目录而不复制

向 `$DSH_HOME/cordis.patch.yml` 添加（patch 会整体替换该行 config，需要的字段要一并重述）：

```yaml
- id: skill-filesystem
  config:
    customSkillDirs: ["<本克隆的绝对路径>/skills"]
```

或为 web profile 制作携带技能的 preset：把本仓库 `skills/` 复制进你的 preset 目录，并在该 preset 的 `skill-filesystem` 行配置 `customSkillDirs: [!!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('skills/', baseUrl))"]`——`baseUrl` 即 preset 自身目录。

## 27 个技能

**流程类（用户调用——输入 `/名称`）**

| 技能 | 用途 |
|---|---|
| `ask-matt` | 路由器：当前场景该用哪个技能/流程 |
| `grill-me` / `grill-with-docs` | 拷问式访谈打磨计划；带文档版会沉淀 GLOSSARY.md + ADR |
| `to-spec` / `to-tickets` | 把对话综合成 spec / 带阻塞边的 tracer-bullet 工单 |
| `implement` | 按 spec/工单实现，驱动 TDD，收尾代码评审 |
| `implement-spec` | 一次跑完整个 spec：工单当任务图，实现型 subagent 并行吃 frontier，统一落在集成分支 |
| `pr` | 撰写 PR 正文（模板改编自 Dex Horthy 的 `show-me` 技能） |
| `retro` | 对一次编码会话做复盘，提出环境改进 |
| `triage` | 用状态机处理 issue 与外部 PR |
| `wayfinder` | 把庞大模糊的工作规划成 tracker 上的决策工单地图 |
| `improve-codebase-architecture` | 扫描深化机会、出 HTML 报告、拷问所选项 |
| `handoff` | 把当前会话压缩成交接文档 |
| `teach` | 多会话教学工作区 |
| `to-questionnaire` | 把无法独自回答的决策变成给他人的问卷 |
| `wait-what` | 用平实语言重新解释上一条消息 |
| `setup-matt-pocock-skills` | 每仓库一次的初始化：issue tracker、triage 标签、文档布局——先跑这个 |

**纪律类（模型调用——agent 自行取用，也可点名请求）**

`grilling`、`tdd`、`code-review`、`domain-modeling`、`codebase-design`、`prototype`、`research`、`diagnosing-bugs`、`wizard`、`writing-for-agents`。

在仓库里先跑一次 `/setup-matt-pocock-skills`，之后从 `/ask-matt` 开始。

> 上游在 v1.2.3 之后移除了 `resolving-merge-conflicts`，因此本技能包不再包含它。

## 开发

```sh
npm test                         # 适配规则单元测试
node scripts/verify-skills.mjs   # 校验 frontmatter 契约与适配状态
```

## 从上游同步

```sh
node scripts/sync-upstream.mjs --ours skills --out skills --baseline <sha> --to <sha|HEAD>
```

脚本会浅拉取上游两个提交，对每个 promoted 技能做三路合并（`ours` = 本技能包，`base` = 固定提交，`theirs` = 目标提交），重新套用适配规则，并把每个"取上游一侧"解决的冲突块写进 `.sync-conflicts.md`。审阅该文件后运行 `verify-skills.mjs`。加 `--prune` 会一并删除上游已移除的技能。适配规则本身写在脚本里，每条规则的由来见 [PROVENANCE.md](PROVENANCE.md)。

## 许可证

MIT——原始技能作者 [Matt Pocock](https://github.com/mattpocock/skills)；本仓库的适配改动遵循同一许可证，见 [LICENSE](LICENSE)。
