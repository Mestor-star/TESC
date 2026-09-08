#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""离线原文切片器 — 把 .canon 逐章语料按事件切到 public/offtext/。

清单来源：scripts/parts/*.json（每个卷一个 fragment，均为条目数组）。合并后
按 57 个事件 id 校验（scripts/slice_events.py --check），随后
scripts/slice_events.py --build 生成 public/offtext/{id}.txt 与 index.json。

条目 schema（JSON）：
    { "id": "v1-1", "parts": [ Part, ... ] }
Part 两种写法：
    { "file": "v1/011-序 章 『船与影』.txt", "whole": true }
        # whole：跳过卷首标题段，从正文起取到 EOF
    { "file": "v1/011-序 章 『船与影』.txt", "from": 3, "to": 636 }
        # from/to：原始文件 1-based 行号（含）。行 1 通常是章标题。
        # from 缺省 3；to 缺省文件末尾。
约定：正文段与段之间以空行分隔（逐段一行）；行号按原文计。
"""
import argparse
import glob
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANON = os.path.join(ROOT, ".canon")
PARTS_DIR = os.path.join(ROOT, "scripts", "parts")
OUT_DIR = os.path.join(ROOT, "public", "offtext")

# 57 个事件 id（时间线全集）。顺序不重要，只做齐全性校验。
EXPECTED_IDS = [f"v1-{i}" for i in range(1, 10)] \
    + [f"v2-{i}" for i in range(1, 10)] \
    + [f"v3-{i}" for i in range(1, 10)] \
    + [f"v4-{i}" for i in range(1, 9)] \
    + [f"v5-{i}" for i in range(1, 8)] \
    + [f"v6-{i}" for i in range(1, 9)] \
    + [f"s1-{i}" for i in range(1, 8)]

MIN_CHARS = 120  # 低于此长度的切片视为可疑（下位提示，不阻断）


def load_parts():
    """合并 scripts/parts/*.json，返回 {id: entry}（保持顺序）。"""
    merged = []
    for f in sorted(glob.glob(os.path.join(PARTS_DIR, "*.json"))):
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, list):
            raise SystemExit(f"{f}: 顶层应为数组")
        for e in data:
            if not isinstance(e, dict) or "id" not in e or "parts" not in e:
                raise SystemExit(f"{f}: 条目缺少 id/parts: {e!r}")
            merged.append(e)
    by_id = {}
    for e in merged:
        if e["id"] in by_id:
            raise SystemExit(f"重复事件 id: {e['id']}")
        by_id[e["id"]] = e
    return by_id


def read_file_lines(rel):
    path = os.path.join(CANON, rel)
    if not os.path.isfile(path):
        raise SystemExit(f"文件不存在: {rel}")
    with open(path, encoding="utf-8") as fh:
        return fh.read().split("\n")


def content_start_index(lines):
    """正文起点：跳过标题段与其后的空行。lines 为 0-based 数组。"""
    first_nonempty = None
    for i, s in enumerate(lines):
        if s.strip():
            first_nonempty = i
            break
    if first_nonempty is None:
        return 0
    # 标题后通常接空行 → 正文从第一个空行之后开始；若没有空行，从下一行开始
    for j in range(first_nonempty + 1, len(lines)):
        if not lines[j].strip():
            return j + 1
    return first_nonempty + 1


def part_lines(part):
    rel = part["file"]
    lines = read_file_lines(rel)
    n = len(lines)
    if part.get("whole"):
        start = content_start_index(lines)
        seg = lines[start:]
    else:
        frm = part.get("from", 3)
        to = part.get("to", n)
        if not (1 <= frm <= to <= n):
            raise SystemExit(f"{rel}: 非法行号 from={frm} to={to} (共 {n} 行)")
        seg = lines[frm - 1:to]
    # 去除首尾空行，压缩 3+ 连续空行
    while seg and not seg[0].strip():
        seg.pop(0)
    while seg and not seg[-1].strip():
        seg.pop()
    out = []
    blanks = 0
    for s in seg:
        if not s.strip():
            blanks += 1
            if blanks >= 2:
                continue
        else:
            blanks = 0
        out.append(s.rstrip())
    return out


def build_entry(entry):
    chunks = []
    for part in entry["parts"]:
        chunks.append("\n".join(part_lines(part)))
    text = "\n\n".join(c for c in chunks if c.strip())
    # 去掉文末的编者/作者注记行（以 ※ 开头，如「※本SS收录于…」）；
    # 只处理收尾处，正文段落之间的 ※ 作者插注不受影响。
    lines = text.split("\n")
    while lines and (not lines[-1].strip() or lines[-1].lstrip().startswith("※")):
        lines.pop()
    return "\n".join(lines).strip()


def id_check(by_id):
    present = set(by_id)
    missing = [i for i in EXPECTED_IDS if i not in present]
    extra = [i for i in present if i not in EXPECTED_IDS]
    ok = True
    if missing:
        print(f"[FAIL] 缺少 {len(missing)} 个事件: {missing}")
        ok = False
    if extra:
        print(f"[FAIL] 多余事件 id: {extra}")
        ok = False
    return ok


def do_check(by_id):
    id_check(by_id)
    issues = []
    for eid in EXPECTED_IDS:
        if eid not in by_id:
            continue
        entry = by_id[eid]
        try:
            text = build_entry(entry)
        except SystemExit as ex:
            issues.append((eid, str(ex)))
            continue
        lines = text.split("\n")
        head = " / ".join(l for l in lines[:2] if l.strip())
        tail = " / ".join(l for l in lines[-2:] if l.strip())
        flag = ""
        if len(text) < MIN_CHARS:
            flag = f"  < 可疑短片 {len(text)}字"
        print(f"{eid:>5} {len(text):>6}字 {len(lines):>4}行 | {head[:36]} … {tail[:24]}{flag}")
    for eid, msg in issues:
        print(f"[FAIL] {eid}: {msg}")
    print(f"--- 共 {len(by_id)} 条清单条目 / 期望 {len(EXPECTED_IDS)} 个事件")


def do_build(by_id):
    os.makedirs(OUT_DIR, exist_ok=True)
    ok = id_check(by_id)
    index = []
    for eid in EXPECTED_IDS:
        if eid not in by_id:
            continue
        text = build_entry(by_id[eid])
        path = os.path.join(OUT_DIR, f"{eid}.txt")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
        index.append({"id": eid, "chars": len(text), "lines": text.count("\n") + 1})
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as fh:
        json.dump({"count": len(index), "events": index}, fh, ensure_ascii=False, indent=1)
    print(f"--- 写出 {len(index)} 个 txt 到 {os.path.relpath(OUT_DIR, ROOT)}；index.json 已更新")
    if not ok:
        raise SystemExit("存在缺失/多余事件，未完整写出全部事件。")


def main():
    ap = argparse.ArgumentParser(description="离线原文切片器")
    ap.add_argument("mode", choices=["check", "build"])
    args = ap.parse_args()
    by_id = load_parts()
    if args.mode == "check":
        do_check(by_id)
    else:
        do_build(by_id)


if __name__ == "__main__":
    main()
