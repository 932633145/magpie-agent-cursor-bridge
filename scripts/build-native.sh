#!/bin/bash
set -euo pipefail
bridge_package="$(cd -- "$(dirname -- "$0")/.." && pwd)"
if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo 'This release supports Apple Silicon macOS only.' >&2
  exit 1
fi
bridge_build="$(mktemp -d "${TMPDIR:-/tmp}/cursor-bridge-build.XXXXXX")"
trap 'rm -rf -- "$bridge_build"' EXIT
# Keep build artifacts outside source: include_dir embeds source assets.
export CARGO_TARGET_DIR="$bridge_build/target"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-13.0}"
git clone --branch v1.0.1 --depth 1 git@github.com:leookun/cursor-byok.git "$bridge_build/source"
[ "$(git -C "$bridge_build/source" rev-parse HEAD)" = 2068ab20513288e6a0289d33febe872a30608610 ]
git -C "$bridge_build/source" apply --check "$bridge_package/source.patch"
git -C "$bridge_build/source" apply "$bridge_package/source.patch"
# Run all bridge-specific integration targets, not only the wire decoder.
# Environment-proxy tests mutate process globals, so library tests run serially.
cargo test --manifest-path "$bridge_build/source/Cargo.toml" --locked -p cursor-server \
  --lib --bin cursor-magpie-bridge --test bridge_bidi_wire --test bridge_route \
  --test bridge_tab --test commit_message --test error_lifecycle -- --test-threads=1
cargo build --manifest-path "$bridge_build/source/Cargo.toml" --release --locked -p cursor-server --bin cursor-magpie-bridge
binary="$CARGO_TARGET_DIR/release/cursor-magpie-bridge"
file "$binary"
[ "$(lipo -archs "$binary")" = arm64 ]
otool -L "$binary"
# A developer-machine Homebrew library must not become a runtime requirement.
if otool -L "$binary" | /usr/bin/grep -E '/(opt/homebrew|usr/local|Users)/'; then
  echo 'Native engine links to a non-system library.' >&2
  exit 1
fi
codesign --verify --verbose "$binary"
node "$bridge_package/scripts/package-macos.mjs" "$binary"
