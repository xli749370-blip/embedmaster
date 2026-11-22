"""生成 App 下载二维码（扫码直接下载 EmbedMaster.apk）。

复用 makeqr.py 的绘制逻辑，只换 URL 与文案。
"""

import qrcode
from qrcode.constants import ERROR_CORRECT_M
from PIL import Image, ImageDraw, ImageFont

URL = "https://embedmaster-learning.app.workbuddy.host/EmbedMaster.apk?sharecode=ZHZM54FTXL"

MODULE = 16
QUIET = 4
PAD = 56
TOP = 128
BOTTOM = 128

qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_M, box_size=1, border=0)
qr.add_data(URL)
qr.make(fit=True)
matrix = qr.get_matrix()
n = len(matrix)

qr_px = n * MODULE
W = qr_px + PAD * 2
H = TOP + qr_px + BOTTOM

img = Image.new("RGB", (W, H), "#ffffff")
d = ImageDraw.Draw(img)


def font(size, bold=False):
    candidates = [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyhbd.ttf" if bold else r"C:\Windows\Fonts\msyh.ttf",
        r"C:\Windows\Fonts\simhei.ttf",
    ]
    for p in candidates:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def center_text(y, text, f, fill):
    box = d.textbbox((0, 0), text, font=f)
    d.text(((W - (box[2] - box[0])) / 2 - box[0], y), text, font=f, fill=fill)


center_text(40, "EmbedMaster App 下载", font(30, True), "#0f172a")
center_text(84, "手机扫码直接下载安装包（Android 5.1+）", font(19), "#64748b")

qx = PAD
qy = TOP
d.rectangle([qx - 8, qy - 8, qx + qr_px + 7, qy + qr_px + 7], fill="#ffffff", outline="#e2e8f0", width=2)

radius = MODULE * 0.28
for r in range(n):
    for c in range(n):
        if not matrix[r][c]:
            continue
        x0 = qx + c * MODULE
        y0 = qy + r * MODULE
        is_anchor = (r < 7 and c < 7) or (r < 7 and c >= n - 7) or (r >= n - 7 and c < 7)
        if is_anchor:
            d.rectangle([x0, y0, x0 + MODULE - 1, y0 + MODULE - 1], fill="#0f172a")
        else:
            d.rounded_rectangle(
                [x0 + 1, y0 + 1, x0 + MODULE - 2, y0 + MODULE - 2],
                radius=radius,
                fill="#0f172a",
            )

by = qy + qr_px + 34
center_text(by, "下载后点开安装，首次需允许「未知来源应用」", font(16), "#334155")
center_text(by + 30, "安装包约 5MB · 内容全部离线内置", font(15), "#94a3b8")

img.save("qr-apk.png")
print("saved qr-apk.png", img.size, f"matrix {n}x{n}")
