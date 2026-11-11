param([switch]$TestOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$build = Join-Path ([IO.Path]::GetTempPath()) ('cursor-bridge-build-' + [guid]::NewGuid())
$source = Join-Path $build 'source'
$target = Join-Path $build 'target'
$previousTarget = $env:CARGO_TARGET_DIR
New-Item -ItemType Directory $build | Out-Null
try {
    git clone --quiet --branch v1.0.1 --depth 1 git@github.com:leookun/cursor-byok.git $source
    if ($LASTEXITCODE) { throw 'Native source clone failed' }
    if ((git -C $source rev-parse HEAD) -ne '2068ab20513288e6a0289d33febe872a30608610') { throw 'Unexpected native source revision' }
    git -C $source apply --check (Join-Path $root 'source.patch')
    if ($LASTEXITCODE) { throw 'Native source patch does not apply' }
    git -C $source apply (Join-Path $root 'source.patch')
    if ($LASTEXITCODE) { throw 'Native source patch failed' }
    $env:CARGO_TARGET_DIR = $target
    if (-not $env:CARGO_BUILD_JOBS) { $env:CARGO_BUILD_JOBS = '2' }
    cargo test --manifest-path "$source\Cargo.toml" --locked -p cursor-server --lib --bin cursor-magpie-bridge --test bridge_bidi_wire --test bridge_route --test bridge_tab --test commit_message --test error_lifecycle -- --test-threads=1
    if ($LASTEXITCODE) { throw 'Native regression tests failed' }
    if ($TestOnly) { return }
    cargo build --manifest-path "$source\Cargo.toml" --release --locked -p cursor-server --bin cursor-magpie-bridge
    if ($LASTEXITCODE) { throw 'Native build failed' }
    $binary = Join-Path $target 'release\cursor-magpie-bridge.exe'
    $integrityPath = Join-Path $root 'integrity.json'
    $integrity = Get-Content $integrityPath -Raw | ConvertFrom-Json
    $version = (& $binary --version).Trim()
    if ($LASTEXITCODE -or $version -ne $integrity.engine_version) { throw 'Unexpected native engine version' }
    $bytes = [IO.File]::ReadAllBytes($binary)
    $pe = [BitConverter]::ToInt32($bytes, 0x3c)
    if ([BitConverter]::ToUInt16($bytes, $pe + 4) -ne 0x8664) { throw 'Expected x64 PE engine' }
    Copy-Item $binary (Join-Path $root 'bin\cursor-magpie-bridge.exe')
    $integrity.engine_win32_x64 = (Get-FileHash $binary -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($integrityPath, ($integrity | ConvertTo-Json) + "`n", [Text.UTF8Encoding]::new($false))
    Write-Output "Bundled Windows engine $version ($($integrity.engine_win32_x64))"
} finally {
    $env:CARGO_TARGET_DIR = $previousTarget
    Remove-Item -Recurse -Force $build
}
