"""测试用 Python requests 直接调用研招网 zys.do，看是否需要登录."""

import requests
import json

ZYS_URL = "https://yz.chsi.com.cn/zsml/rs/zys.do"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Content-Type": "application/x-www-form-urlencoded",
    "Referer": "https://yz.chsi.com.cn/zsml/",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/plain, */*",
}


def fetch_page(yjxkdm: str, mldm: str, page_no: int = 1, sess=None):
    """抓取指定页."""
    s = sess or requests.Session()
    data = {
        "zydm": "",
        "zymc": "",
        "xwlx": "xs",
        "mldm": mldm,
        "yjxkdm": yjxkdm,
        "xxfs": "",
        "tydxs": "",
        "jsggjh": "",
        "start": str((page_no - 1) * 10),
        "curPage": str(page_no),
        "pageSize": "10",
        "totalPage": "0",
        "totalCount": "0",
    }
    r = s.post(ZYS_URL, data=data, headers=HEADERS, timeout=15)
    return r.json(), s


def main():
    print("=== 测试 1: 直接 requests（无 cookie）第 1 页 ===")
    result, sess = fetch_page("0812", "08", 1)
    msg = result.get("msg", {})
    if isinstance(msg, str):
        print(f"ERROR: {msg}")
        return
    print(f"  totalCount={msg.get('totalCount')}, list size={len(msg.get('list', []))}")

    print("\n=== 测试 2: 同一 session 第 2 页（看是否被限） ===")
    result, sess = fetch_page("0812", "08", 2, sess=sess)
    msg = result.get("msg", {})
    if isinstance(msg, str):
        print(f"  ERROR (page 2): {msg}")
    else:
        print(f"  totalCount={msg.get('totalCount')}, list size={len(msg.get('list', []))}")

    print("\n=== 测试 3: 新 session 第 2 页（绕过 session 限制？） ===")
    result, sess2 = fetch_page("0812", "08", 2)
    msg = result.get("msg", {})
    if isinstance(msg, str):
        print(f"  ERROR (new session page 2): {msg}")
    else:
        print(f"  totalCount={msg.get('totalCount')}, list size={len(msg.get('list', []))}")
        if msg.get("list"):
            print(f"  first 3: {[(m.get('zydm'), m.get('zymc')) for m in msg['list'][:3]]}")

    print("\n=== 测试 4: 新 session 用 start=10 + curPage=2 直接 ===")
    s4 = requests.Session()
    data = {
        "zydm": "",
        "zymc": "",
        "xwlx": "xs",
        "mldm": "08",
        "yjxkdm": "0812",
        "xxfs": "",
        "tydxs": "",
        "jsggjh": "",
        "start": "10",  # 从第 11 条开始
        "curPage": "2",
        "pageSize": "10",
        "totalPage": "0",
        "totalCount": "0",
    }
    r = s4.post(ZYS_URL, data=data, headers=HEADERS, timeout=15)
    result = r.json()
    msg = result.get("msg", {})
    if isinstance(msg, str):
        print(f"  ERROR: {msg}")
    else:
        print(f"  totalCount={msg.get('totalCount')}, list size={len(msg.get('list', []))}")
        if msg.get("list"):
            print(f"  first 3: {[(m.get('zydm'), m.get('zymc')) for m in msg['list'][:3]]}")

    print("\n=== 测试 5: 先访问 /zsml/ 建立 session，再翻页 ===")
    s5 = requests.Session()
    s5.headers.update(HEADERS)
    # 先访问主页
    r = s5.get("https://yz.chsi.com.cn/zsml/", timeout=15)
    print(f"  /zsml/ status: {r.status_code}")
    # 看是否有 JSESSIONID
    print(f"  cookies: {dict(s5.cookies)}")
    # 再调用 zys.do 第 2 页
    result, _ = fetch_page("0812", "08", 2, sess=s5)
    msg = result.get("msg", {})
    if isinstance(msg, str):
        print(f"  ERROR (after visiting /zsml/): {msg}")
    else:
        print(f"  totalCount={msg.get('totalCount')}, list size={len(msg.get('list', []))}")
        if msg.get("list"):
            print(f"  first 3: {[(m.get('zydm'), m.get('zymc')) for m in msg['list'][:3]]}")


if __name__ == "__main__":
    main()
