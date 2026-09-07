from pathlib import Path

root = Path(SPECPATH).parent
portable = root / "desktop-dist" / "AGGITS Artist Machine Factory.exe"
a = Analysis(
    [str(root / "desktop" / "artist_machine_factory_installer.py")],
    pathex=[str(root)],
    binaries=[],
    datas=[(str(portable), "payload")],
    hiddenimports=[],
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
    name="Install AGGITS Artist Machine Factory",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon=str(root / "desktop" / "artist-machine-factory.ico"),
)
