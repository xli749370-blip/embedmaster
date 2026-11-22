# -*- coding: utf-8 -*-
"""
理论课程听学音频批量生成（edge-tts 微软神经音色，免费无 Key）
- 读取 learn-speech.json（由 export-learn.mjs 导出，70 节）
- 每节生成 public/audio/learn/{course}-{id}.mp3（zh-CN-YunjianNeural 沉稳男声，语速 +4% 学习向）
- 同时写 public/audio/learn/manifest.json（course+id -> 文件 + 字数），前端据此优先播内置音频
- 支持断点续传：已存在且 >10KB 的文件跳过
运行：python gen-learn-audio.py
"""
import asyncio
import json
import os
import edge_tts

VOICE = "zh-CN-YunjianNeural"
RATE = "+4%"
OUT_DIR = os.path.join("public", "audio", "learn")

async def gen_one(item: dict) -> dict:
    fname = f"{item['course']}-{item['id']}.mp3"
    fpath = os.path.join(OUT_DIR, fname)
    if os.path.exists(fpath) and os.path.getsize(fpath) > 10240:  # 断点续传
        size = os.path.getsize(fpath)
        print(f"  ↷ 跳过已有 {fname} ({size/1024:.0f} KB)")
    else:
        tts = edge_tts.Communicate(item["text"], VOICE, rate=RATE)
        await tts.save(fpath)
        size = os.path.getsize(fpath)
        print(f"  ✓ {fname} {item['title']} -> {size/1024:.0f} KB", flush=True)
    return {"course": item["course"], "courseTitle": item["courseTitle"], "id": item["id"],
            "title": item["title"], "file": f"audio/learn/{fname}", "bytes": size}

async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with open("learn-speech.json", "r", encoding="utf-8") as f:
        items = json.load(f)
    print(f"共 {len(items)} 节，开始合成（音色 {VOICE}，语速 {RATE}）...", flush=True)
    entries = []
    for it in items:
        for attempt in range(4):  # 网络抖动重试
            try:
                entries.append(await gen_one(it))
                break
            except Exception as e:
                print(f"  ✗ {it['course']}-{it['id']} 第{attempt+1}次失败: {e}", flush=True)
                await asyncio.sleep(2 * (attempt + 1))
                if attempt == 3:
                    print(f"  !! 放弃 {it['course']}-{it['id']}，继续后续（前端会回退 TTS）", flush=True)
    manifest = {"voice": VOICE, "rate": RATE, "sections": entries}
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    total = sum(e["bytes"] for e in entries)
    print(f"完成 {len(entries)}/{len(items)} 节，总大小 {total/1024/1024:.1f} MB", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
