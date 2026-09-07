$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Venv = Join-Path $PSScriptRoot ".venv-build"
if (-not (Test-Path (Join-Path $Venv "Scripts\python.exe"))) {
  py -3.12 -m venv $Venv
}
$Python = Join-Path $Venv "Scripts\python.exe"
$DesktopDist = Join-Path $Root "desktop-dist"
$Portable = Join-Path $DesktopDist "AGGITS Artist Machine Factory.exe"
$Installer = Join-Path $DesktopDist "Install AGGITS Artist Machine Factory.exe"
& $Python -m pip install --disable-pip-version-check --upgrade pip
& $Python -m pip install -r (Join-Path $Root "requirements-automation.txt") pyinstaller==6.22.2
& $Python (Join-Path $PSScriptRoot "create_factory_icon.py")
Push-Location $Root
try {
  & $Python -m PyInstaller --noconfirm --clean --distpath $DesktopDist (Join-Path $PSScriptRoot "ArtistMachineFactory.spec")
  & $Python -m PyInstaller --noconfirm --clean --distpath $DesktopDist (Join-Path $PSScriptRoot "ArtistMachineFactoryInstaller.spec")
} finally {
  Pop-Location
}
if (-not (Test-Path $Installer)) {
  throw "The Windows installer was not created."
}
Write-Output "Portable dashboard: $Portable"
Write-Output "Installer: $Installer"
