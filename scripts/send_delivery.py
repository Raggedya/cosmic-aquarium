from __future__ import annotations

import argparse
import base64
import json
import os
import re
import urllib.request
from pathlib import Path


def send(title: str, page_url: str, qr_path: Path, recipient: str) -> dict:
    api_key = os.environ.get("RESEND_API_KEY", "")
    sender = os.environ.get("REPORT_FROM_EMAIL", "")
    destination = recipient or os.environ.get("REPORT_RECIPIENT", "")
    if not api_key or not sender or not destination:
        raise RuntimeError("RESEND_API_KEY, REPORT_FROM_EMAIL and a recipient are required")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", destination):
        raise ValueError("Recipient email is invalid")
    payload = {
        "from": sender,
        "to": [destination],
        "subject": f"Cosmic Aquarium is ready — {title}",
        "html": f"""<div style="background:#07071d;color:#f7f5ff;padding:42px;font-family:Arial,sans-serif">
          <p style="letter-spacing:.22em;color:#c8b9f3;font-size:12px">COSMIC AQUARIUM</p>
          <h1 style="font-weight:400">{escape(title)}</h1>
          <p>Your living Bandcamp discovery page and scan-tested floral QR are ready.</p>
          <p><a style="color:#d5c8ff" href="{escape(page_url)}">Open the aquarium</a></p>
          <p style="color:#aaa3c4;font-size:12px">Listening and support remain on Bandcamp.</p>
        </div>""",
        "attachments": [{
            "filename": f"{slug(title)}-cosmic-aquarium-qr.png",
            "content": base64.b64encode(qr_path.read_bytes()).decode("ascii"),
        }],
        "tags": [{"name": "product", "value": "cosmic_aquarium"}],
    }
    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.loads(response.read().decode("utf-8"))
    return {"ok": True, "email_id": result.get("id"), "recipient": destination, "page_url": page_url}


def escape(value: str) -> str:
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "artist"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--title", required=True)
    parser.add_argument("--page-url", required=True)
    parser.add_argument("--qr", required=True, type=Path)
    parser.add_argument("--recipient", default="")
    arguments = parser.parse_args()
    print(json.dumps(send(arguments.title, arguments.page_url, arguments.qr, arguments.recipient), separators=(",", ":")))
