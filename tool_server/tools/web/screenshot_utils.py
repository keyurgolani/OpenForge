"""PNG-to-JPEG screenshot compression utilities."""

from __future__ import annotations

from io import BytesIO

from PIL import Image

_MAX_SCREENSHOT_BYTES = 1_048_576  # 1 MB after JPEG compression
_JPEG_QUALITY = 80


def _compress_screenshot(png_bytes: bytes, quality: int = _JPEG_QUALITY) -> bytes:
    """Convert a PNG screenshot to JPEG with quality optimisation.

    * RGBA images are composited onto a white background before conversion
      (JPEG does not support alpha channels).
    * Other non-RGB modes (e.g. palette, greyscale) are converted to RGB.

    Returns the raw JPEG bytes.
    """
    img = Image.open(BytesIO(png_bytes))

    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    buf = BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()
