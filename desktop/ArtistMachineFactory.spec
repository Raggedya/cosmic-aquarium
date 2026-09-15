from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

root = Path(SPECPATH).parent
scripts = root / "scripts"
a = Analysis(
    [str(root / "desktop" / "artist_machine_factory_dashboard.py")],
    pathex=[str(root), str(scripts)],
    binaries=collect_dynamic_libs("onnxruntime"),
    datas=[
        (str(root / "automation" / "artist-machine-factory" / "skin-contract.json"), "automation/artist-machine-factory"),
    ] + collect_data_files("rapidocr_onnxruntime") + collect_data_files("tkinterdnd2"),
    hiddenimports=["artist_machine_factory", "bandcamp_label", "create_artist_machine", "create_artist", "qr_artwork", "festival_mode", "festival_projects", "festival_discovery_service", "create_festival_machine", "rapidocr_onnxruntime", "tkinterdnd2"],
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
