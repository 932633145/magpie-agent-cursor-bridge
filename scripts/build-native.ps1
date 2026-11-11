param([switch]$TestOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$source = Join-Path $root '.native-source'
$target = Join-Path $root '.native-target'
if (-not (Test-Path $source)) {
    git clone --quiet --branch v1.0.1 --depth 1 https://github.com/leookun/cursor-byok.git $source
    if ($LASTEXITCODE) { throw 'Native source clone failed' }
}
if ((git -C $source rev-parse HEAD) -ne '2068ab20513288e6a0289d33febe872a30608610') {
    throw 'Unexpected native source revision'
}
git -C $source apply --reverse --check --whitespace=nowarn (Join-Path $root 'source.patch') 2>$null
if ($LASTEXITCODE) {
    git -C $source apply --check --whitespace=nowarn (Join-Path $root 'source.patch')
    if ($LASTEXITCODE) { throw 'Source does not match source.patch; remove .native-source and retry' }
    git -C $source apply --whitespace=nowarn (Join-Path $root 'source.patch')
    if ($LASTEXITCODE) { throw 'Native source patch failed' }
}
# Keep build artifacts outside the source: include_dir embeds source assets.
$env:CARGO_TARGET_DIR = $target
if (-not $env:CARGO_BUILD_JOBS) { $env:CARGO_BUILD_JOBS = '2' }
cargo test --manifest-path "$source\Cargo.toml" --locked -p cursor-server --test bridge_bidi_wire --quiet
if ($LASTEXITCODE) { throw 'Native wire tests failed' }
cargo test --manifest-path "$source\Cargo.toml" --locked -p cursor-server --test bridge_route --quiet
if ($LASTEXITCODE) { throw 'Native bridge routing tests failed' }
cargo test --manifest-path "$source\Cargo.toml" --locked -p cursor-server --test commit_message --quiet
if ($LASTEXITCODE) { throw 'Native Git name tests failed' }
cargo test --manifest-path "$source\Cargo.toml" --locked -p cursor-server --bin cursor-magpie-bridge --quiet
if ($LASTEXITCODE) { throw 'Native bridge self-tests failed' }
cargo test --manifest-path "$source\Cargo.toml" --locked -p cursor-server --lib --quiet
if ($LASTEXITCODE) { throw 'Native library tests failed' }
if ($TestOnly) { return }
cargo build --manifest-path "$source\Cargo.toml" --release --locked -p cursor-server --bin cursor-magpie-bridge --quiet
if ($LASTEXITCODE) { throw 'Native build failed' }
$binary = Join-Path $target 'release\cursor-magpie-bridge.exe'
$integrityPath = Join-Path $root 'integrity.json'
$integrity = Get-Content $integrityPath -Raw | ConvertFrom-Json
$version = (& $binary --version).Trim()
if ($LASTEXITCODE -or $version -ne $integrity.engine_version) { throw 'Unexpected native engine version' }
Copy-Item $binary (Join-Path $root 'bin\cursor-magpie-bridge.exe')
$integrity.engine_win32_x64 = (Get-FileHash $binary -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($integrityPath, ($integrity | ConvertTo-Json) + "`n", [Text.UTF8Encoding]::new($false))
Write-Output "Bundled Windows engine $version ($($integrity.engine_win32_x64))"
