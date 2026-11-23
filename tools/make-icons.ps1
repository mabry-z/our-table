# Draws the app icon (a linen farmhouse table on sage, same shapes as icons/icon.svg) as PNGs.
# Run after changing the design:  powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
# The PNGs are full squares with no rounded corners: phones round them off themselves, and Android
# may crop to a circle, so the table stays inside the middle 80%.
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'icons'
$sage = [System.Drawing.ColorTranslator]::FromHtml('#8A9A74')
$linen = [System.Drawing.ColorTranslator]::FromHtml('#F7F3EC')

function Add-RoundRect($path, [single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  if ($r -le 0) { $path.AddRectangle((New-Object System.Drawing.RectangleF $x, $y, $w, $h)); return }
  $d = 2 * $r
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
}

foreach ($size in 180, 192, 512) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.PixelOffsetMode = 'HighQuality'
  $g.Clear($sage)
  $s = $size / 120
  $brush = New-Object System.Drawing.SolidBrush $linen
  # x, y, width, height, corner radius — in the SVG's 120-unit grid
  foreach ($r in @(@(20, 52, 80, 9, 2), @(27, 61, 8, 30, 1.5), @(85, 61, 8, 30, 1.5), @(35, 68, 50, 4, 0))) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    Add-RoundRect $p ($r[0] * $s) ($r[1] * $s) ($r[2] * $s) ($r[3] * $s) ($r[4] * $s)
    $g.FillPath($brush, $p)
    $p.Dispose()
  }
  $name = if ($size -eq 180) { 'apple-touch-icon.png' } else { "icon-$size.png" }
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $brush.Dispose()
  Write-Host "icons/$name ($size px)"
}
