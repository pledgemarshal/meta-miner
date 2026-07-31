# Tiny static file server for local testing (no Python/Node on this machine).
$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8899/')
$listener.IgnoreWriteExceptions = $true
$listener.Start()
Write-Host "Serving $root on http://localhost:8899"
$mime = @{ '.html'='text/html'; '.js'='application/javascript'; '.css'='text/css'; '.png'='image/png'; '.ico'='image/x-icon'; '.json'='application/json'; '.mp3'='audio/mpeg'; '.m4a'='audio/mp4' }
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.LocalPath.TrimStart('/')
    if ($path -eq '') { $path = 'index.html' }
    $file = Join-Path $root $path
    if (Test-Path $file -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      $ctx.Response.ContentLength64 = $bytes.Length
      # Non-blocking close: a stalled media socket (audio streaming) must not
      # freeze the single-threaded serve loop for everyone else
      $ctx.Response.Close($bytes, $false)
    } else {
      $ctx.Response.StatusCode = 404
      $ctx.Response.Close()
    }
  } catch {}
}
