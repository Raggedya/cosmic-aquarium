from pathlib import Path

root = Path(SPECPATH).parent
a = Analysis(
    [str(root / "desktop" / "festivals.py")],
    pathex=[str(root), str(root / "scripts")],
    binaries=[],
    datas=[],
    hiddenimports=["festival_discovery_service"],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="Festivals",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon=str(root / "desktop" / "festivals.ico"),
)
