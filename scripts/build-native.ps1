param([switch]$TestOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$build = Join-Path ([IO.Path]::GetTempPath()) ('cursor-bridge-build-' + [guid]::NewGuid())
$source = Join-Path $build 'source'
$oldTarget = $env:CARGO_TARGET_DIR
try {
    New-Item -ItemType Directory -Path $build | Out-Null
    git clone --quiet --branch v1.0.1 --depth 1 git@github.com:leookun/cursor-byok.git $source
    if ($LASTEXITCODE) { throw 'Native source clone failed' }
    if ((git -C $source rev-parse HEAD) -ne '2068ab20513288e6a0289d33febe872a30608610') { throw 'Unexpected native source revision' }
    git -C $source apply --check (Join-Path $root 'source.patch')
    if ($LASTEXITCODE) { throw 'Native patch check failed' }
    git -C $source apply (Join-Path $root 'source.patch')
    if ($LASTEXITCODE) { throw 'Native patch failed' }
    $env:CARGO_TARGET_DIR = Join-Path $build 'target'
    if (-not $env:CARGO_BUILD_JOBS) { $env:CARGO_BUILD_JOBS = '2' }
    # Run the new behavioral tests against the old implementation first.
    $changed = @('server/src/cursor/tools/codec/response.rs', 'server/src/cursor/tools/tool_call_result/exec/output.rs')
    $saved = @{}
    foreach ($file in $changed) { $saved[$file] = [IO.File]::ReadAllBytes((Join-Path $source $file)) }
    git -C $source restore --source=HEAD --worktree -- $changed
    if ($LASTEXITCODE) { throw 'Cannot prepare pre-fix regression' }
    try {
        $red = & cargo test --manifest-path "$source/Cargo.toml" --locked -p cursor-server --test shell_output -- --test-threads=1 2>&1
        $redExit = $LASTEXITCODE
        $red | ForEach-Object { Write-Output "$_" }
        if (-not $redExit -or ($red -join "`n") -notmatch 'test result: FAILED') { throw 'Regression did not fail behaviorally on old code' }
    } finally {
        foreach ($file in $changed) { [IO.File]::WriteAllBytes((Join-Path $source $file), $saved[$file]) }
    }
    cargo test --manifest-path "$source/Cargo.toml" --locked -p cursor-server --lib --bin cursor-magpie-bridge --test bridge_bidi_wire --test bridge_route --test shell_output --test tool_round --test commit_message --test error_lifecycle -- --test-threads=1
    if ($LASTEXITCODE) { throw 'Native regression tests failed' }
    if ($TestOnly) { return }
    cargo build --manifest-path "$source/Cargo.toml" --release --locked -p cursor-server --bin cursor-magpie-bridge
    if ($LASTEXITCODE) { throw 'Native build failed' }
    $binary = Join-Path $env:CARGO_TARGET_DIR 'release/cursor-magpie-bridge.exe'
    $integrityPath = Join-Path $root 'integrity.json'
    $integrity = Get-Content $integrityPath -Raw | ConvertFrom-Json
    $version = (& $binary --version).Trim()
    if ($LASTEXITCODE -or $version -ne $integrity.engine_version) { throw 'Unexpected native engine version' }
    $bytes = [IO.File]::ReadAllBytes($binary)
    $pe = [BitConverter]::ToInt32($bytes, 0x3c)
    if ([BitConverter]::ToUInt32($bytes, $pe) -ne 0x4550 -or [BitConverter]::ToUInt16($bytes, $pe+4) -ne 0x8664) { throw 'Expected x64 PE executable' }
    Copy-Item $binary (Join-Path $root 'bin/cursor-magpie-bridge.exe')
    $integrity.engine_win32_x64 = (Get-FileHash $binary -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($integrityPath, ($integrity | ConvertTo-Json) + "`n", [Text.UTF8Encoding]::new($false))
    Write-Output "Bundled Windows engine $version ($($integrity.engine_win32_x64))"
} finally {
    $env:CARGO_TARGET_DIR = $oldTarget
    if (Test-Path $build) { Remove-Item -Recurse -Force $build }
}
