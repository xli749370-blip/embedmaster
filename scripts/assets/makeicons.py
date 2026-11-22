"""生成 PWA 应用图标（与站内 favicon 同一套视觉：工程蓝圆角底 + 三条白色「文字条」）。

输出：
- public/pwa-192.png / pwa-512.png        常规图标（圆角、透明四角）
- public/pwa-maskable-512.png             maskable 图标（满幅出血，内容缩进安全区）
"""

from PIL import Image, ImageDraw

SIZE = 512
BG_TOP = (58, 104, 247)    # brand-500
BG_BOT = (30, 48, 175)     # brand-800 附近，做一点对角渐变
WHITE = (255, 255, 255, 255)


def rounded_gradient(size: int, radius: int, bleed: bool) -> Image.Image:
    """画一个对角渐变的圆角方块；maskable 版本不做圆角（系统会自己裁）"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    box = (0, 0, size - 1, size - 1)
    # 逐行插值出对角渐变（用横向线段近似：亮度随 x+y 变化）
    grad = Image.new("RGBA", (size, size))
    gd = ImageDraw.Draw(grad)
    for y in range(size):
        t = y / (size - 1)
        r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        gd.line([(0, y), (size, y)], fill=(r, g, b, 255))
    if bleed:
        img = grad
    else:
        mask = Image.new("L", (size, size), 0)
        md = ImageDraw.Draw(mask)
        md.rounded_rectangle(box, radius=radius, fill=255)
        img.paste(grad, (0, 0), mask)
    return img


def draw_bars(img: Image.Image, scale: float, offset: float):
    """画三条圆头白条：与 favicon 的三行「文字」一致（viewBox 32 坐标）。

    scale：内容相对 32 格的缩放；offset：32 格坐标系里的居中偏移量。
    """
    d = ImageDraw.Draw(img)
    unit = img.size[0] / 32.0

    def px(v: float) -> float:
        return (v * scale + offset) * unit

    lines = [
        (9, 10, 23, 10),   # x1,y1,x2,y2（viewBox 32 坐标）
        (9, 16, 18, 16),
        (9, 22, 23, 22),
    ]
    width = 2.6 * scale * unit
    r = width / 2
    for x1, y1, x2, y2 in lines:
        d.rounded_rectangle(
            (px(x1) - r, px(y1) - r, px(x2) + r, px(y2) + r),
            radius=r,
            fill=WHITE,
        )


def regular(size: int):
    img = rounded_gradient(size, radius=int(size * 0.22), bleed=False)
    draw_bars(img, scale=0.86, offset=(1 - 0.86) * 32 / 2)
    return img


def maskable(size: int):
    img = rounded_gradient(size, radius=0, bleed=True)
    # 内容缩进安全区：占 66%，居中
    scale = 0.66
    draw_bars(img, scale=scale, offset=(1 - scale) * 32 / 2)
    return img


import os

os.makedirs("public", exist_ok=True)
regular(512).save("public/pwa-512.png")
regular(192).save("public/pwa-192.png")
maskable(512).save("public/pwa-maskable-512.png")
print("icons written: pwa-192.png / pwa-512.png / pwa-maskable-512.png")
