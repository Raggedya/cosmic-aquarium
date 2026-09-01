"""Deterministic, metadata-only classification into Cosmic Aquaria waters."""

from __future__ import annotations

import hashlib

WATERS = ("heavy", "dreamy", "electronic", "quiet", "loud", "dark", "strange")
KEYWORDS = {
    "heavy": ("metal", "doom", "sludge", "hardcore", "punk", "noise rock", "industrial", "grind", "stoner"),
    "dreamy": ("dream pop", "shoegaze", "ambient pop", "ethereal", "psychedelic", "dreampop", "slowcore"),
    "electronic": ("electronic", "techno", "house", "synth", "electro", "idm", "breakbeat", "drum and bass", "dnb"),
    "quiet": ("ambient", "acoustic", "folk", "minimal", "piano", "meditation", "field recording", "drone"),
    "loud": ("rock", "punk", "hardcore", "metal", "noise", "garage", "grunge", "post-hardcore"),
    "dark": ("darkwave", "goth", "doom", "industrial", "post-punk", "black metal", "coldwave", "dark ambient"),
    "strange": ("experimental", "avant-garde", "outsider", "free jazz", "psych", "abstract", "sound collage", "weird"),
}


def valid_waters(values: list[str] | tuple[str, ...] | None) -> list[str]:
    return list(dict.fromkeys(str(value).lower() for value in (values or []) if str(value).lower() in WATERS))


def classify_waters(tags: list[str] | None = None, text: str = "", seed: str = "") -> list[str]:
    haystack = " ".join([*(tags or []), text]).lower()
    scored = sorted(
        ((water, sum(term in haystack for term in KEYWORDS[water])) for water in WATERS),
        key=lambda item: (-item[1], item[0]),
    )
    matched = [water for water, score in scored if score > 0]
    if matched:
        return matched[:3]
    digest = hashlib.sha256((seed or haystack or "cosmic-aquaria").encode()).digest()
    result = [WATERS[digest[0] % len(WATERS)], WATERS[digest[1] % len(WATERS)]]
    return list(dict.fromkeys(result))
