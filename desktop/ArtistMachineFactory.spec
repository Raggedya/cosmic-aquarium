from pathlib import Path

root = Path(SPECPATH).parent
scripts = root / "scripts"
a = Analysis(
    [str(root / "desktop" / "artist_machine_factory_dashboard.py")],
    pathex=[str(root), str(scripts)],
    binaries=[],
    datas=[
        (str(root / "automation" / "artist-machine-factory" / "skin-contract.json"), "automation/artist-machine-factory"),
    ],
    hiddenimports=["artist_machine_factory", "create_artist_machine", "create_artist", "qr_artwork"],
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
    name="AGGITS Artist Machine Factory",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon=str(root / "desktop" / "artist-machine-factory.ico"),
)
