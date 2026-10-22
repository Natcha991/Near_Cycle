# setup_and_run.ps1  (ASCII only on purpose: PowerShell 5.1 misreads UTF-8 files without BOM)
# Requires PowerShell 5.1+
$ErrorActionPreference = "Stop"

if ($PSScriptRoot) { $RootDir = $PSScriptRoot } else { $RootDir = (Get-Location).Path }
$BackendDir  = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"

function Log-Info($msg)    { Write-Host ""; Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Log-Ok($msg)      { Write-Host "[OK] $msg" -ForegroundColor Green }
function Log-Warn($msg)    { Write-Host "[WARN] $msg" -ForegroundColor Yellow }

function Refresh-SessionEnv {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user    = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

function Test-Node { return [bool](Get-Command node -ErrorAction SilentlyContinue) }

function Try-Install($name, [scriptblock]$action) {
    try {
        Write-Host "-> Installing Node.js via $name ..."
        & $action
        Refresh-SessionEnv
        return (Test-Node)
    } catch {
        Log-Warn "$name failed: $($_.Exception.Message)"
        return $false
    }
}

function Install-NodePortable {
    Write-Host "-> Downloading portable Node.js from nodejs.org (no admin needed) ..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { $arch = "arm64" }

    $version = "v22.12.0"   # fallback if the index cannot be fetched
    try {
        $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing
        $lts = $index | Where-Object { $_.lts } | Select-Object -First 1
        if ($lts) { $version = $lts.version }
    } catch { Log-Warn "Could not read Node.js version index, using $version" }

    $folderName = "node-$version-win-$arch"
    $zipName    = "$folderName.zip"
    $url        = "https://nodejs.org/dist/$version/$zipName"
    $toolsDir   = Join-Path $RootDir ".tools"
    $nodeDir    = Join-Path $toolsDir "nodejs"
    $tempZip    = Join-Path $env:TEMP $zipName

    if (-not (Test-Path (Join-Path $nodeDir "node.exe"))) {
        New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
        Invoke-WebRequest -Uri $url -OutFile $tempZip -UseBasicParsing
        Expand-Archive -Path $tempZip -DestinationPath $toolsDir -Force
        Remove-Item $tempZip -Force
        if (Test-Path $nodeDir) { Remove-Item $nodeDir -Recurse -Force }
        Rename-Item -Path (Join-Path $toolsDir $folderName) -NewName "nodejs"
    }
    # Session only; child windows inherit it. Nothing is written to the system PATH.
    $env:Path = "$nodeDir;$env:Path"
    return (Test-Node)
}

function Install-Dependencies($path, $name) {
    if (-not (Test-Path $path)) { throw "Folder '$name' not found at: $path" }
    if (-not (Test-Path (Join-Path $path "package.json"))) {
        Log-Warn "No package.json in $name, skipping install"
        return
    }
    Log-Info "Installing dependencies: $name"
    Push-Location $path
    try {
        if ((Test-Path "package-lock.json") -and -not (Test-Path "node_modules")) {
            & npm.cmd ci
            if ($LASTEXITCODE -ne 0) {
                Log-Warn "npm ci failed, falling back to npm install"
                & npm.cmd install
            }
        } else {
            & npm.cmd install
        }
        if ($LASTEXITCODE -ne 0) { throw "npm install failed in $name (exit code $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}

try {
    # 1. Node.js
    Log-Info "1/4 Checking Node.js..."
    if (-not (Test-Node)) {
        Log-Warn "Node.js not found. Starting automatic install..."
        $installed = $false

        if (-not $installed -and (Get-Command winget -ErrorAction SilentlyContinue)) {
            $installed = Try-Install "winget" {
                winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
                if ($LASTEXITCODE -ne 0) { throw "winget exit code $LASTEXITCODE" }
            }
        }
        if (-not $installed -and (Get-Command choco -ErrorAction SilentlyContinue)) {
            $installed = Try-Install "Chocolatey" {
                choco install nodejs-lts -y
                if ($LASTEXITCODE -ne 0) { throw "choco exit code $LASTEXITCODE" }
            }
        }
        if (-not $installed -and (Get-Command scoop -ErrorAction SilentlyContinue)) {
            $installed = Try-Install "Scoop" {
                scoop install nodejs-lts
                if ($LASTEXITCODE -ne 0) { throw "scoop exit code $LASTEXITCODE" }
            }
        }
        if (-not $installed) {
            $installed = Try-Install "portable zip" { if (-not (Install-NodePortable)) { throw "portable install did not produce node" } }
        }
        if (-not $installed) { throw "Could not install Node.js by any method. Install it manually from https://nodejs.org" }
    }
    Log-Ok "Node.js $(node -v) | npm $(& npm.cmd -v)"

    # 2. .env
    Log-Info "2/4 Setting up .env..."
    $rootExample    = Join-Path $RootDir ".env.example"
    $backendExample = Join-Path $BackendDir ".env.example"
    $backendEnv     = Join-Path $BackendDir ".env"
    $source = $null
    if (Test-Path $rootExample) { $source = $rootExample }
    elseif (Test-Path $backendExample) { $source = $backendExample }

    if ($source) {
        if (-not (Test-Path $backendEnv)) {
            if (-not (Test-Path $BackendDir)) { New-Item -ItemType Directory -Path $BackendDir -Force | Out-Null }
            Copy-Item -Path $source -Destination $backendEnv
            Log-Ok "Copied $(Split-Path $source -Leaf) -> backend\.env"
        } else {
            Log-Warn "backend\.env already exists, not overwriting"
        }
    } else {
        Log-Warn ".env.example not found in root or backend, skipping"
    }

    # 3. Dependencies
    Log-Info "3/4 Installing dependencies..."
    Install-Dependencies $BackendDir "backend"
    Install-Dependencies $FrontendDir "frontend"

    # 4. Dev servers (each in its own window; -NoExit keeps the window open after a crash)
    Log-Info "4/4 Starting dev servers in separate windows..."
    $cmdTemplate = "Set-Location -LiteralPath '{0}'; npm.cmd run dev; Write-Host ''; Write-Host '{1} stopped (exit code ' `$LASTEXITCODE ').' -ForegroundColor Yellow"
    $backendCmd  = $cmdTemplate -f $BackendDir.Replace("'", "''"),  "Backend"
    $frontendCmd = $cmdTemplate -f $FrontendDir.Replace("'", "''"), "Frontend"
    Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $backendCmd
    Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $frontendCmd
    Log-Ok "Backend and Frontend started in 2 new windows."
}
catch {
    Write-Host ""
    Write-Host "[FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
