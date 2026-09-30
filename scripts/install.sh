#!/usr/bin/env bash
# Install the dsh-mattpocock-skills skill pack into a dsh skill root.
#
# Targets (choose one):
#   (default)          $DSH_HOME/skills (~/.dsh/skills)  — rank 400, dsh-specific,
#                      shadows any older copy in ~/.agents/skills (rank 500)
#   --user-agents      $DSH_AGENTS_HOME/skills (~/.agents/skills) — rank 500,
#                      shared with other Agent-Skills harnesses
#   --project <dir>    <dir>/.dsh/skills — rank 100, this project only
#   --dest <path>      explicit skill root directory
#
# Other flags:
#   --uninstall        remove this pack's skill directories from the target
#   --list             show the skills that would be installed
#   -h | --help        this help
#
# dsh discovers new skill directories via its file watcher: no restart is
# needed for new sessions; running sessions refresh on the next step.

set -euo pipefail

pack_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skills_dir="$pack_root/skills"

target=""
mode="install"

usage() { grep '^#' "$0" | sed 's/^# \{0,1\}//' | tail -n +2; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --user-agents) target="${DSH_AGENTS_HOME:-$HOME/.agents}/skills" ;;
    --project) shift; [ $# -gt 0 ] || { echo "error: --project needs a directory" >&2; exit 1; }
               target="$1/.dsh/skills" ;;
    --dest) shift; [ $# -gt 0 ] || { echo "error: --dest needs a path" >&2; exit 1; }
            target="$1" ;;
    --uninstall) mode="uninstall" ;;
    --list) mode="list" ;;
    -h|--help) usage ;;
    *) echo "error: unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

[ -d "$skills_dir" ] || { echo "error: $skills_dir not found" >&2; exit 1; }

skill_names() {
  local name
  for entry in "$skills_dir"/*/; do
    name="$(basename "$entry")"
    [ -f "$entry/SKILL.md" ] && printf '%s\n' "$name"
  done
}

case "$mode" in
  list)
    skill_names
    exit 0
    ;;
  uninstall)
    : "${target:=${DSH_HOME:-$HOME/.dsh}/skills}"
    removed=0
    for name in $(skill_names); do
      if [ -d "$target/$name" ]; then
        rm -rf "$target/$name"
        echo "removed  $name"
        removed=$((removed + 1))
      fi
    done
    echo "uninstalled $removed skill(s) from $target"
    exit 0
    ;;
esac

: "${target:=${DSH_HOME:-$HOME/.dsh}/skills}"
mkdir -p "$target"

installed=0
for name in $(skill_names); do
  rm -rf "$target/$name"
  cp -r "$skills_dir/$name" "$target/$name"
  echo "installed $name"
  installed=$((installed + 1))
done

echo ""
echo "done: $installed skill(s) -> $target"
echo "try it: start a dsh session and type /ask-matt"
