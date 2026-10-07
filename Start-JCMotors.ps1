# Compatibilidad con accesos anteriores: abre la aplicación nativa instalada.
$ErrorActionPreference = 'Stop'
$installedApp = Join-Path $env:LOCALAPPDATA 'JC Motors Cotizador\jc-motors-cotizador.exe'
if (-not (Test-Path -LiteralPath $installedApp)) {
  throw "No se encontró la app de escritorio: $installedApp"
}
Start-Process -FilePath $installedApp -WorkingDirectory (Split-Path -Parent $installedApp)
