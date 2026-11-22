# -*- coding: utf-8 -*-
"""
工程库阶段听学音频批量生成（edge-tts 微软神经音色，免费无 Key）
- 读取 project-speech.json（由 export-learn.mjs 导出，43 阶段）
- 每节生成 public/audio/learn/{course}-{id}.mp3（zh-CN-YunjianNeural 沉稳男声，语速 +4% 学习向）
- 同时写 public/audio/learn/manifest.json（course+id -> 文件 + 字数），前端据此优先播内置音频
- 支持断点续传：已存在且 >10KB 的文件跳过
运行：python gen-learn-audio.py
"""
import asyncio
import json
import os
import edge_tts

# 语料与脚本同目录：不依赖从哪个目录运行
_AUDIO = os.path.dirname(os.path.abspath(__file__))

VOICE = "zh-CN-YunjianNeural"
RATE = "+4%"
OUT_DIR = os.path.join("public", "audio", "proj")

async def gen_one(item: dict) -> dict:
    fname = f"{item['projectId']}-{item['stageId']}.mp3"
    fpath = os.path.join(OUT_DIR, fname)
    if os.path.exists(fpath) and os.path.getsize(fpath) > 10240:  # 断点续传
        size = os.path.getsize(fpath)
        print(f"  ↷ 跳过已有 {fname} ({size/1024:.0f} KB)")
    else:
        tts = edge_tts.Communicate(item["text"], VOICE, rate=RATE)
        await tts.save(fpath)
        size = os.path.getsize(fpath)
        print(f"  ✓ {fname} {item['stageTitle']} -> {size/1024:.0f} KB", flush=True)
    return {"project": item["projectId"], "stage": item["stageId"], "order": item["order"],
            "title": item["stageTitle"], "file": f"audio/proj/{fname}", "bytes": size}

async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(_AUDIO, "project-speech.json"), "r", encoding="utf-8") as f:
        items = json.load(f)
    print(f"共 {len(items)} 节，开始合成（音色 {VOICE}，语速 {RATE}）...", flush=True)
    entries = []
    for it in items:
        for attempt in range(4):  # 网络抖动重试
            try:
                entries.append(await gen_one(it))
                break
            except Exception as e:
                print(f"  ✗ {it['projectId']}-{it['stageId']} 第{attempt+1}次失败: {e}", flush=True)
                await asyncio.sleep(2 * (attempt + 1))
                if attempt == 3:
                    print(f"  !! 放弃 {it['projectId']}-{it['stageId']}，继续后续（前端会回退 TTS）", flush=True)
    manifest = {"voice": VOICE, "rate": RATE, "stages": entries}
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    total = sum(e["bytes"] for e in entries)
    print(f"完成 {len(entries)}/{len(items)} 节，总大小 {total/1024/1024:.1f} MB", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
