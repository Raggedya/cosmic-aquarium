from __future__ import annotations

from pathlib import Path

import qrcode

from qr_artwork import render_qr_artwork

ROOT = Path(__file__).resolve().parents[1]
CANONICAL_URL = "https://raggedya.github.io/cosmic-aquarium/"


def generate() -> tuple[Path, Path]:
    standard = ROOT / "public" / "cosmic-aquaria-qr-standard.png"
    branded = ROOT / "public" / "cosmic-aquaria-qr-branded.png"
    code = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=16, border=4)
    code.add_data(CANONICAL_URL)
    code.make(fit=True)
    code.make_image(fill_color="black", back_color="white").save(standard)
    render_qr_artwork("COSMIC AQUARIA", CANONICAL_URL, branded, ROOT / "public" / "flowers", visual_style="cosmic", verify=True)
    return standard, branded


if __name__ == "__main__":
    paths = generate()
    print("\n".join(str(path) for path in paths))
