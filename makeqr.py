"""生成线上站点入口二维码（手机扫码直接打开，不需要热点）。

设计要点：
1. 模块自己绘制而不是用 qrcode 自带 image factory —— 这样才能做圆角模块，扫起来也更清晰；
2. 纠错等级 M + 每个模块 16px，保证手机在稍远/稍糊的情况下也能识别；
3. 四周留足静区（quiet zone，至少 4 个模块宽），否则很多扫描器识别率会明显下降。
"""

import qrcode
from qrcode.constants import ERROR_CORRECT_M
from PIL import Image, ImageDraw, ImageFont

URL = "https://embedmaster-learning.app.workbuddy.host/?sharecode=ZHZM54FTXL"

MODULE = 16          # 每个二维码模块的像素尺寸
QUIET = 4            # 静区（模块数）
PAD = 56             # 卡片内边距
TOP = 128            # 顶部标题区高度
BOTTOM = 128         # 底部说明区高度

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
    """优先用系统里的中文字体，找不到就退回默认字体。"""
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


# ---------- 顶部标题 ----------
center_text(44, "EmbedMaster 嵌入式学习平台", font(30, True), "#0f172a")
center_text(86, "手机扫码直接打开 · 不需要连热点", font(19), "#64748b")

# ---------- 二维码 ----------
qx = PAD
qy = TOP
# 白底 + 细边框，让静区和页面背景分得开
d.rectangle([qx - 8, qy - 8, qx + qr_px + 7, qy + qr_px + 7], fill="#ffffff", outline="#e2e8f0", width=2)

radius = MODULE * 0.28
for r in range(n):
    for c in range(n):
        if not matrix[r][c]:
            continue
        x0 = qx + c * MODULE
        y0 = qy + r * MODULE
        # 三个定位角做成实心，扫描器靠它们定位，圆角反而更稳
        is_anchor = (r < 7 and c < 7) or (r < 7 and c >= n - 7) or (r >= n - 7 and c < 7)
        if is_anchor:
            d.rectangle([x0, y0, x0 + MODULE - 1, y0 + MODULE - 1], fill="#0f172a")
        else:
            d.rounded_rectangle(
                [x0 + 1, y0 + 1, x0 + MODULE - 2, y0 + MODULE - 2],
                radius=radius,
                fill="#0f172a",
            )

# ---------- 底部链接 ----------
by = qy + qr_px + 34
center_text(by, "如需手动输入：", font(16), "#94a3b8")
center_text(by + 26, "embedmaster-learning.app.workbuddy.host", font(17, True), "#334155")
center_text(by + 54, "sharecode ZHZM54FTXL", font(15), "#94a3b8")

img.save("qr-online.png")
print("saved qr-online.png", img.size, f"matrix {n}x{n}", f"modules {MODULE}px")
