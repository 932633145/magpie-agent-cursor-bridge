$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'build-native.ps1') -TestOnly
