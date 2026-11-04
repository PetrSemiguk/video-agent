"""Contact sheet of exact scene-first frames with complete narration captions."""

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def wrap(text: str, draw: ImageDraw.ImageDraw, font: ImageFont.FreeTypeFont, width: int):
    lines: list[str] = []
    pending = ""
    for word in text.split():
        candidate = f"{pending} {word}".strip()
        if pending and draw.textlength(candidate, font=font) > width:
            lines.append(pending)
            pending = word
        else:
            pending = candidate
    if pending:
        lines.append(pending)
    return lines or ["Pause / drift"]


def render(payload: dict, out: Path) -> dict:
    style = payload["style"]
    width, pad, gap = style["width"], style["padding"], style["gap"]
    title = ImageFont.truetype(style["font"], style["titleSize"])
    label = ImageFont.truetype(style["font"], style["labelSize"])
    body = ImageFont.truetype(style["font"], style["bodySize"])
    thumbnail_width = (width - 2 * pad - gap) // 2
    thumbnail_height = round(thumbnail_width * payload["height"] / payload["width"])
    scratch = ImageDraw.Draw(Image.new("RGB", (width, 1)))
    lines = [
        wrap(shot["text"], scratch, body, thumbnail_width - 2 * style["inset"])
        for shot in payload["shots"]
    ]
    line_height = math.ceil(body.size * style["lineHeight"])
    caption_height = 2 * style["inset"] + label.size + gap + max(map(len, lines)) * line_height
    top = pad + title.size + gap
    rows = math.ceil(len(payload["shots"]) / 2)
    cell_height = thumbnail_height + caption_height
    height = top + rows * cell_height + (rows - 1) * gap + pad
    canvas = Image.new("RGB", (width, height), style["background"])
    draw = ImageDraw.Draw(canvas)
    draw.text((pad, pad), f"{payload['slug'].upper()} / VOICE SYNC", font=title, fill=style["text"])
    for index, shot in enumerate(payload["shots"]):
        x = pad + (index % 2) * (thumbnail_width + gap)
        y = top + (index // 2) * (cell_height + gap)
        with Image.open(shot["image"]) as source:
            canvas.paste(
                source.convert("RGB").resize(
                    (thumbnail_width, thumbnail_height), Image.Resampling.LANCZOS
                ),
                (x, y),
            )
        draw.rectangle(
            (x, y + thumbnail_height, x + thumbnail_width, y + cell_height), fill=style["surface"]
        )
        caption_x, caption_y = x + style["inset"], y + thumbnail_height + style["inset"]
        draw.text(
            (caption_x, caption_y),
            f"{index + 1}. {shot['id']} / frame {shot['from']}",
            font=label,
            fill=style["accent"],
        )
        caption_y += label.size + gap
        for line in lines[index]:
            draw.text((caption_x, caption_y), line, font=body, fill=style["text"])
            caption_y += line_height
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    return {
        "width": width,
        "height": height,
        "shots": len(payload["shots"]),
        "frames": [s["from"] for s in payload["shots"]],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(render(json.loads(args.input.read_text(encoding="utf-8")), args.out)))


if __name__ == "__main__":
    main()
