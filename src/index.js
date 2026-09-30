/**
 * dsh-mattpocock-skills plugin: registers a skill provider that serves the
 * packaged skills/ directory into the dsh skill registry (rank 400, source
 * "bundled"), so the pack rides with any profile that installs this bundle.
 *
 * The provider scans skills/ on every list() call; the registry caches
 * snapshots, keeping live edits cheap. Frontmatter here is the flat subset
 * dsh-skill-filesystem accepts (name, description, disable-model-invocation,
 * user-invocable); scripts/lint-skills.mjs enforces it at the source.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROVIDER_NAME = 'mattpocock-skills'
const SKILLS_PATH = fileURLToPath(new URL('../skills/', import.meta.url))
/** Matches user-dsh roots: shadows ~/.agents/skills (rank 500), yields to project roots. */
const RANK = 400

/**
 * Parse a flat `key: value` YAML frontmatter block.
 * @param {string} raw - the SKILL.md text
 * @returns {{ fields: Record<string, string>, body: string } | undefined}
 */
function parseFrontmatter(raw) {
  const lines = raw.split(/\r?\n/)
  if (lines[0] !== '---') return undefined
  const fields = {}
  let i = 1
  for (; i < lines.length && lines[i] !== '---'; i++) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i])
    if (match === null) throw new Error(`unparseable frontmatter line: "${lines[i]}"`)
    fields[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  if (i >= lines.length) throw new Error('frontmatter not closed')
  return { fields, body: lines.slice(i + 1).join('\n').trim() }
}

/**
 * Read one skill directory into a candidate + body pair.
 * @param {string} dir - absolute skill directory
 * @param {string} name - directory name
 * @returns {Promise<{name: string, description: string, invocation: {modelInvocable: boolean, userInvocable: boolean}, resourceBase: {kind: 'directory', path: string}, skillPath: string, body: string}>}
 */
async function loadSkill(dir, name) {
  const skillPath = join(dir, 'SKILL.md')
  const parsed = parseFrontmatter(await readFile(skillPath, 'utf8'))
  if (parsed === undefined) throw new Error(`${skillPath} has no frontmatter`)
  const { fields, body } = parsed
  if (fields.name !== name) throw new Error(`${skillPath} name "${fields.name}" != directory "${name}"`)
  return {
    name,
    description: fields.description,
    invocation: {
      modelInvocable: fields['disable-model-invocation'] !== 'true',
      userInvocable: fields['user-invocable'] !== 'false',
    },
    resourceBase: { kind: 'directory', path: dir },
    skillPath,
    body,
  }
}

/**
 * Create the provider bound to a logger for malformed-skill warnings.
 * @param {object} ctx - plugin context (Cordis Context; loosely typed in plain JS)
 * @returns {{name: string, list: Function, get: Function}} the skill provider
 */
function createProvider(ctx) {
  async function scan() {
    const entries = await readdir(SKILLS_PATH, { withFileTypes: true })
    const skills = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        skills.push(await loadSkill(join(SKILLS_PATH, entry.name), entry.name))
      } catch (error) {
        ctx.logger.warn(`skill "${entry.name}" ignored: ${error.message}`)
      }
    }
    return skills
  }
  return {
    name: PROVIDER_NAME,
    async list() {
      return (await scan()).map(skill => ({
        name: skill.name,
        description: skill.description,
        invocation: skill.invocation,
        provider: PROVIDER_NAME,
        source: 'bundled',
        resourceBase: skill.resourceBase,
        rank: RANK,
        locator: skill.skillPath,
      }))
    },
    async get(candidate) {
      const skills = await scan()
      const skill = skills.find(entry => entry.name === candidate.name)
      if (skill === undefined) throw new Error(`skill "${candidate.name}" is no longer packaged`)
      return {
        name: skill.name,
        description: skill.description,
        invocation: skill.invocation,
        provider: PROVIDER_NAME,
        source: 'bundled',
        resourceBase: skill.resourceBase,
        content: skill.body,
      }
    },
  }
}

/** Cordis plugin name. */
export const name = 'mattpocock-skills'
/** Service required by the packaged skill provider. */
export const inject = ['skills']

/** Register the packaged skill provider on `ctx.skills`. */
export function apply(ctx) {
  ctx.skills.registerProvider(() => createProvider(ctx))
}
