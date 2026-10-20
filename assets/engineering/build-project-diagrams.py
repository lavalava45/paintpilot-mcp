#!/usr/bin/env python3
"""Reproducible README diagrams using PaintPilot artwork, not generated illustrations.

Inputs are repository-copied, provenance-locked project artwork plus a historical
comparison in docs/ru/images/. Graphs, labels, and overlays are schematic.
They are not screenshots of the Guard, a Photoshop layer panel, or execution proof.
"""
from __future__ import annotations

from pathlib import Path
import hashlib
import math

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets" / "engineering"
VIOLINIST = ASSETS / "source-paintpilot-violinist.jpg"
CITY = ASSETS / "source-paintpilot-pink-city.jpg"
ROLLBACK = ROOT / "docs" / "ru" / "images" / "homestead-rejected-pass-and-rollback.jpg"

W, H = 1536, 1024
BG, WHITE, NAVY, BLUE, TEAL, AMBER = (
    "#f6f8fb", "#ffffff", "#142842", "#41607d", "#168b88", "#c98c3e"
)
PALE, BORDER, GRAY = "#eaf3f3", "#d7e0e8", "#536678"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    paths = (
        ["C:/Windows/Fonts/segoeuib.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
        if bold else
        ["C:/Windows/Fonts/segoeui.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    )
    for path in paths:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise FileNotFoundError(f"No bundled-compatible system font: {paths}")


def canvas(title: str, subtitle: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(image)
    d.text((56, 48), title, font=font(43, True), fill=NAVY)
    d.text((58, 115), subtitle, font=font(25), fill=GRAY)
    d.line((56, 175, 1480, 175), fill=BORDER, width=3)
    return image, d


def card(d: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], fill: str = WHITE) -> None:
    d.rounded_rectangle(xy, radius=22, fill=fill, outline=BORDER, width=3)


def text(d: ImageDraw.ImageDraw, xy: tuple[int, int], s: str, *,
         size: int = 24, bold: bool = False, fill: str = NAVY) -> None:
    d.text(xy, s, font=font(size, bold), fill=fill)


def centered(d: ImageDraw.ImageDraw, center_x: int, y: int, s: str, *,
             size: int = 24, bold: bool = False, fill: str = NAVY) -> None:
    bb = d.textbbox((0, 0), s, font=font(size, bold))
    text(d, (center_x - (bb[2] - bb[0]) // 2, y), s, size=size, bold=bold, fill=fill)


def arrow(d: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int],
          color: str = TEAL, width: int = 6) -> None:
    d.line((*start, *end), fill=color, width=width, joint="curve")
    a = math.atan2(end[1] - start[1], end[0] - start[0])
    k = 16
    d.polygon(
        [end,
         (int(end[0] - k * math.cos(a - 0.57)), int(end[1] - k * math.sin(a - 0.57))),
         (int(end[0] - k * math.cos(a + 0.57)), int(end[1] - k * math.sin(a + 0.57)))],
        fill=color
    )


def elbow(d: ImageDraw.ImageDraw, pts: list[tuple[int, int]],
          color: str = TEAL, width: int = 5) -> None:
    d.line(pts, fill=color, width=width, joint="curve")
    arrow(d, pts[-2], pts[-1], color, width)


def photo(img: Image.Image, path: Path, rect: tuple[int, int, int, int],
          *, focus: tuple[float, float] = (0.5, 0.5)) -> None:
    x0, y0, x1, y1 = rect
    source = Image.open(path).convert("RGB")
    sw, sh = source.size
    rw, rh = x1 - x0, y1 - y0
    needed = max(rw / sw, rh / sh)
    cw, ch = rw / needed, rh / needed
    sx = max(0, min(sw - cw, sw * focus[0] - cw / 2))
    sy = max(0, min(sh - ch, sh * focus[1] - ch / 2))
    source = source.crop((int(sx), int(sy), int(sx + cw), int(sy + ch)))
    source = source.resize((rw, rh), Image.Resampling.LANCZOS)
    img.paste(source, (x0, y0))


def footer(d: ImageDraw.ImageDraw, note: str) -> None:
    d.line((56, 940, 1480, 940), fill=BORDER, width=2)
    text(d, (60, 958), note, size=21, fill=GRAY)
    text(d, (1295, 958), "PAINTPILOT", size=20, bold=True, fill=TEAL)


def geometry() -> Image.Image:
    im, d = canvas("AUTHORED GEOMETRY  /  EDITABLE PAINT",
                   "A real PaintPilot violinist study, with explanatory construction overlays")
    left, middle, right = (54, 211, 497, 911), (516, 211, 981, 911), (1000, 211, 1481, 911)
    for rect in (left, middle, right):
        card(d, rect)
    text(d, (79, 231), "1  ARTWORK & TARGETS", size=26, bold=True)
    photo(im, VIOLINIST, (78, 295, 472, 767), focus=(0.69, 0.53))
    d.rectangle((78, 295, 472, 767), outline=BORDER, width=2)
    # Overlay landmarks only as a visual explanation. They are NOT recovered
    # joint coordinates from the source run or a validated anatomical model.
    joints = [(244, 510), (207, 489), (166, 463), (115, 444)]
    for a, b in zip(joints, joints[1:]):
        d.line((*a, *b), fill="#f7d179", width=5)
    for x, y in joints:
        d.ellipse((x - 8, y - 8, x + 8, y + 8), fill=TEAL, outline=WHITE, width=3)
    d.line((105, 433, 123, 452), fill="#e45e4b", width=4)
    d.line((123, 433, 105, 452), fill="#e45e4b", width=4)
    text(d, (82, 790), "Original Photoshop painting", size=23, bold=True)
    text(d, (82, 827), "Dots = illustrative landmarks", size=21, fill=GRAY)

    text(d, (540, 231), "2  CHOOSE CONSTRAINTS", size=26, bold=True)
    text(d, (546, 287), "Author proportions and contact", size=24, fill=BLUE)
    text(d, (546, 325), "targets; solve only what is needed.", size=22, fill=GRAY)
    items = [
        ("IK.ts / FABRIK", "Pose and joint lengths"),
        ("Bezier.js", "Smooth constructed contours"),
        ("Clipper2", "Bound painting and exclusions"),
    ]
    for i, (label, desc) in enumerate(items):
        top = 398 + i * 142
        d.rounded_rectangle((544, top, 952, top + 115), radius=16,
                            fill="#edf5f7", outline="#cadedd", width=2)
        d.ellipse((561, top + 30, 581, top + 50), fill=TEAL)
        text(d, (601, top + 17), label, size=26, bold=True)
        text(d, (601, top + 64), desc, size=21, fill=GRAY)
    text(d, (546, 846), "Separate methods, not a", size=20, fill=GRAY)
    text(d, (546, 871), "mandatory serial pipeline.", size=20, fill=GRAY)

    text(d, (1022, 231), "3  EDITABLE COMPONENTS", size=26, bold=True)
    photo(im, VIOLINIST, (1026, 295, 1455, 643), focus=(0.61, 0.53))
    d.rectangle((1026, 295, 1455, 643), outline=BORDER, width=2)
    text(d, (1029, 673), "Conceptual ownership scopes:", size=22, fill=BLUE)
    for i, name in enumerate(("Figure", "Violin", "Background")):
        y = 716 + i * 52
        d.rounded_rectangle((1028, y, 1448, y + 42), radius=11,
                            fill=PALE, outline="#c6dcda", width=2)
        d.ellipse((1045, y + 13, 1060, y + 28), fill=TEAL)
        text(d, (1081, y + 5), name, size=21, bold=True)
    footer(d, "Real project pixels; annotations are schematic, not a recorded IK execution or layer-panel capture.")
    return im


def autonomy() -> Image.Image:
    im, d = canvas("BOUNDED ARTISTIC AUTONOMY",
                   "Artistic roles share one conversation; mutations cross the embedded Guard")
    # Role cards.
    top = [(55, 215, 415, 406), (532, 215, 895, 406), (1075, 215, 1480, 406)]
    for rect in top:
        card(d, rect)
    for x, role, sub, sub2 in [
        (78, "ART DIRECTOR", "Global priorities", "and bounded task"),
        (556, "PAINTER", "One semantic pass", "per mutation cycle"),
        (1099, "CRITIC ROLE", "Review actual pixels", "and choose corrections"),
    ]:
        text(d, (x, 240), role, size=29, bold=True)
        text(d, (x, 315), sub, size=24, fill=BLUE)
        text(d, (x, 355), sub2, size=22, fill=GRAY)
    arrow(d, (416, 313), (529, 313))

    # The sole execution path from the Painter goes through Guard.
    card(d, (528, 529, 866, 827), PALE)
    card(d, (922, 529, 1125, 827))
    card(d, (1181, 529, 1481, 827))
    arrow(d, (711, 406), (711, 526))
    text(d, (548, 555), "EMBEDDED GUARD", size=27, bold=True)
    text(d, (555, 635), "Document identity", size=22, fill=BLUE)
    text(d, (555, 677), "Owner + journal", size=22, fill=BLUE)
    text(d, (555, 719), "Evidence barrier", size=22, fill=BLUE)
    text(d, (954, 555), "UXP", size=29, bold=True)
    text(d, (944, 617), "Native", size=22, fill=BLUE)
    text(d, (944, 650), "operations", size=22, fill=BLUE)
    text(d, (1201, 548), "PHOTOSHOP", size=27, bold=True)
    photo(im, CITY, (1202, 603, 1459, 767))
    text(d, (1210, 790), "Real Pink City run", size=19, fill=GRAY)
    arrow(d, (867, 677), (920, 677))
    arrow(d, (1127, 677), (1179, 677))

    # Review feedback, intentionally separate from mutation routing.
    elbow(d, [(1340, 529), (1340, 476), (1270, 476), (1270, 410)], BLUE, 4)
    text(d, (1086, 481), "Exact-image review", size=20, fill=BLUE)
    elbow(d, [(1072, 281), (1030, 281), (1030, 448),
              (812, 448), (812, 411)], TEAL, 4)
    text(d, (854, 455), "Next correction", size=20, fill=TEAL)
    text(d, (551, 851), "No Painter → Photoshop bypass", size=24, bold=True, fill=TEAL)
    footer(d, "Pink City is real PaintPilot artwork. Arrows show intended contracts, not a captured live trace.")
    return im


def recovery() -> Image.Image:
    im, d = canvas("WHEN AN EXECUTION REPLY IS LOST",
                   "Reconcile the original operation; never assume a mutation can be replayed")
    # Lost-reply scenario is a contract illustration, not a factual claim
    # about the separate historical rollback frames displayed below.
    top = [(55, 217, 439, 328), (578, 217, 968, 328), (1110, 217, 1480, 328)]
    for rect in top:
        card(d, rect)
    for x, label in [(80, "Submit operation"), (601, "Photoshop may execute"),
                     (1139, "Reply is missing")]:
        text(d, (x, 250), label, size=28, bold=True)
    arrow(d, (442, 270), (575, 270))
    arrow(d, (972, 270), (1106, 270))
    text(d, (862, 344), "NO BLIND REPLAY", size=23, bold=True, fill="#b64b45")

    steps = [(55, 430, 472, 555), (558, 430, 977, 555), (1060, 430, 1480, 555)]
    for rect in steps:
        card(d, rect, PALE)
    text(d, (77, 448), "1  Durable journal", size=27, bold=True)
    text(d, (75, 493), "Original operation receipt", size=22, fill=GRAY)
    text(d, (579, 448), "2  Fresh state & preview", size=26, bold=True)
    text(d, (579, 493), "Exact document + pixel identity", size=22, fill=GRAY)
    text(d, (1080, 448), "3  Reconcile", size=27, bold=True)
    text(d, (1080, 493), "What actually happened?", size=23, fill=GRAY)
    elbow(d, [(1294, 330), (1294, 399), (262, 399), (262, 427)])
    arrow(d, (475, 490), (555, 490))
    arrow(d, (980, 490), (1057, 490))

    d.line((1285, 558, 1285, 600), fill=TEAL, width=5)
    d.line((252, 600, 1285, 600), fill=TEAL, width=5)
    outcomes = [
        (55, "COMPLETED", "Verified → new action"),
        (427, "NOT EXECUTED", "Replan safely"),
        (800, "PARTIAL", "Bounded recovery"),
        (1173, "UNCERTAIN", "Keep blocked"),
    ]
    for i, (x, label, description) in enumerate(outcomes):
        card(d, (x, 634, x + 309, 744))
        if i < 3:
            arrow(d, (x + 154, 601), (x + 154, 630))
        else:
            arrow(d, (1285, 601), (1285, 630))
        text(d, (x + 14, 651), label, size=23, bold=True,
             fill="#a36423" if i > 1 else NAVY)
        text(d, (x + 14, 695), description, size=20, fill=GRAY)

    photo(im, ROLLBACK, (55, 773, 860, 910))
    d.rectangle((55, 773, 860, 910), outline=BORDER, width=2)
    text(d, (896, 784), "Historical PaintPilot rollback", size=24, bold=True)
    text(d, (896, 826), "Separate artistic-rejection example.", size=21, fill=GRAY)
    text(d, (896, 860), "NOT a lost-MCP-reply record.", size=21, fill="#a36423")
    footer(d, "Actual PaintPilot rollback illustration; transport-loss decision flow is schematic.")
    return im


def main() -> None:
    for path in (VIOLINIST, CITY, ROLLBACK):
        if not path.is_file():
            raise FileNotFoundError(path)
    for name, builder in [
        ("geometry-and-editable-components.png", geometry),
        ("bounded-artistic-autonomy.png", autonomy),
        ("evidence-bound-recovery.png", recovery),
    ]:
        destination = ASSETS / name
        builder().save(destination, format="PNG", optimize=True)
        print(f"{destination.relative_to(ROOT)} | sha256={hashlib.sha256(destination.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
