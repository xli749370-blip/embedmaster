# -*- coding: utf-8 -*-
"""
听学音频批量生成（edge-tts 微软神经音色，免费无 Key）

输入 listen-scripts.json（node export-listen.mjs 生成，205 篇）
输出 public/audio/listen/{id}.mp3 + manifest.json

频道：
  lecture  讲义精听 42    circuit 电路门诊 60   parts 元器件图鉴 35
  code     代码兵器谱 47  pitfall 实战避坑 15   esp32 ESP32 平台 6

音色：YunjianNeural（沉稳男声）+0%
  —— 比学习页的 +4% 慢一点便于边想边听，又不至于像冥想页 -4% 那样催睡

运行：python gen-listen-audio.py [--only lecture,circuit]
断点续传 + 完整性校验（时长不足预估 70% 视为上次中断的残file，重新合成）
"""
import asyncio
import json
import os
import struct
import sys

import edge_tts

VOICE = "zh-CN-YunjianNeural"
RATE = "+0%"
OUT_DIR = os.path.join("public", "audio", "listen")
SRC = "listen-scripts.json"
MIN_BYTES = 10240
ROUNDS = 4            # 失败重试轮数
GAP = 1.0             # 每篇之间的间隔（秒），避免触发服务端限流
CONCURRENCY = 4       # 并发连接数（过多会触发网络重置）

# MPEG Layer3 比特率表：必须按版本区分！edge-tts 输出 24kHz 属于 MPEG2，
# 用 MPEG1 的表解析会把 48kbps 读成 80kbps，时长被低估 → 误判「截断」反复重合成
BR_TABLE = {
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],  # MPEG1
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],      # MPEG2
    0: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],      # MPEG2.5
}
SR_TABLE = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def mp3_seconds(path: str) -> float:
    """按首帧比特率估算时长（edge-tts 输出为 CBR，够用）"""
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        head = f.read(8192)
    i = head.find(b"\xff")
    while 0 <= i < len(head) - 4:
        h = head[i:i + 4]
        if h[0] == 0xFF and (h[1] & 0xE0) == 0xE0:
            ver = (h[1] >> 3) & 3
            layer = (h[1] >> 1) & 3
            bi = (h[2] >> 4) & 0x0F
            si = (h[2] >> 2) & 0x03
            if ver != 1 and layer == 1 and 0 < bi < 15 and si != 3:
                br = BR_TABLE.get(ver, BR_TABLE[1])[bi] * 1000
                return size * 8 / br
        i = head.find(b"\xff", i + 1)
    # 解析失败就按 48kbps 估
    return size * 8 / 48000


def ok_file(path: str, expect_min: float) -> bool:
    if not os.path.exists(path) or os.path.getsize(path) < MIN_BYTES:
        return False
    # 残文件检测：时长明显短于预估（<50%）说明上次写到一半断了。
    # 阈值不能太高——英文标识符多的篇目实际语速快，实测时长可能只有预估的 60~70%
    return mp3_seconds(path) >= max(15, expect_min * 60 * 0.5)


async def synth(item: dict) -> bool:
    fname = f"{item['id']}.mp3"
    fpath = os.path.join(OUT_DIR, fname)
    for attempt in range(3):
        try:
            tts = edge_tts.Communicate(item["script"], VOICE, rate=RATE)
            await tts.save(fpath)
            if ok_file(fpath, item.get("minutes", 1)):
                return True
            print(f"  ! {fname} 时长不足，重新合成", flush=True)
        except Exception as e:
            msg = str(e).split("\n")[0][:90]
            print(f"  ✗ {fname} 第{attempt + 1}次: {msg}", flush=True)
            await asyncio.sleep(1.5 * (attempt + 1))
    return False


async def main():
    args = sys.argv[1:]
    only = None
    if "--only" in args:
        only = set(args[args.index("--only") + 1].split(","))

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(SRC, "r", encoding="utf-8") as f:
        items = json.load(f)
    if only:
        items = [i for i in items if i["channel"] in only]

    print(f"共 {len(items)} 篇，音色 {VOICE}，语速 {RATE}", flush=True)
    pending = []
    for it in items:
        p = os.path.join(OUT_DIR, f"{it['id']}.mp3")
        if ok_file(p, it.get("minutes", 1)):
            continue
        pending.append(it)
    print(f"已完成 {len(items) - len(pending)} 篇，待合成 {len(pending)} 篇", flush=True)

    for rnd in range(ROUNDS):
        if not pending:
            break
        print(f"\n--- 第 {rnd + 1} 轮：{len(pending)} 篇 ---", flush=True)
        sem = asyncio.Semaphore(CONCURRENCY)
        done = [0]

        async def run_one(it):
            async with sem:
                ok = await synth(it)
                done[0] += 1
                print(f"  {'✓' if ok else '✗'} [{done[0]}/{len(pending)}] {it['id']} {it['title'][:22]}", flush=True)
                await asyncio.sleep(GAP)
                return it, ok

        # 单篇失败只记录（synth 内部已重试），不再让整批一起崩
        results = await asyncio.gather(*[run_one(it) for it in pending], return_exceptions=True)
        still = []
        for it, r in zip(pending, results):
            if isinstance(r, BaseException):
                print(f"  !! {it['id']} 异常 {type(r).__name__}", flush=True)
                still.append(it)
            elif not r[1]:
                still.append(it)
        pending = still
        if pending:
            print(f"  本轮剩余 {len(pending)} 篇，等 6 秒再试", flush=True)
            await asyncio.sleep(6)

    # 汇总 manifest（合并已有条目，支持分批）
    entries = []
    mpath = os.path.join(OUT_DIR, "manifest.json")
    old = {}
    if os.path.exists(mpath):
        try:
            with open(mpath, "r", encoding="utf-8") as f:
                for e in json.load(f).get("entries", []):
                    old[e["id"]] = e
        except Exception:
            old = {}
    # 篇目顺序以导出稿为准（字符串排序会把 C-1、C-10、C-2 排乱）
    with open(SRC, "r", encoding="utf-8") as f:
        order = {it["id"]: i for i, it in enumerate(json.load(f))}
    missing = []
    for it in items:
        fname = f"{it['id']}.mp3"
        fpath = os.path.join(OUT_DIR, fname)
        # 0 字节的“空壳”也算缺失：连接失败时 edge-tts 会建出空文件
        if not os.path.exists(fpath) or os.path.getsize(fpath) < MIN_BYTES:
            missing.append(it["id"])
            continue
        old[it["id"]] = {
            "id": it["id"], "channel": it["channel"], "title": it["title"],
            "sub": it.get("sub", ""), "ref": it.get("ref", ""),
            "minutes": it.get("minutes", 0), "file": f"audio/listen/{fname}",
            "bytes": os.path.getsize(fpath),
        }
    entries = sorted(old.values(), key=lambda x: order.get(x["id"], 9999))
    with open(mpath, "w", encoding="utf-8") as f:
        json.dump({"voice": VOICE, "rate": RATE, "entries": entries}, f, ensure_ascii=False, indent=1)

    total = sum(e["bytes"] for e in entries)
    print(f"\n完成 {len(entries)} 篇，合计 {total / 1024 / 1024:.1f} MB", flush=True)
    if missing:
        print(f"!! 仍缺 {len(missing)} 篇：{','.join(missing[:20])}", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
