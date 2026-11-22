# -*- coding: utf-8 -*-
"""
听学音频体积压缩：48kbps → 32kbps 单声道（语音足够，体积降到 2/3）

背景：全站音频 225MB，直接内置进 APK 会让安装包涨到 230MB+。
     语音内容在 32kbps 下听感几乎无差别，体积能压到约 150MB。

流程：
  1. 用 ffmpeg 逐个转码到 .tmp-transcode/{group}/{file}
  2. 原目录整体改名留档到 ../emb-archive/audio-48k-1120
  3. 转码结果搬回原位
  4. 更新各 manifest 里的 bytes（按实际文件大小）

运行：python transcode-audio.py
"""
import json
import os
import shutil
import subprocess
import sys

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
GROUPS = ["learn", "meditate", "proj", "listen"]
ROOT = os.path.join("public", "audio")
TMP = os.path.join(".tmp-transcode")
ARCHIVE = os.path.join("..", "emb-archive", "audio-48k-1120")
BITRATE = "32k"


def transcode(src: str, dst: str) -> bool:
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    cmd = [
        FFMPEG, "-y", "-loglevel", "error", "-i", src,
        "-c:a", "libmp3lame", "-b:a", BITRATE, "-ac", "1", "-ar", "24000",
        dst,
    ]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0 or not os.path.exists(dst) or os.path.getsize(dst) < 1024:
        print(f"  ✗ {src} -> {r.stderr.decode('utf-8', 'ignore')[:120]}")
        return False
    return True


def main():
    only = sys.argv[1:] or GROUPS
    groups = [g for g in GROUPS if g in only]

    total_in = total_out = 0
    files = 0
    for g in groups:
        src_dir = os.path.join(ROOT, g)
        if not os.path.isdir(src_dir):
            continue
        names = [f for f in os.listdir(src_dir) if f.endswith(".mp3")]
        print(f"[{g}] {len(names)} 个文件")
        for f in names:
            src = os.path.join(src_dir, f)
            dst = os.path.join(TMP, g, f)
            if not transcode(src, dst):
                return 1
            total_in += os.path.getsize(src)
            total_out += os.path.getsize(dst)
            files += 1
            if files % 50 == 0:
                print(f"  ... {files} 个，已压到 {total_out / 1024 / 1024:.1f} MB", flush=True)

    print(f"\n转码完成 {files} 个：{total_in / 1024 / 1024:.1f} MB → {total_out / 1024 / 1024:.1f} MB "
          f"（省 {100 - total_out * 100 / max(total_in, 1):.0f}%）")

    # 原目录留档，新文件就位
    os.makedirs(ARCHIVE, exist_ok=True)
    for g in groups:
        src_dir = os.path.join(ROOT, g)
        new_dir = os.path.join(TMP, g)
        if not os.path.isdir(new_dir):
            continue
        keep = os.path.join(ARCHIVE, g)
        if os.path.exists(keep):
            # 不删除旧留档，加时间戳另存，避免重复执行时误删
            import time
            keep = f"{keep}-{time.strftime('%H%M%S')}"
        shutil.move(src_dir, keep)
        shutil.move(new_dir, src_dir)
    print(f"原 48k 音频已留档到 {ARCHIVE}")

    # 更新 manifest 里的 bytes
    for g in groups:
        mp = os.path.join(ROOT, g, "manifest.json")
        if not os.path.exists(mp):
            continue
        with open(mp, "r", encoding="utf-8") as f:
            m = json.load(f)

        def walk(node):
            if isinstance(node, dict):
                if isinstance(node.get("bytes"), int) and isinstance(node.get("file"), str):
                    p = os.path.join("public", node["file"].replace("/", os.sep))
                    if os.path.exists(p):
                        node["bytes"] = os.path.getsize(p)
                for v in node.values():
                    walk(v)
            elif isinstance(node, list):
                for v in node:
                    walk(v)

        walk(m)
        with open(mp, "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False, indent=1)
        print(f"  已更新 {g}/manifest.json")

    total = sum(
        os.path.getsize(os.path.join(ROOT, g, f))
        for g in GROUPS if os.path.isdir(os.path.join(ROOT, g))
        for f in os.listdir(os.path.join(ROOT, g)) if f.endswith(".mp3")
    )
    print(f"\n音频总量：{total / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    sys.exit(main() or 0)
