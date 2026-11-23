# Stamps a new version on the app before a push, so phones fetch every changed file at once
# instead of mixing old cached files with new ones (GitHub Pages lets phones cache for 10 minutes).
# Run before each push:  powershell -ExecutionPolicy Bypass -File tools/release.ps1
#
# It rewrites the block between the "version" markers in index.html: the version number, the
# stylesheet link, and an import map that gives every file in js/ a ?v=<version> address. It also
# writes version.json, which the app checks to know a newer version is out (see checkVersion in js/app.js).

$root = Split-Path -Parent $PSScriptRoot
$v = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmm')
$utf8 = New-Object System.Text.UTF8Encoding($false)

$files = Get-ChildItem -Path (Join-Path $root 'js') -Recurse -Filter *.js | Sort-Object FullName |
  ForEach-Object { './' + $_.FullName.Substring($root.Length + 1).Replace('\', '/') }
$map = ($files | ForEach-Object { "      `"$_`": `"$_`?v=$v`"" }) -join ",`n"

$block = @"
<!-- version:start (written by tools/release.ps1) -->
<script>window.APP_VERSION = '$v';</script>
<link rel="stylesheet" href="css/app.css?v=$v">
<script type="importmap">
{
  "imports": {
$map
  }
}
</script>
<!-- version:end -->
"@

$indexPath = Join-Path $root 'index.html'
$html = [IO.File]::ReadAllText($indexPath)
$pattern = '(?s)<!-- version:start.*?<!-- version:end -->'
if ($html -notmatch $pattern) { throw 'index.html has no version markers.' }
$html = [regex]::Replace($html, $pattern, { param($m) $block.Replace("`r`n", "`n") })
$html = $html -replace 'src="js/app\.js(\?v=\d+)?"', "src=`"js/app.js?v=$v`""
[IO.File]::WriteAllText($indexPath, $html, $utf8)
[IO.File]::WriteAllText((Join-Path $root 'version.json'), "{ `"v`": `"$v`" }`n", $utf8)

Write-Host "Version $v stamped on index.html and version.json ($($files.Count) script files)."
