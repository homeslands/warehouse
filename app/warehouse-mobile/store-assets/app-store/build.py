"""Dựng ảnh App Store cho Soko: 5 screenshot dọc (iPhone 6.9") + Header / Search Results / Universal.

Chạy (trong app/warehouse-mobile):  python3 store-assets/app-store/build.py [--debug]
Cần: Google Chrome (render headless) + Pillow. Ảnh ra ở store-assets/app-store/out/.
--debug: vẽ thêm khung đỏ "art safe area" lên ảnh ngang để kiểm tra (file *-guide.png).

Ảnh chụp màn hình gốc (1320×2868, Simulator iPhone 17 Pro Max) ở store-assets/app-store/screens/.
Thông số ảnh ngang theo https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/
(không alpha; Universal bắt buộc PNG). Screenshot 6.9": 1320×2868.
"""

import base64
import io
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
APP = HERE.parent.parent
SCREENS = HERE / "screens"
OUT = HERE / "out"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

BG = "#0a0a0a"
ACCENT = "#3b9eff"  # xanh dương hệ thống, sáng hơn chút cho nền tối
FONT = '-apple-system,"SF Pro Display",system-ui,sans-serif'

# Screenshot dọc: (file, tiêu đề — <em> = chữ nhấn màu, mô tả)
SHOTS = [
    ("01-overview", "Nắm tình hình kho<br><em>trong một màn</em>",
     "Hạn dùng, tiền nhập xuất và việc cần làm, xem theo ngày, tuần, tháng."),
    ("02-import-list", "Phiếu nhập<br><em>tìm là thấy</em>",
     "Tìm theo mã phiếu, số hoá đơn hoặc PO. Lọc nhanh theo trạng thái."),
    ("03-import-detail", "Duyệt phiếu nhập<br><em>ngay tại kho</em>",
     "Đủ bên bán, số hoá đơn và từng dòng vật tư trước khi xác nhận."),
    ("04-export-detail", "Xuất kho<br><em>rõ từng lô</em>",
     "Biết xuất cho ai, lô nào, hạn dùng và giá trị bao nhiêu."),
    ("05-stock", "Tồn kho<br><em>nhìn là biết</em>",
     "Vật tư hết, thiếu hay vượt định mức đều được đánh dấu."),
]
SHOT_W, SHOT_H = 1320, 2868

# Ảnh ngang: name, W, H, art safe area (x, y, w, h)
BANNERS = [
    ("header-3840x1646", 3840, 1646, (1097, 493, 1646, 661)),
    ("search-results-3840x2560", 3840, 2560, (836, 765, 2168, 1030)),
    ("universal-5244x2950", 5244, 2950, (1921, 660, 1402, 962)),
]
BANNER_TAGLINE = "Nhập · Xuất · Tồn kho<br>ngay trên điện thoại"
# Thứ tự vẽ: máy sau trái, máy sau phải, máy trước (giữa)
BANNER_PHONES = ["02-import-list", "05-stock", "01-overview"]

ICONS = ["warehouse", "package", "scan-barcode", "boxes", "truck", "clipboard-check"]


# ---------- tài nguyên ----------

def data_uri(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def wordmark() -> tuple[str, float]:
    """Chữ 'Soko' trắng cắt sát từ splash tối → (data URI, rộng/cao)."""
    img = Image.open(APP / "assets" / "splash-icon-dark.png").convert("RGBA")
    img = img.crop(img.getchannel("A").getbbox())
    return data_uri(img), img.width / img.height


def screen_uri(name: str) -> str:
    return (SCREENS / f"{name}.png").as_uri()


def lucide_svg_inner(name: str) -> str:
    src = (APP / "node_modules/lucide-react-native/dist/esm/icons" / f"{name}.mjs").read_text()
    parts = []
    for tag, attrs in re.findall(r'\[\s*"(\w+)",\s*\{(.*?)\}\s*\]', src, re.S):
        kv = " ".join(f'{k}="{v}"' for k, v in re.findall(r'(\w+): "([^"]*)"', attrs) if k != "key")
        parts.append(f"<{tag} {kv}/>")
    return "".join(parts)


# ---------- khối dựng ----------

def phone(x: float, y: float, w: float, src: str, z: int = 1) -> str:
    """Khung iPhone đời mới (viền mỏng, Dynamic Island) chứa ảnh chụp. (x, y) = góc trên trái, w = rộng ngoài."""
    pad = w * 0.024
    sw = w - 2 * pad
    sh = sw * SHOT_H / SHOT_W
    r_screen = sw * 0.125
    island = (
        f'<div style="position:absolute;left:50%;top:{pad + sw * 0.026:.1f}px;width:{sw * 0.286:.1f}px;'
        f'height:{sw * 0.084:.1f}px;transform:translateX(-50%);background:#000;border-radius:999px"></div>'
    )
    btn = lambda side, top, h: (  # noqa: E731 — nút cạnh máy
        f'<div style="position:absolute;{side}:{-w * 0.008:.1f}px;top:{top:.1f}px;width:{w * 0.01:.1f}px;'
        f'height:{h:.1f}px;background:#2c2c2e;border-radius:{w * 0.004:.1f}px"></div>'
    )
    buttons = btn("left", sh * 0.17, sh * 0.05) + btn("left", sh * 0.25, sh * 0.08) + \
        btn("left", sh * 0.35, sh * 0.08) + btn("right", sh * 0.27, sh * 0.12)
    return (
        f'<div style="position:absolute;left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{sh + 2 * pad:.1f}px;'
        f'z-index:{z};border-radius:{r_screen + pad:.1f}px;background:#1c1c1e;'
        f'box-shadow:0 0 0 {w * 0.004:.1f}px #4a4a4e,inset 0 0 0 {w * 0.003:.1f}px #000,'
        f'0 {w * 0.05:.1f}px {w * 0.14:.1f}px rgba(0,0,0,.6)">'
        f'{buttons}<img src="{src}" style="position:absolute;left:{pad:.1f}px;top:{pad:.1f}px;width:{sw:.1f}px;'
        f'height:{sh:.1f}px;border-radius:{r_screen:.1f}px;display:block">{island}</div>'
    )


def pattern(W: int, H: int, keep_clear: tuple[float, float, float, float], cell: float) -> str:
    """Lưới icon lucide mờ; nhạt dần về 0 quanh vùng `keep_clear` (x, y, w, h)."""
    sx, sy, sw, sh = keep_clear
    size = cell * 0.36
    inner = {n: lucide_svg_inner(n) for n in ICONS}
    out = []
    for r in range(math.ceil(H / cell) + 1):
        for c in range(math.ceil(W / cell) + 1):
            cx = c * cell + (cell / 2 if r % 2 else 0)
            cy = r * cell + cell / 2
            d = math.hypot(max(sx - cx, 0, cx - (sx + sw)), max(sy - cy, 0, cy - (sy + sh)))
            op = min(max((d - cell * 0.35) / (cell * 2.2), 0), 1) * 0.12
            if op < 0.01:
                continue
            name = ICONS[(r * 5 + c * 3) % len(ICONS)]
            out.append(
                f'<g transform="translate({cx - size / 2:.1f},{cy - size / 2:.1f}) scale({size / 24:.4f})" '
                f'opacity="{op:.3f}">{inner[name]}</g>'
            )
    return (
        f'<svg style="position:absolute;inset:0" width="{W}" height="{H}" viewBox="0 0 {W} {H}" fill="none" '
        f'stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{"".join(out)}</svg>'
    )


def page(W: int, H: int, body: str, bg_css: str) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:{BG}}}
body{{position:relative;font-family:{FONT};-webkit-font-smoothing:antialiased}}
.bg{{position:absolute;inset:0;background:{bg_css}}}
em{{font-style:normal;color:{ACCENT}}}
</style></head><body><div class="bg"></div>{body}</body></html>"""


# ---------- bố cục ----------

def shot_html(name: str, title: str, sub: str, logo: str, ratio: float, first: bool) -> str:
    W, H = SHOT_W, SHOT_H
    pw = 1040
    top = 860
    bg = (f"radial-gradient(ellipse 1100px 1300px at 50% {top + 700}px,rgba(59,158,255,.20),transparent 70%),"
          f"linear-gradient(180deg,#0a0a0a 0%,#121316 100%)")
    mark = (f'<img src="{logo}" style="height:64px;width:auto;display:block;margin:0 auto 56px">'
            if first else "")
    text = (
        f'<div style="position:absolute;left:90px;right:90px;top:{170 if first else 230}px;text-align:center">'
        f'{mark}<div style="font-size:112px;font-weight:800;line-height:1.1;letter-spacing:-0.025em;color:#fff">'
        f'{title}</div><div style="margin-top:40px;font-size:44px;line-height:1.35;font-weight:500;color:#a1a1aa">'
        f'{sub}</div></div>'
    )
    return page(W, H, text + phone((W - pw) / 2, top, pw, screen_uri(name)), bg)


def banner_html(W: int, H: int, safe, logo: str, ratio: float, debug: bool) -> str:
    sx, sy, sw, sh = safe
    # Cột chữ: nửa trái vùng an toàn, căn giữa theo chiều dọc.
    logo_h = min(sh * 0.26, sw * 0.36 / ratio)
    tag_px = logo_h * 0.23
    text = (
        f'<div style="position:absolute;left:{sx + sw * 0.05:.0f}px;top:{sy}px;width:{sw * 0.42:.0f}px;height:{sh}px;'
        f'display:flex;flex-direction:column;justify-content:center;gap:{tag_px * 0.9:.0f}px">'
        f'<img src="{logo}" style="height:{logo_h:.0f}px;width:auto;align-self:flex-start;display:block">'
        f'<div style="font-size:{tag_px:.0f}px;line-height:1.3;font-weight:600;color:#d4d4d8;'
        f'letter-spacing:-0.01em">{BANNER_TAGLINE}</div></div>'
    )
    # Cụm 3 máy: nửa phải vùng an toàn; máy có thể tràn xuống vùng phụ (bị cắt cũng không mất ý).
    w = min(sh * 0.62, sw * 0.25)
    cx = sx + sw * 0.74
    top = sy + sh * 0.08
    side_w = w * 0.86
    phones = (
        phone(cx - w * 0.62 - side_w / 2, top + sh * 0.10, side_w, screen_uri(BANNER_PHONES[0]), 1)
        + phone(cx + w * 0.62 - side_w / 2, top + sh * 0.10, side_w, screen_uri(BANNER_PHONES[1]), 1)
        + phone(cx - w / 2, top, w, screen_uri(BANNER_PHONES[2]), 2)
    )
    bg = (f"radial-gradient(ellipse {sw * 0.7:.0f}px {sh * 1.2:.0f}px at {cx:.0f}px {sy + sh * 0.6:.0f}px,"
          f"rgba(59,158,255,.22),transparent 70%),"
          f"radial-gradient(ellipse {sw * 1.1:.0f}px {sh * 1.1:.0f}px at {sx + sw / 2}px {sy + sh / 2}px,#18181b 0%,{BG} 100%)")
    guide = (f'<div style="position:absolute;z-index:9;left:{sx}px;top:{sy}px;width:{sw}px;height:{sh}px;'
             f'outline:6px dashed #ff3b30"></div>') if debug else ""
    cell = round(min(W, H) / 7.5)
    return page(W, H, pattern(W, H, (sx, sy, sw, sh * 1.5), cell) + text + phones + guide, bg)


# ---------- render ----------

def render(name: str, W: int, H: int, html: str, tmp: Path, dest: Path) -> None:
    src = tmp / f"{name}.html"
    src.write_text(html, encoding="utf-8")
    shot = tmp / f"{name}.png"
    subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
         "--allow-file-access-from-files", f"--window-size={W},{H}", f"--screenshot={shot}", src.as_uri()],
        check=True, capture_output=True,
    )
    img = Image.open(shot)
    assert img.size == (W, H), f"{name}: {img.size} != {(W, H)}"
    img.convert("RGB").save(dest, "PNG", optimize=True)  # bỏ kênh alpha
    print(dest.relative_to(APP), Image.open(dest).mode, Image.open(dest).size)


def main() -> None:
    debug = "--debug" in sys.argv
    (OUT / "screenshots").mkdir(parents=True, exist_ok=True)
    logo, ratio = wordmark()
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        if not debug:
            for i, (name, title, sub) in enumerate(SHOTS):
                render(name, SHOT_W, SHOT_H, shot_html(name, title, sub, logo, ratio, i == 0), tmp,
                       OUT / "screenshots" / f"{name}.png")
        for name, W, H, safe in BANNERS:
            render(name, W, H, banner_html(W, H, safe, logo, ratio, debug), tmp,
                   OUT / f"{name}{'-guide' if debug else ''}.png")


if __name__ == "__main__":
    main()
