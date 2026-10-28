# Local dev server for previewing the app on your phone over Wi-Fi. No installs needed.
# Run:  powershell -ExecutionPolicy Bypass -File serve.ps1
# Then open the "On your phone" address in your phone's browser (same Wi-Fi as this PC).
param([int]$Port = 5173)

$root = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.ico' = 'image/x-icon'
  '.webmanifest' = 'application/manifest+json'; '.sql' = 'text/plain; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$listener.Start()

Write-Host ""
Write-Host "Serving $root"
Write-Host "  On this PC:     http://localhost:$Port"
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  ForEach-Object { Write-Host "  On your phone:  http://$($_.IPAddress):$Port   ($($_.InterfaceAlias))" }
Write-Host "Press Ctrl+C to stop."
Write-Host ""

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $stream.ReadTimeout = 5000
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 8192, $true)
      $line = $reader.ReadLine()
      while ($true) { $h = $reader.ReadLine(); if ($null -eq $h -or $h -eq '') { break } }

      $status = '404 Not Found'; $type = 'text/plain; charset=utf-8'; $body = [Text.Encoding]::UTF8.GetBytes('Not found')
      if ($line -match '^(GET|HEAD) (\S+)') {
        $path = [Uri]::UnescapeDataString(($Matches[2] -split '[?#]')[0])
        if ($path.EndsWith('/')) { $path += 'index.html' }
        $file = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
        # Stay inside the project and never serve dotfiles such as .env or .git
        $hidden = $path -match '(^|/)\.'
        if (-not $hidden -and $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
          $status = '200 OK'
          $body = [IO.File]::ReadAllBytes($file)
          $type = $types[[IO.Path]::GetExtension($file).ToLower()]
          if (-not $type) { $type = 'application/octet-stream' }
        }
      }
      $head = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
      $hb = [Text.Encoding]::ASCII.GetBytes($head)
      $stream.Write($hb, 0, $hb.Length)
      if ($line -notlike 'HEAD *') { $stream.Write($body, 0, $body.Length) }
      $stream.Flush()
      Write-Host "$($status.Substring(0,3)) $line"
    } catch {
      # A dropped connection shouldn't stop the server
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
