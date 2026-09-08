from pathlib import Path

root = Path(SPECPATH).parent
a = Analysis(
    [str(root / "desktop" / "things_to_do_machine.py")],
    pathex=[str(root), str(root / "desktop")],
    binaries=[], datas=[(str(root / "data" / "tourism" / "bendigo.json"), "data/tourism")],
    hiddenimports=["tourism_config", "tourism_preview_server"], hookspath=[], runtime_hooks=[], excludes=[], noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name="ThingsToDoMachine", debug=False, bootloader_ignore_signals=False, strip=False, upx=True, console=False, icon=str(root / "desktop" / "things-to-do-machine.ico"))
