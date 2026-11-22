# -*- coding: utf-8 -*-
"""
音频完整性校验 + 补漏
- 对 learn-speech.json / project-speech.json 逐条检查 mp3
- 健康比例约 500~1200 字节/字；低于 350 字节/字 或 <10KB 判为截断/缺失 → 删除并重生成
运行：python audio-validate.py
"""
import asyncio
import json
import os
import edge_tts

VOICE = "zh-CN-YunjianNeural"
RATE = "+4%"

JOBS = [
    ("learn-speech.json", os.path.join("public", "audio", "learn"),
     lambda it: (f"{it['course']}-{it['id']}.mp3", it["text"])),
    ("project-speech.json", os.path.join("public", "audio", "proj"),
     lambda it: (f"{it['projectId']}-{it['stageId']}.mp3", it["text"])),
]

async def main():
    for jsonfile, outdir, namefn in JOBS:
        with open(jsonfile, "r", encoding="utf-8") as f:
            items = json.load(f)
        os.makedirs(outdir, exist_ok=True)
        bad = []
        for it in items:
            fname, text = namefn(it)
            fpath = os.path.join(outdir, fname)
            if not os.path.exists(fpath) or os.path.getsize(fpath) < 10240:
                bad.append((it, fname, fpath, "缺失"))
                continue
            ratio = os.path.getsize(fpath) / max(1, len(text))
            if ratio < 350:
                bad.append((it, fname, fpath, f"疑似截断({ratio:.0f}B/字)"))
        for it, fname, fpath, why in bad:
            print(f"  ✗ {fname}: {why} → 重新生成...", flush=True)
            if os.path.exists(fpath):
                os.remove(fpath)
            for attempt in range(5):
                try:
                    tts = edge_tts.Communicate(it["text"], VOICE, rate=RATE)
                    await tts.save(fpath)
                    print(f"  ✓ {fname} -> {os.path.getsize(fpath)/1024:.0f} KB", flush=True)
                    break
                except Exception as e:
                    print(f"    第{attempt+1}次失败: {e}", flush=True)
                    await asyncio.sleep(3 * (attempt + 1))
        # 汇总
        total = sum(os.path.getsize(os.path.join(outdir, x)) for x in os.listdir(outdir) if x.endswith(".mp3"))
        print(f"[{outdir}] 共 {len(os.listdir(outdir))} 个文件，{total/1024/1024:.1f} MB；本轮修复 {len(bad)} 个", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
