$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'investmentChecker'
$manifestSource = Join-Path $source 'manifest.json'
if (-not (Test-Path $manifestSource)) { throw 'El ZIP debe tener la carpeta investmentChecker junto a este instalador.' }
$braveRoot = Join-Path $env:LOCALAPPDATA 'BraveSoftware\Brave-Browser\User Data'
$candidates = New-Object 'System.Collections.Generic.List[string]'
if (Test-Path $braveRoot) {
  $profiles = @(Get-Item (Join-Path $braveRoot 'Default') -ErrorAction SilentlyContinue)
  $profiles += @(Get-ChildItem -Path $braveRoot -Directory -Filter 'Profile *' -ErrorAction SilentlyContinue)
  foreach($profile in $profiles) {
    $preferences = Join-Path $profile.FullName 'Preferences'
    if (-not (Test-Path $preferences)) { continue }
    try {
      $parsed = Get-Content -Raw -Encoding UTF8 $preferences | ConvertFrom-Json
      if (-not $parsed.extensions -or -not $parsed.extensions.settings) { continue }
      foreach ($entry in $parsed.extensions.settings.PSObject.Properties) {
        $ext = $entry.Value
        $path = [string]$ext.path
        if (-not $path -or $path -notmatch 'investmentChecker') { continue }
        if (-not [System.IO.Path]::IsPathRooted($path)) {
          $path = Join-Path $braveRoot $path
        }
        $mf = Join-Path $path 'manifest.json'
        if (-not (Test-Path $mf)) { continue }
        $old = Get-Content -Raw -Encoding UTF8 $mf | ConvertFrom-Json
        if ([string]$old.name -match 'investmentChecker') {
          if (-not $candidates.Contains($path)) { [void]$candidates.Add($path) }
        }
      }
    } catch {
      Write-Host 'No se pudieron revisar las preferencias de un perfil; continuamos.'
    }
  }
}
if ($candidates.Count -eq 1) {
  $target = $candidates[0]
} else {
  Write-Host 'Selecciona la carpeta YA INSTALADA de investmentChecker en Brave.'
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = 'Selecciona la carpeta de la extension de Brave que contiene manifest.json'
  $dialog.ShowNewFolderButton = $false
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'Cancelado sin hacer cambios.' }
  $target = $dialog.SelectedPath
}
$mf = Join-Path $target 'manifest.json'
if (-not (Test-Path $mf)) { throw 'La carpeta elegida no contiene manifest.json. No se hicieron cambios.' }
$installed = Get-Content -Raw -Encoding UTF8 $mf | ConvertFrom-Json
if ([string]$installed.name -notmatch 'investmentChecker') { throw 'No parece ser la extension investmentChecker; no se hicieron cambios.' }
# Use all packaged extension resources, including newly added readers.
# Never copy executables or arbitrary nested archive paths.
$names = @(Get-ChildItem -LiteralPath $source -File | Where-Object {
  $_.Extension -in @('.js','.json','.html','.md')
} | ForEach-Object { $_.Name })
$required = @('manifest.json','background.js','collector.js','remote.js','private-sync.js',
  'portfolio-collector.js','portfolio-navigator.js','popup.html','popup.js',
  'order-preflight.js','order-ui-probe.js','orders-history-probe.js')
foreach ($name in $required) {
  if ($name -notin $names) { throw "Paquete incompleto: falta $name. No se hicieron cambios." }
}
# Copy manifest last so Brave sees a completed update, not mixed versions.
$names = @($names | Where-Object { $_ -ne 'manifest.json' }) + @('manifest.json')
foreach ($name in $names) {
  if (-not (Test-Path (Join-Path $source $name))) { throw "Falta $name en el ZIP. No se hicieron cambios." }
}
foreach ($name in $names) { Copy-Item (Join-Path $source $name) (Join-Path $target $name) -Force }
Write-Host ''
Write-Host 'InvestmentChecker actualizado en la MISMA carpeta, conservando tokens y preferencias.' -ForegroundColor Green
Write-Host 'Abre brave://extensions, busca InvestmentChecker y pulsa RECARGAR.'
Write-Host "Carpeta: $target"
