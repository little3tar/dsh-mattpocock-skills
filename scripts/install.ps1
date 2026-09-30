# Install the dsh-mattpocock-skills skill pack into a dsh skill root (Windows PowerShell).
#
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1                 # -> ~\.dsh\skills (rank 400)
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -UserAgents    # -> ~\.agents\skills (rank 500)
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Project <dir> # -> <dir>\.dsh\skills (rank 100)
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Uninstall
#
# dsh discovers new skill directories via its file watcher: no restart is
# needed for new sessions; running sessions refresh on the next step.

[CmdletBinding(DefaultParameterSetName = 'Install')]
param(
  [Parameter(ParameterSetName = 'Install')]
  [switch]$UserAgents,
  [Parameter(ParameterSetName = 'Install')]
  [string]$Project,
  [Parameter(ParameterSetName = 'Install')]
  [string]$Dest,
  [Parameter(ParameterSetName = 'Uninstall')]
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$packRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$skillsDir = Join-Path $packRoot 'skills'

if (-not (Test-Path $skillsDir)) { throw "skills directory not found: $skillsDir" }

if ($Dest) {
  $target = $Dest
} elseif ($Project) {
  $target = Join-Path $Project '.dsh\skills'
} elseif ($UserAgents) {
  $agentsHome = if ($env:DSH_AGENTS_HOME) { $env:DSH_AGENTS_HOME } else { Join-Path $HOME '.agents' }
  $target = Join-Path $agentsHome 'skills'
} else {
  $dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
  $target = Join-Path $dshHome 'skills'
}

$skillNames = Get-ChildItem -Directory $skillsDir | Where-Object { Test-Path (Join-Path $_.FullName 'SKILL.md') }

if ($Uninstall) {
  $removed = 0
  foreach ($skill in $skillNames) {
    $dst = Join-Path $target $skill.Name
    if (Test-Path $dst) {
      Remove-Item -Recurse -Force $dst
      Write-Host "removed  $($skill.Name)"
      $removed++
    }
  }
  Write-Host "uninstalled $removed skill(s) from $target"
  exit 0
}

New-Item -ItemType Directory -Force $target | Out-Null

$installed = 0
foreach ($skill in $skillNames) {
  $dst = Join-Path $target $skill.Name
  if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
  Copy-Item -Recurse (Join-Path $skillsDir $skill.Name) $dst
  Write-Host "installed $($skill.Name)"
  $installed++
}

Write-Host ""
Write-Host "done: $installed skill(s) -> $target"
Write-Host "try it: start a dsh session and type /ask-matt"
