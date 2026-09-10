#!/usr/bin/env python3
"""Generate the shared amber-on-dark icon set for every xlet.

One palette, one canvas style, one distinct glyph per xlet. Rerun after
tweaking the palette or a glyph; output overwrites each icon.png.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent

# Shared palette: amber glyph on dark slate rounded square.
SLATE = (30, 36, 44, 255)
SLATE_LIGHT = (44, 52, 63, 255)
AMBER = (255, 179, 0, 255)
AMBER_LIGHT = (255, 201, 51, 255)
AMBER_DEEP = (201, 138, 0, 255)
NEUTRAL = (232, 237, 242, 255)

SIZE = 512
RADIUS = 112
STROKE = 28


def base():
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([16, 16, SIZE - 16, SIZE - 16], RADIUS, fill=SLATE)
    # Thin inner keyline ties the set together.
    draw.rounded_rectangle([40, 40, SIZE - 40, SIZE - 40], RADIUS - 24, outline=SLATE_LIGHT, width=8)
    return image, draw


def rounded(draw, box, fill=None, outline=None, width=STROKE):
    draw.rounded_rectangle(box, (box[2] - box[0]) // 4, fill=fill, outline=outline, width=width)


def world_clock():
    image, draw = base()
    center, radius = SIZE // 2, 168
    draw.ellipse([center - radius, center - radius, center + radius, center + radius],
                 outline=AMBER, width=STROKE)
    # Compass ticks at 12/3/6/9: the world hint, kept clear of the hands.
    for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
        inner = radius - 58
        draw.line([center + dx * inner, center + dy * inner,
                   center + dx * (radius - 30), center + dy * (radius - 30)],
                  fill=AMBER_DEEP, width=14)
    # Hands at ten past ten.
    draw.line([center, center, center, center - 96], fill=AMBER_LIGHT, width=STROKE)
    draw.line([center, center, center + 76, center + 52], fill=AMBER_LIGHT, width=STROKE)
    draw.ellipse([center - 18, center - 18, center + 18, center + 18], fill=AMBER)
    return image


def color_timer_clock():
    image, draw = base()
    y, height, gap = 168, 176, 28
    width = (SIZE - 2 * 88 - 2 * gap) // 3
    for index in range(3):
        x = 88 + index * (width + gap)
        if index == 0:
            rounded(draw, [x, y, x + width, y + height], fill=AMBER)
        elif index == 1:
            rounded(draw, [x, y, x + width, y + height], outline=AMBER_LIGHT)
        else:
            rounded(draw, [x, y, x + width, y + height], outline=AMBER_DEEP)
    return image


def workspace_grid():
    image, draw = base()
    gap, inset = 34, 96
    side = (SIZE - 2 * inset - gap) // 2
    for row in range(2):
        for column in range(2):
            x = inset + column * (side + gap)
            y = inset + row * (side + gap)
            if row == 0 and column == 1:
                rounded(draw, [x, y, x + side, y + side], fill=AMBER)
            else:
                rounded(draw, [x, y, x + side, y + side], outline=AMBER)
    return image


def in_panel_workspace_name():
    image, draw = base()
    bar_left, bar_right = 56, SIZE - 56
    bar_top, bar_bottom = 156, 356
    rounded(draw, [bar_left, bar_top, bar_right, bar_bottom], outline=AMBER, width=STROKE)
    pad, gap = 30, 26
    segment_width = (bar_right - bar_left - 2 * pad - 2 * gap) // 3
    for index in range(3):
        x = bar_left + pad + index * (segment_width + gap)
        box = [x, bar_top + pad, x + segment_width, bar_bottom - pad]
        if index == 1:
            rounded(draw, box, fill=AMBER, width=14)
        else:
            rounded(draw, box, fill=SLATE_LIGHT, width=14)
    return image


def panel_profiles():
    image, draw = base()
    # Back panel, offset up-right.
    rounded(draw, [128, 96, SIZE - 76, 232], outline=AMBER_DEEP, width=STROKE - 4)
    # Front panel, amber border, filled slate.
    front = [76, 232, SIZE - 76, 416]
    rounded(draw, front, fill=SLATE_LIGHT, outline=AMBER, width=STROKE)
    # Two applet chips on the front panel.
    pad, gap = 34, 24
    inner_left, inner_right = front[0] + pad, front[2] - pad
    chip_width = (inner_right - inner_left - gap) // 2
    rounded(draw, [inner_left, front[1] + pad, inner_left + chip_width, front[3] - pad],
            fill=AMBER_DEEP, width=14)
    rounded(draw, [inner_left + chip_width + gap, front[1] + pad, inner_right, front[3] - pad],
            fill=AMBER, width=14)
    return image


def command_launcher():
    image, draw = base()
    rounded(draw, [88, 128, SIZE - 88, SIZE - 128], outline=AMBER, width=STROKE)
    # Terminal prompt: chevron plus underscore cursor, centered as one group.
    draw.line([152, 208, 236, 288], fill=AMBER_LIGHT, width=STROKE)
    draw.line([152, 368, 236, 288], fill=AMBER_LIGHT, width=STROKE)
    draw.line([276, 356, 360, 356], fill=AMBER, width=STROKE)
    return image


def desktop_widgets():
    """The bundle AppImage icon: widget tiles above a panel bar."""
    image, draw = base()
    gap, top, height = 26, 96, 150
    width = (SIZE - 2 * 96 - 2 * gap) // 3
    for index in range(3):
        x = 96 + index * (width + gap)
        if index == 1:
            rounded(draw, [x, top, x + width, top + height], outline=AMBER_LIGHT)
        elif index == 2:
            rounded(draw, [x, top, x + width, top + height], outline=AMBER_DEEP)
        else:
            rounded(draw, [x, top, x + width, top + height], fill=AMBER)
    bar_top, bar_bottom = 316, 416
    rounded(draw, [88, bar_top, SIZE - 88, bar_bottom], outline=AMBER, width=STROKE)
    chip_gap, chip_pad = 20, 22
    inner_left, inner_right = 88 + chip_pad, SIZE - 88 - chip_pad
    chip_width = (inner_right - inner_left - chip_gap) // 2
    draw.rounded_rectangle(
        [inner_left, bar_top + chip_pad, inner_left + chip_width, bar_bottom - chip_pad],
        14, fill=AMBER_DEEP)
    draw.rounded_rectangle(
        [inner_right - chip_width, bar_top + chip_pad, inner_right, bar_bottom - chip_pad],
        14, fill=AMBER)
    return image


ICONS = {
    "cinnamon-world-clock-desklet@curbsoftware": world_clock,
    "cinnamon-color-timer-clock-desklet@curbsoftware": color_timer_clock,
    "cinnamon-workspace-grid-desklet@curbsoftware": workspace_grid,
    "cinnamon-workspace-names-applet@curbsoftware": in_panel_workspace_name,
    "cinnamon-panel-profiles-applet@curbsoftware": panel_profiles,
    "command-launcher@curbsoftware": command_launcher,
}


def main():
    for directory, glyph in ICONS.items():
        target = ROOT / directory / "icon.png"
        image = glyph().resize((128, 128), Image.LANCZOS)
        image.save(target)
        print("wrote", target)
    bundle = ROOT / "dev-tools" / "appimage" / "curb-desktop-widgets.png"
    bundle.parent.mkdir(parents=True, exist_ok=True)
    desktop_widgets().resize((256, 256), Image.LANCZOS).save(bundle)
    print("wrote", bundle)


if __name__ == "__main__":
    main()
