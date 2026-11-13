# Maneja el diálogo nativo (Guardar como / Abrir) de la app compilada con UI Automation.
# Uso: powershell -File tests/sqliteDialog.ps1 -Title "Guardar respaldo de JC Motors" -Path "C:\ruta\archivo.jcm"
# Escribe la ruta en el campo de nombre (que ya tiene el foco) y pulsa Enter. Sale con código 0 si lo logró.
param([string]$Title, [string]$Path, [int]$TimeoutSeconds = 25)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $Title)
$dialog = $null
while ((Get-Date) -lt $deadline -and -not $dialog) {
  $dialog = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
  if (-not $dialog) { Start-Sleep -Milliseconds 300 }
}
if (-not $dialog) { Write-Error "No apareció el diálogo '$Title'"; exit 2 }
Start-Sleep -Milliseconds 700
try { $dialog.SetFocus() } catch {}
Start-Sleep -Milliseconds 300
# SendKeys: escapar caracteres especiales
$escaped = ($Path -replace '([+^%~(){}\[\]])', '{$1}')
[System.Windows.Forms.SendKeys]::SendWait('^a')
[System.Windows.Forms.SendKeys]::SendWait($escaped)
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
exit 0
