<#
.SYNOPSIS
    Geospatial Update Script - pull latest code + rebuild + restart container + health check
.DESCRIPTION
    Steps:
      1. git pull (from chenweihanfool/Geospatial on GitHub)
      2. docker compose build (rebuild the app image)
      3. docker compose up -d (recreate the app container)
      4. health check (verify the site responds under /geospatial)

    Unlike pf-cwh/tasktracker, this app connects to an EXTERNAL Azure PostgreSQL
    instance, so there is no local database to back up or schema-sync here.

    Prerequisite (one-time): a `.env` file must exist next to docker-compose.yml
    with a valid DATABASE_URL pointing to the Azure PG instance.

    DEPLOYMENT RULE: this script is the ONLY sanctioned way to change what's
    running in the container. Do not `docker exec` into the running container to
    hand-edit files as a "hotfix" -- commit + push to git instead.
.NOTES
    Version: 1.0
#>

$ErrorActionPreference = "Continue"
$RepoDir = "F:\WEBAPP\SRC\Geospatial"
$LogFile = "$RepoDir\update.log"
$StartTime = Get-Date
$HealthUrl = "https://cwh2023.asuscomm.com/geospatial"
$AppPort = 5140

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "       Geospatial Update Script v1.0      " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Start: $($StartTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray
Write-Host ""

# Shared deploy helpers
$modulePath = "F:\WEBAPP\Deploy\deploy-helpers\DeployHelpers.psm1"
if (-not (Test-Path $modulePath)) {
    Write-Host "ERROR: Shared module not found at $modulePath" -ForegroundColor Red
    exit 1
}
Import-Module $modulePath -Force

function Run-Native {
    param([scriptblock]$ScriptBlock)
    $output = & $ScriptBlock
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Exit code: $exitCode - $output"
    }
    return $output
}

# ==============================================
# Step 1: git pull
# ==============================================
Write-Host "[1/4] Pulling latest code from GitHub..." -ForegroundColor Yellow
try {
    Push-Location $RepoDir
    $gitResult = Run-Native { git pull 2>&1 }
    Write-Host $gitResult
    if ($gitResult -match "Updating") {
        Write-Host "  >> Changes pulled" -ForegroundColor Green
    } else {
        Write-Host "  >> Already up to date" -ForegroundColor Gray
    }
    Pop-Location
}
catch {
    Write-Host "ERROR git pull: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

# ==============================================
# Step 2: docker compose build
# ==============================================
Write-Host "[2/4] Building app image..." -ForegroundColor Yellow
try {
    Push-Location $RepoDir
    $buildResult = cmd /c "docker compose build 2>&1"
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose build failed (exit code: $LASTEXITCODE)"
    }
    Pop-Location
}
catch {
    Write-Host "ERROR docker build: $_" -ForegroundColor Red
    Write-Host "Make sure Docker Desktop is running and .env exists" -ForegroundColor Yellow
    Pop-Location
    exit 1
}

# ==============================================
# Step 3: docker compose up -d
# ==============================================
Write-Host "[3/4] Recreating containers..." -ForegroundColor Yellow
try {
    Push-Location $RepoDir
    $upResult = cmd /c "docker compose up -d 2>&1"
    Write-Host $upResult
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose up -d failed (exit code: $LASTEXITCODE)"
    }
    Write-Host "  >> Containers started" -ForegroundColor Green

    if (-not (Wait-ForPort -Port $AppPort -Retries 15 -DelaySeconds 2)) {
        throw "App did not start listening on port $AppPort within 30s"
    }
    Write-Host "  >> App listening on port $AppPort" -ForegroundColor Green
    Pop-Location
}
catch {
    Write-Host "ERROR docker up: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

# ==============================================
# Step 4: Health check
# ==============================================
Write-Host "[4/4] Health check..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

try {
    $statusCode = (Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 15).StatusCode
    if ($statusCode -eq 200) {
        Write-Host "  >> PASS - Geospatial is running (HTTP $statusCode)" -ForegroundColor Green
    } else {
        Write-Host "  >> WARNING - HTTP $statusCode, verify manually" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "  >> FAILED - $_" -ForegroundColor Red
    Write-Host "     Try: docker compose logs --tail=50 app" -ForegroundColor Yellow
}

# Done
$EndTime = Get-Date
$Duration = ($EndTime - $StartTime).TotalSeconds
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Update complete! ($($Duration.ToString('0.0'))s)" -ForegroundColor Cyan
Write-Host $HealthUrl -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$LogLine = "$($StartTime.ToString('yyyy-MM-dd HH:mm:ss')) | ${Duration:0.0}s | Done"
Add-Content -Path $LogFile -Value $LogLine -Encoding UTF8
