$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Venv = Join-Path $PSScriptRoot ".venv-build"
if (-not (Test-Path (Join-Path $Venv "Scripts\python.exe"))) {
  py -3.12 -m venv $Venv
}
$Python = Join-Path $Venv "Scripts\python.exe"
$DesktopDist = Join-Path $Root "desktop-dist"
$Executable = Join-Path $DesktopDist "Festivals.exe"
& $Python -m pip install --disable-pip-version-check --upgrade pip
& $Python -m pip install Pillow==12.3.0 pyinstaller==6.22.2
& $Python (Join-Path $PSScriptRoot "create_festivals_icon.py")
Push-Location $Root
try {
  & $Python -m PyInstaller --noconfirm --clean --distpath $DesktopDist (Join-Path $PSScriptRoot "Festivals.spec")
} finally {
  Pop-Location
}
if (-not (Test-Path $Executable)) {
  throw "Festivals.exe was not created."
}
Write-Output "Festivals dashboard: $Executable"
