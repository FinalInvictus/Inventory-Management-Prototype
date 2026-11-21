$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$root = Split-Path -Parent $PSScriptRoot
$env:GOCACHE = Join-Path $root '.cache\go-build'
$env:GOMODCACHE = Join-Path $root '.cache\go-mod'
$env:GOTMPDIR = Join-Path $root '.cache\go-tmp'
$env:GOTELEMETRY = 'off'
$env:npm_config_cache = Join-Path $root '.cache\npm'
New-Item -ItemType Directory -Force $env:GOCACHE, $env:GOMODCACHE, $env:GOTMPDIR | Out-Null
