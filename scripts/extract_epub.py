#!/usr/bin/env python3
"""把《这里是，终末停滞委员会。》EPUB(1-6 卷 + 外传 S1)解包成纯文本语料。

产出 D:\\cnm\\.canon\\{v1..v6,s1}\\NNN-标题.txt(逐章)
以及 .canon\\{book}.all.txt(单文件拼接,章前带 [[标题]] 行),供检索。
"""
import glob
import html
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

DOWNLOADS = r"C:\Users\matebook14\Downloads"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".canon")

NS_CNT = "urn:oebps:package"
NS_DC = "http://purl.org/dc/elements/1.1/"


def epub_text(path: str):
    """返回 (spine_items, chapters)  —— spine_items: [(basename, html_str, order)]
    chapters: list of (title, basename)"""
    z = zipfile.ZipFile(path)
    names = set(z.namelist())
    # 定位 rootfile
    cont = z.read("META-INF/container.xml").decode("utf-8", "replace")
    m = re.search(r'full-path="([^"]+)"', cont)
    opf = m.group(1) if m else next((n for n in names if n.lower().endswith(".opf")), None)
    root = ET.fromstring(z.read(opf).decode("utf-8", "replace"))
    def L(elem):
        return elem.tag.split("}")[-1]

    def kids(elem, local):
        return [el for el in elem if L(el) == local]

    # manifest / spine(忽略命名空间)
    man = {}
    for it in root.iter():
        if L(it) == "item" and it.get("id"):
            man[it.get("id")] = (it.get("href") or "").replace("\\", "/")
    spine = next((el for el in root.iter() if L(el) == "spine"), None)
    order = []
    toc_id = spine.get("toc") if spine is not None else None
    if spine is not None:
        for ir in spine.iter():
            if L(ir) == "itemref" and ir.get("idref"):
                order.append(ir.get("idref"))
    base = os.path.dirname(opf)
    # toc 标题表
    titles = {}  # basename(lower) -> title
    toc_path = man.get(toc_id, "") if toc_id else ""
    if toc_path.lower().endswith(".ncx") and toc_path in names:
        ncx = ET.fromstring(z.read(toc_path).decode("utf-8", "replace"))
        for np in ncx.iter():
            tag = np.tag.split("}")[-1]
            if tag != "navPoint":
                continue
            lab = next((el.text.strip() for el in np.iter()
                        if el.tag.split("}")[-1] == "text" and el.text), None)
            src = next((el.get("src") for el in np.iter()
                        if el.tag.split("}")[-1] == "content" and el.get("src")), None)
            if lab and src:
                titles[src.split("#")[0].lower()] = lab
    elif toc_path and toc_path in names:
        # epub3 nav 文档
        navsrc = z.read(toc_path).decode("utf-8", "replace")
        for a in re.finditer(r'<a[^>]+href="([^"#]+)(?:#[^"]*)?"[^>]*>(.*?)</a>', navsrc, re.S):
            title = html.unescape(re.sub(r"<[^>]+>", "", a.group(2))).strip()
            if title:
                titles[a.group(1).lower()] = title

    def resolve(p: str) -> str:
        p = p.replace("\\", "/")
        if base:
            cand = os.path.join(base, p).replace("\\", "/")
            if cand in names:
                return cand
        return p if p in names else None

    spine_items = []
    for idref in order:
        href = man.get(idref)
        if not href:
            continue
        p = resolve(href)
        if not p:
            continue
        if not any(p.lower().endswith(e) for e in (".xhtml", ".html", ".htm")):
            continue
        raw = z.read(p)
        # 文本内容可能是 utf-8 也可能是转义文件
        try:
            body = raw.decode("utf-8")
        except UnicodeDecodeError:
            body = raw.decode("gb18030", "replace")
        spine_items.append((p, body))

    # 标题优先用 toc
    def pick_title(p: str):
        key = p.lower()
        # 优先完整匹配,其次去目录部分
        for cand in (key, os.path.basename(key)):
            if cand in titles:
                return titles[cand]
        return os.path.basename(p)
    chapters = [(pick_title(p), os.path.basename(p)) for p, _ in spine_items]
    return spine_items, chapters


def clean(h: str) -> str:
    h = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", "", h)
    # 块级标签转新行
    h = re.sub(r"(?i)</(p|div|h[1-6]|li|tr|br|section|blockquote)>", "\n", h)
    h = re.sub(r"(?i)<br\s*/?>", "\n", h)
    h = re.sub(r"(?i)<rt[^>]*>.*?</rt>", "", h)  # 去掉 ruby 注音
    h = re.sub(r"<[^>]+>", "", h)
    h = html.unescape(h)
    h = re.sub(r"[ \t\u3000]+", " ", h)
    h = re.sub(r"\n\s*\n+", "\n\n", h)
    h = "\n".join(line.strip() for line in h.splitlines())
    h = re.sub(r"\n{3,}", "\n\n", h)
    return h.strip()


def book_name(path: str):
    fn = os.path.basename(path)
    m = re.search(r"。([1-6])\.epub$", fn)
    if m:
        return "v" + m.group(1)
    if "外传" in fn or "S1" in fn:
        return "s1"
    return None


def main():
    os.makedirs(OUT, exist_ok=True)
    files = glob.glob(os.path.join(DOWNLOADS, "*.epub"))
    done = []
    for f in files:
        b = book_name(f)
        if not b:
            continue
        print(f"[{b}] {os.path.basename(f)}", flush=True)
        spine_items, chapters = epub_text(f)
        bookdir = os.path.join(OUT, b)
        os.makedirs(bookdir, exist_ok=True)
        allparts = []
        for i, ((p, body), (title, _)) in enumerate(zip(spine_items, chapters), 1):
            txt = clean(body)
            safe = re.sub(r'[\\/:*?"<>|]', "_", title or p) or f"ch{i}"
            op = os.path.join(bookdir, f"{i:03d}-{safe}.txt")
            with open(op, "w", encoding="utf-8") as fh:
                fh.write(txt)
            allparts.append(f"[[ {title} ]]  ({os.path.basename(p)})\n\n{txt}")
        with open(os.path.join(OUT, f"{b}.all.txt"), "w", encoding="utf-8") as fh:
            fh.write("\n\n\n".join(allparts))
        done.append((b, len(spine_items)))
    for b, n in done:
        print(f"  {b}: {n} 章")
    print("OK ->", OUT)


if __name__ == "__main__":
    sys.exit(main())
