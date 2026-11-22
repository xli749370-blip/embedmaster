# -*- coding: utf-8 -*-
"""
冥想听学音频批量生成（edge-tts 微软神经音色，免费无 Key）
- 读取 meditate-scripts.json（由 export-meditate.mjs 导出）
- 每篇生成 public/audio/meditate/{id}.mp3（zh-CN-XiaoxiaoNeural 温柔女声，语速 -4% 沉稳）
- 同时写 public/audio/meditate/manifest.json（id -> 文件名 + 字数），前端据此决定播内置音频还是 TTS
运行：python gen-meditate-audio.py
"""
import asyncio
import json
import os
import edge_tts

VOICE = "zh-CN-XiaoxiaoNeural"
RATE = "-4%"
OUT_DIR = os.path.join("public", "audio", "meditate")

async def gen_one(piece: dict) -> dict:
    """生成单篇音频，返回 manifest 条目"""
    fname = f"{piece['id']}.mp3"
    fpath = os.path.join(OUT_DIR, fname)
    tts = edge_tts.Communicate(piece["script"], VOICE, rate=RATE)
    await tts.save(fpath)
    size = os.path.getsize(fpath)
    print(f"  ✓ {piece['id']} {piece['title']} -> {size/1024:.0f} KB")
    return {"id": piece["id"], "title": piece["title"], "channel": piece["channel"], "file": f"audio/meditate/{fname}", "bytes": size}

async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with open("meditate-scripts.json", "r", encoding="utf-8") as f:
        pieces = json.load(f)
    print(f"共 {len(pieces)} 篇，开始合成（音色 {VOICE}）...")
    entries = []
    for p in pieces:
        for attempt in range(3):  # 网络抖动重试
            try:
                entries.append(await gen_one(p))
                break
            except Exception as e:
                print(f"  ✗ {p['id']} 第{attempt+1}次失败: {e}")
                if attempt == 2:
                    raise
    manifest = {"voice": VOICE, "rate": RATE, "pieces": entries}
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    total = sum(e["bytes"] for e in entries)
    print(f"完成 {len(entries)} 篇，总大小 {total/1024/1024:.1f} MB")

if __name__ == "__main__":
    asyncio.run(main())
