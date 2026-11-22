# -*- coding: utf-8 -*-
"""针对反复失败的个别篇目：长间隔、多轮重试，必要时按句切分再拼接"""
import asyncio
import json
import os
import subprocess
import sys

import edge_tts
import imageio_ffmpeg

# 语料与脚本同目录：不依赖从哪个目录运行
_AUDIO = os.path.dirname(os.path.abspath(__file__))

VOICE = "zh-CN-YunjianNeural"
RATE = "+0%"
OUT_DIR = os.path.join("public", "audio", "listen")
MIN_BYTES = 10240
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def good(p, expect_min):
    if not os.path.exists(p) or os.path.getsize(p) < MIN_BYTES:
        return False
    # 粗略：32-48kbps 下每分钟约 300-400KB，低于一半视为残片
    return os.path.getsize(p) > expect_min * 60 * 1000 * 0.15


async def one(item):
    dst = os.path.join(OUT_DIR, f"{item['id']}.mp3")
    for attempt in range(12):
        try:
            tts = edge_tts.Communicate(item["script"], VOICE, rate=RATE)
            await tts.save(dst)
            if good(dst, item["minutes"]):
                print(f"  ✓ {item['id']} {os.path.getsize(dst)//1024} KB（第 {attempt+1} 次）", flush=True)
                return True
            print(f"  ! {item['id']} 第{attempt+1}次产出过小，重试", flush=True)
        except Exception as e:
            print(f"  ✗ {item['id']} 第{attempt+1}次 {str(e).splitlines()[0][:70]}", flush=True)
        await asyncio.sleep(8 + attempt * 3)
    return False


async def by_parts(item):
    """整段一直失败：按句号切块，每块单独合成，再用 ffmpeg 拼接"""
    parts = [s for s in item["script"].replace("！", "。").replace("？", "。").split("。") if s.strip()]
    chunks, buf = [], ""
    for s in parts:
        buf += s + "。"
        if len(buf) > 180:
            chunks.append(buf)
            buf = ""
    if buf:
        chunks.append(buf)
    tmp = []
    for i, c in enumerate(chunks):
        f = os.path.join(".tmp-parts", f"{item['id']}-{i}.mp3")
        os.makedirs(".tmp-parts", exist_ok=True)
        ok = False
        for a in range(6):
            try:
                await edge_tts.Communicate(c, VOICE, rate=RATE).save(f)
                if os.path.getsize(f) > 3000:
                    ok = True
                    break
            except Exception:
                pass
            await asyncio.sleep(5)
        if not ok:
            print(f"  ✗ 分块 {i} 失败", flush=True)
            return False
        tmp.append(f)
    lst = os.path.join(".tmp-parts", f"{item['id']}.txt")
    with open(lst, "w", encoding="utf-8") as f:
        for t in tmp:
            f.write(f"file '{os.path.abspath(t).replace(chr(92), '/')}'\n")
    dst = os.path.join(OUT_DIR, f"{item['id']}.mp3")
    r = subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst,
                        "-c", "copy", dst], capture_output=True)
    if r.returncode == 0 and good(dst, item["minutes"]):
        print(f"  ✓ {item['id']} 分段拼接成功 {os.path.getsize(dst)//1024} KB", flush=True)
        return True
    print(f"  ✗ 拼接失败 {r.stderr.decode('utf-8','ignore')[:100]}", flush=True)
    return False


async def main():
    ids = sys.argv[1:]
    with open(os.path.join(_AUDIO, "listen-scripts.json"), "r", encoding="utf-8") as f:
        allitems = {i["id"]: i for i in json.load(f)}
    for i in ids:
        it = allitems[i]
        print(f"[{i}] {it['title']}", flush=True)
        ok = await one(it)
        if not ok:
            print(f"  → 改用分段合成", flush=True)
            ok = await by_parts(it)
        print(f"  {'完成' if ok else '仍失败'}", flush=True)


asyncio.run(main())
