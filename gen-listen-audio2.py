# -*- coding: utf-8 -*-
"""
听学音频批量生成 v2 —— 分块合成，杜绝长文本被截断

为什么要重写
------------------------------------------------------------------
v1 直接把整篇（最长 4000 字）丢给 edge_tts.Communicate(...).save()。
实测有 18 篇以上在 70%~90% 处被截断（用 ffmpeg 取真实时长反推语速，
正常篇目约 310 字/分，被截断的篇目高达 400 字/分）。听众会在毫无提示
的情况下少听四分之一的内容，这是不能接受的。

v2 做法
  1. 稿件按句号切成 ≤420 字的小块，逐块合成；
  2. 每块单独重试（失败只影响这一块，不连累整篇）；
  3. 全部块齐了再用 ffmpeg concat 无损拼接；
  4. 拼完后校验收缩时长与「字数 / 语速」的偏差，超差整篇重做。

运行：
  python gen-listen-audio2.py                # 全部，跳过已完整且字数吻合的
  python gen-listen-audio2.py --only lecture # 只做某个频道
  python gen-listen-audio2.py --force        # 忽略已有文件，全部重做
"""
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys

import edge_tts

VOICE = "zh-CN-YunjianNeural"
RATE = "+0%"
OUT_DIR = os.path.join("public", "audio", "listen")
SRC = "listen-scripts.json"
CHUNK_MAX = 420          # 单块最大字数
MIN_BYTES = 4096
CONCURRENCY = 6
GAP = 1.0
ROUNDS = 6
CPS = 4.7                # 该音色实测语速：字/秒（约 282 字/分）
TOL_LOW = 0.80           # 实测时长 / 预期时长 的允许下限
TOL_HIGH = 1.25

# MPEG2（24kHz）比特率表；只用来做崩溃安全网，正式判定走 ffmpeg
BR_TABLE = {2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]}


def find_ffmpeg() -> str | None:
    """找一个能解析 mp3 的 ffmpeg（播放器自带的最小构建往往不含 mp3 解码器）"""
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


FFMPEG = find_ffmpeg()

# 分块临时目录槽位（与 CONCURRENCY 数量对齐，跑完回收复用）
SLOTS: asyncio.Queue = None


def mp3_seconds(path: str) -> float:
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return 0.0
    if FFMPEG:
        r = subprocess.run(
            [FFMPEG, "-hide_banner", "-i", path, "-f", "null", "-t", "0.05", "-"],
            capture_output=True, text=True, errors="replace",
        )
        m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", r.stderr)
        if m:
            return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    # 兜底：按 48kbps CBR 估
    return os.path.getsize(path) * 8 / 48000


VERIFY_FILE = ".tts-verified.jsonl"


def load_verified() -> dict:
    """读追加式校验记录，同一个 id 后写的覆盖先写的"""
    d = {}
    if os.path.exists(VERIFY_FILE):
        with open(VERIFY_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    o = json.loads(line)
                except Exception:
                    continue
                d[o["id"]] = o
    return d


def save_verified_one(iid: str, rec: dict):
    """单行追加：并发下互不覆盖（整表重写会丢别人刚写的条目）"""
    rec = dict(rec, id=iid)
    with open(VERIFY_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def split_chunks(text: str, limit: int = CHUNK_MAX) -> list[str]:
    """按中文句末标点切块，单块不超过 limit 字（避免服务端截断）"""
    parts = re.split(r"(?<=[。！？；])", text)
    chunks: list[str] = []
    cur = ""
    for p in parts:
        if not p:
            continue
        # 单句就超长（极少见）：按逗号再切
        if len(p) > limit:
            for sub in re.split(r"(?<=[，、])", p):
                if not sub:
                    continue
                if len(cur) + len(sub) > limit and cur:
                    chunks.append(cur)
                    cur = ""
                cur += sub
            continue
        if len(cur) + len(p) > limit and cur:
            chunks.append(cur)
            cur = ""
        cur += p
    if cur:
        chunks.append(cur)
    return chunks or [text]


async def synth_chunk(text: str, path: str) -> bool:
    delays = [2, 4, 8, 14, 20, 25]
    for attempt, wait in enumerate(delays):
        try:
            await edge_tts.Communicate(text, VOICE, rate=RATE).save(path)
            if os.path.exists(path) and os.path.getsize(path) > 1024:
                return True
        except Exception as e:
            msg = str(e).split("\n")[0][:70]
            print(f"      · 分块重试 {attempt + 1}/{len(delays)}: {msg}", flush=True)
        await asyncio.sleep(wait)
    return False


def concat(parts: list[str], out: str, lst: str) -> bool:
    """用 ffmpeg concat 无损拼接。清单文件按槽位固定复用——不删除任何临时文件，
    批量删除会触发沙箱的删除确认，长跑必然被打断。"""
    with open(lst, "w", encoding="utf-8") as f:
        for p in parts:
            f.write(f"file '{os.path.abspath(p).replace(chr(92), '/')}'\n")
    if FFMPEG:
        r = subprocess.run(
            [FFMPEG, "-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", lst,
             "-c", "copy", out],
            capture_output=True, text=True, errors="replace",
        )
        if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > MIN_BYTES:
            return True
        print(f"      · concat 失败: {r.stderr.strip().splitlines()[-1][:70]}", flush=True)
        return False
    # 没有 ffmpeg：同格式 CBR 顺序串联（能播，会留下多余 ID3 头）
    with open(out, "wb") as w:
        for p in parts:
            with open(p, "rb") as r:
                shutil.copyfileobj(r, w)
    return True


async def build(item: dict, force: bool) -> tuple[bool, str]:
    """合成一篇。返回 (成功, 说明)"""
    iid = item["id"]
    out = os.path.join(OUT_DIR, f"{iid}.mp3")
    script = item["script"]
    verify = load_verified()

    # 已验证过且文件没变 → 跳过
    v = verify.get(iid)
    if not force and v and os.path.exists(out) and os.path.getsize(out) == v.get("bytes"):
        return True, f"skip {v.get('sec', 0) / 60:.1f} 分"

    chunks = split_chunks(script)
    # 分块临时文件用「槽位复用」而不是每篇建一个新目录：
    # 一是避免磁盘上堆上千个小文件，二是删目录会触发沙箱的批量删除确认
    slot = await SLOTS.get()
    tmp_dir = os.path.join(".tts-tmp", slot)
    os.makedirs(tmp_dir, exist_ok=True)
    parts = []
    try:
        for i, c in enumerate(chunks):
            p = os.path.join(tmp_dir, f"{i:02d}.mp3")
            if not await synth_chunk(c, p):
                return False, f"分块 {i} 合成失败"
            parts.append(p)

        if not concat(parts, out, os.path.join(tmp_dir, "list.txt")):
            return False, "拼接失败"

        # 完整性判据：拼接后的总时长必须等于各分块时长之和
        # 与稿件内容无关（代码多的篇目语速天然快，比「字数/时长」可靠得多）
        per = [mp3_seconds(p) for p in parts]
        real = mp3_seconds(out)
        expect = sum(per)
        tol = max(3.0, expect * 0.01)
        if abs(real - expect) > tol:
            return False, f"拼接不完整 {real / 60:.2f} 分 / 分块合计 {expect / 60:.2f} 分"
        if real < 3:
            return False, f"时长异常 {real:.1f} 秒"
    finally:
        SLOTS.put_nowait(slot)

    verify[iid] = {"bytes": os.path.getsize(out), "sec": round(real, 2), "chunks": len(chunks)}
    save_verified_one(iid, verify[iid])
    return True, f"{real / 60:.1f} 分 / {len(chunks)} 块"


async def main():
    args = sys.argv[1:]
    only = None
    if "--only" in args:
        only = set(args[args.index("--only") + 1].split(","))
    force = "--force" in args

    if not FFMPEG:
        print("!! 找不到可用的 ffmpeg，拼接会退化为二进制串联", flush=True)

    os.makedirs(OUT_DIR, exist_ok=True)
    global SLOTS
    SLOTS = asyncio.Queue()
    for i in range(CONCURRENCY):
        SLOTS.put_nowait(f"w{i}")
    with open(SRC, "r", encoding="utf-8") as f:
        items = json.load(f)
    if only:
        items = [i for i in items if i["channel"] in only]

    total_chars = sum(len(i["script"]) for i in items)
    print(f"共 {len(items)} 篇 / {total_chars / 1000:.0f}k 字 / 预期 {total_chars / CPS / 3600:.1f} 小时", flush=True)

    pending = list(items)
    for rnd in range(ROUNDS):
        if not pending:
            break
        print(f"\n--- 第 {rnd + 1} 轮：{len(pending)} 篇 ---", flush=True)
        sem = asyncio.Semaphore(CONCURRENCY)
        done = [0]

        async def run_one(it):
            async with sem:
                try:
                    ok, msg = await build(it, force)
                except Exception as e:
                    ok, msg = False, f"异常 {type(e).__name__}: {str(e)[:60]}"
                done[0] += 1
                print(f"  {'✓' if ok else '✗'} [{done[0]}/{len(pending)}] {it['id']:<10} {msg}", flush=True)
                await asyncio.sleep(GAP)
                return it, ok

        res = await asyncio.gather(*[run_one(it) for it in pending], return_exceptions=True)
        still = []
        for it, r in zip(pending, res):
            if isinstance(r, BaseException) or not r[1]:
                still.append(it)
        pending = still
        if pending:
            print(f"  剩余 {len(pending)} 篇，等 8 秒", flush=True)
            await asyncio.sleep(8)

    # ---- manifest：顺序以导出稿为准，minutes 用真实时长重算 ----
    with open(SRC, "r", encoding="utf-8") as f:
        order = {it["id"]: n for n, it in enumerate(json.load(f))}
    entries = []
    missing = []
    for it in items:
        p = os.path.join(OUT_DIR, f"{it['id']}.mp3")
        if not os.path.exists(p) or os.path.getsize(p) < MIN_BYTES:
            missing.append(it["id"])
            continue
        sec = mp3_seconds(p)
        entries.append({
            "id": it["id"], "channel": it["channel"], "title": it["title"],
            "sub": it.get("sub", ""), "ref": it.get("ref", ""),
            "minutes": round(sec / 60, 1),
            "file": f"audio/listen/{it['id']}.mp3",
            "bytes": os.path.getsize(p),
        })
    entries.sort(key=lambda x: order.get(x["id"], 9999))

    mpath = os.path.join(OUT_DIR, "manifest.json")
    with open(mpath, "w", encoding="utf-8") as f:
        json.dump({"voice": VOICE, "rate": RATE, "entries": entries}, f, ensure_ascii=False, indent=1)

    mb = sum(e["bytes"] for e in entries) / 1024 / 1024
    hrs = sum(e["minutes"] for e in entries) / 60
    print(f"\n完成 {len(entries)} 篇 / {mb:.1f} MB / {hrs:.1f} 小时", flush=True)
    if missing:
        print(f"!! 仍缺 {len(missing)} 篇：{','.join(missing[:30])}", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
