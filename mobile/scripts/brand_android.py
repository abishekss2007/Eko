"""Puts the SaansSafe icon and night-sky splash into the generated Android project.

Run after `npx cap add android`:  python scripts/brand_android.py   (needs Pillow)
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"
ICON = Image.open(ROOT / "resources" / "icon.png").convert("RGBA")
FOREGROUND = Image.open(ROOT / "resources" / "icon-foreground.png").convert("RGBA")
NIGHT = (28, 27, 51, 255)


def replace(path: Path, source: Image.Image) -> None:
    with Image.open(path) as old:
        size = old.size
    source.resize(size, Image.LANCZOS).save(path)


def splash(path: Path) -> None:
    with Image.open(path) as old:
        w, h = old.size
    canvas = Image.new("RGBA", (w, h), NIGHT)
    side = min(w, h) // 3
    canvas.alpha_composite(ICON.resize((side, side), Image.LANCZOS), ((w - side) // 2, (h - side) // 2))
    canvas.convert("RGB").save(path)


if not RES.is_dir():
    raise SystemExit("Run `npx cap add android` first.")
for png in RES.glob("mipmap-*/ic_launcher*.png"):
    replace(png, FOREGROUND if png.stem == "ic_launcher_foreground" else ICON)
for png in RES.glob("drawable*/splash.png"):
    splash(png)
background = RES / "values" / "ic_launcher_background.xml"
background.write_text(background.read_text().replace("#FFFFFF", "#2E335A"))
print("SaansSafe icon and splash applied.")
