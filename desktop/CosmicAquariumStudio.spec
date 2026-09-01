from pathlib import Path

root = Path(SPECPATH).parent
a = Analysis(
    [str(root / "desktop" / "cosmic_aquarium_studio.py")],
    pathex=[str(root)],
    binaries=[],
    datas=[
        (str(root / "public" / "flowers" / "anemone.png"), "assets/flowers"),
        (str(root / "public" / "flowers" / "cosmos.png"), "assets/flowers"),
        (str(root / "public" / "flowers" / "poppy.png"), "assets/flowers"),
        (str(root / "public" / "flowers" / "rose.png"), "assets/flowers"),
        (str(root / "public" / "flowers" / "thorn.png"), "assets/flowers"),
        (str(root / "public" / "skulls" / "chrome-skull-silver.png"), "assets/skulls"),
        (str(root / "public" / "glass" / "crystal-flower.png"), "assets/glass"),
    ],
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
    name="Cosmic Aquaria Studio",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon=str(root / "desktop" / "cosmic-aquarium.ico"),
)
