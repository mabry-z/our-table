# Regenerates supabase/seed.sql from js/sample-data.js, using Edge in headless mode.
# Start the dev server first (serve.ps1), then:  powershell -ExecutionPolicy Bypass -File tools/make-seed.ps1
param([int]$Port = 5173)

$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$dom = & $edge --headless=new --disable-gpu --virtual-time-budget=3000 --dump-dom "http://localhost:$Port/tools/seed.html" 2>$null | Out-String
if ($dom -notmatch '(?s)<pre id="out">(.+?)</pre>') { throw 'Seed page did not render. Is serve.ps1 running?' }
$sql = [Net.WebUtility]::HtmlDecode($Matches[1]) -replace "`r`n", "`n"
$out = Join-Path $PSScriptRoot '..\supabase\seed.sql'
[IO.File]::WriteAllText([IO.Path]::GetFullPath($out), $sql, (New-Object Text.UTF8Encoding $false))
Write-Host "Wrote supabase/seed.sql ($($sql.Length) characters)"
