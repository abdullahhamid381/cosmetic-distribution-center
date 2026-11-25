param([switch]$OpenBrowser)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$url = 'http://127.0.0.1:3000/login'
$logDirectory = Join-Path $project '.tmp'
$mutex = [Threading.Mutex]::new($false, 'Local\HHMedicsDistributionStartup')
$locked = $false

function Test-DistributionLogin {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200 -and $response.Content.Contains('Sign in to your distribution workspace.')
    } catch {
        return $false
    }
}

try {
    try { $locked = $mutex.WaitOne(90000) }
    catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another launch is still in progress.' }

    if (-not (Test-DistributionLogin)) {
        $node = (Get-Command node.exe).Source
        $next = Join-Path $project 'node_modules\next\dist\bin\next'
        if (-not (Test-Path -LiteralPath $next)) { throw 'Install the project dependencies before starting HH Medics.' }
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        $server = Start-Process -FilePath $node -ArgumentList @("`"$next`"", 'dev', '--hostname', '127.0.0.1', '--port', '3000') -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'windows-startup.log') -RedirectStandardError (Join-Path $logDirectory 'windows-startup-error.log') -PassThru
        $deadline = [DateTime]::UtcNow.AddSeconds(75)
        while (-not (Test-DistributionLogin)) {
            if ($server.HasExited -or [DateTime]::UtcNow -ge $deadline) {
                throw 'HH Medics did not start on port 3000. See .tmp\windows-startup-error.log.'
            }
            Start-Sleep -Seconds 1
        }
    }
    if ($OpenBrowser) { Start-Process $url }
} catch {
    Write-Error $_ -ErrorAction Continue
    if ($OpenBrowser) {
        Add-Type -AssemblyName System.Windows.Forms
        [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'HH Medics startup')
    }
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
