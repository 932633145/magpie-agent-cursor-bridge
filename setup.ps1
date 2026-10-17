param(
    [string]$Action = "setup"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$Runtime = $env:MAGPIE_BUN
if (-not $Runtime) {
    $Candidates = @(
        "$env:USERPROFILE\Desktop\data\cache\bun\*\magpie-bun.exe",
        "$env:USERPROFILE\.cache\magpie\bun\*\magpie-bun.exe",
        "$env:LOCALAPPDATA\magpie\bun\*\magpie-bun.exe"
    )
    foreach ($Pattern in $Candidates) {
        $Found = Get-Item $Pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($Found) {
            $Runtime = $Found.FullName
            break
        }
    }
}

if (-not $Runtime) {
    $NodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($NodeCmd) {
        $Runtime = $NodeCmd.Source
    }
}

if (-not $Runtime) {
    Write-Error "Cannot find runtime (Node.js or Magpie Bun)."
    exit 1
}

$InstallJs = Join-Path $ScriptDir "install.js"
& $Runtime $InstallJs $Action