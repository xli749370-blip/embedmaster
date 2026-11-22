# -*- coding: utf-8 -*-
"""
听学音频后处理：48kbps → 32kbps 单声道，并重建 manifest

为什么转码
------------------------------------------------------------------
edge-tts 直接输出 48kbps/24kHz/mono，语速内容的有效频带远用不到这么多码率。
压到 32kbps 体积降三分之一，听感几乎无差别（此前 133 段就是这样处理的）。
整包体积直接决定 APK 下载和手机存储占用，这一步值得。

manifest 的 minutes / bytes 全部按转码后的真实文件重算，
不用「字数 / 语速」估算——那套估法对代码密集的篇目会偏。

运行：python listen-fixup.py
"""
import json
import os
import re
import shutil
import subprocess
import sys

OUT_DIR = os.path.join("public", "audio", "listen")
SRC = "listen-scripts.json"
ARCHIVE = os.path.join("..", "emb-archive", "listen-48k")
BITRATE = "32k"
SAMPLE_RATE = "24000"


def find_ffmpeg():
    cands = [
        os.environ.get("FFMPEG", ""),
        shutil.which("ffmpeg") or "",
        # OpenFilm 是完整构建（含 libmp3lame）；xiezuo 那个只有 mp3_mf，
        # 拿它编码会静默产出 0 字节文件，所以完整构建必须排在前面
        os.path.expandvars(r"C:\Users\%USERNAME%\AppData\Local\Programs\OpenFilm\resources\runtime\ffmpeg\ffmpeg.exe"),
        os.path.expandvars(r"C:\Users\%USERNAME%\AppData\Local\Programs\xiezuo\resources\ffmpeg\ffmpeg.exe"),
    ]
    for c in cands:
        if c and os.path.exists(c):
            return c
    return None


def duration(ff, path):
    r = subprocess.run([ff, "-hide_banner", "-i", path, "-f", "null", "-t", "0.05", "-"],
                       capture_output=True, text=True, errors="replace")
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", r.stderr)
    if not m:
        return 0.0
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def main():
    ff = find_ffmpeg()
    if not ff:
        print("!! 找不到 ffmpeg")
        sys.exit(1)
    os.makedirs(ARCHIVE, exist_ok=True)

    files = sorted(f for f in os.listdir(OUT_DIR) if f.endswith(".mp3"))
    print(f"共 {len(files)} 个文件待转码", flush=True)
    tmp_dir = ".transcode-tmp"
    os.makedirs(tmp_dir, exist_ok=True)
    failed = []
    for n, f in enumerate(files, 1):
        src = os.path.join(OUT_DIR, f)
        tmp = os.path.join(tmp_dir, f)
        r = subprocess.run([ff, "-hide_banner", "-y", "-i", src, "-ac", "1",
                            "-ar", SAMPLE_RATE, "-c:a", "libmp3lame", "-b:a", BITRATE, tmp],
                           capture_output=True, text=True, errors="replace")
        if r.returncode != 0 or not os.path.exists(tmp) or os.path.getsize(tmp) < 2048:
            print(f"  ✗ {f} 转码失败", flush=True)
            failed.append(f)
            continue
        # 原文件留档（不删，按项目惯例一律 mv）
        shutil.move(src, os.path.join(ARCHIVE, f))
        shutil.move(tmp, src)
        if n % 20 == 0:
            print(f"  · {n}/{len(files)}", flush=True)

    shutil.rmtree(tmp_dir, ignore_errors=True)

    # ---- 重建 manifest：顺序照抄导出稿，时间与字节按实际文件 ----
    with open(SRC, "r", encoding="utf-8") as f:
        scripts = json.load(f)
    order = {s["id"]: i for i, s in enumerate(scripts)}
    by_id = {s["id"]: s for s in scripts}
    mpath = os.path.join(OUT_DIR, "manifest.json")
    old = {}
    if os.path.exists(mpath):
        with open(mpath, "r", encoding="utf-8") as f:
            for e in json.load(f).get("entries", []):
                old[e["id"]] = e

    entries = []
    for iid, o in old.items():
        p = os.path.join(OUT_DIR, f"{iid}.mp3")
        if not os.path.exists(p):
            continue
        sec = duration(ff, p)
        s = by_id.get(iid, {})
        entries.append({
            "id": iid,
            "channel": o.get("channel") or s.get("channel"),
            "title": o.get("title") or s.get("title"),
            "sub": o.get("sub") or s.get("sub", ""),
            "ref": o.get("ref") or s.get("ref", ""),
            "minutes": round(sec / 60, 1),
            "file": f"audio/listen/{iid}.mp3",
            "bytes": os.path.getsize(p),
        })
    entries.sort(key=lambda x: order.get(x["id"], 9999))

    with open(mpath, "w", encoding="utf-8") as f:
        json.dump({"voice": "zh-CN-YunjianNeural", "rate": "+0%", "entries": entries},
                  f, ensure_ascii=False, indent=1)

    mb = sum(e["bytes"] for e in entries) / 1048576
    hrs = sum(e["minutes"] for e in entries) / 60
    print(f"\nmanifest 重建完成：{len(entries)} 篇 / {mb:.1f} MB / {hrs:.1f} 小时")
    # 顺带把总时长写成一个小文件，方便首页文案取数
    if failed:
        print(f"!! {len(failed)} 个文件转码失败：{' '.join(failed[:20])}")
        sys.exit(1)


if __name__ == "__main__":
    main()
