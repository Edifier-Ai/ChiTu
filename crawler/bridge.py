"""
赤兔 <-> MediaCrawler 桥接脚本 v2
核心修复：通过动态生成 wrapper 脚本直接覆盖 MediaCrawler config 值，
而不是靠 MediaCrawler 不会读取的环境变量。
"""
import asyncio
import json
import os
import re
import sys
import tempfile
import shutil
import subprocess
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import csv
from urllib.parse import quote, urljoin
from pathlib import Path

from path_manager import PathManager

IS_FROZEN = getattr(sys, "frozen", False)
RUNTIME_BASE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
MEDIA_CRAWLER_DIR = (
    os.environ.get("CHITU_MEDIA_CRAWLER_DIR") or
    os.path.join(RUNTIME_BASE_DIR, "MediaCrawler")
)
VENV_PYTHON = (
    os.environ.get("CHITU_VENV_PYTHON") or
    os.path.join(MEDIA_CRAWLER_DIR, ".venv", "bin", "python")
)
BUNDLED_BROWSERS_DIR = os.environ.get("CHITU_PLAYWRIGHT_BROWSERS_PATH", "")
COOKIES_FILE = str(PathManager.get_cookies_file())

if BUNDLED_BROWSERS_DIR:
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = BUNDLED_BROWSERS_DIR

PLATFORM_MAP = {
    "xiaohongshu": "xhs",
    "douyin": "dy",
    "weibo": "wb",
    "bilibili": "bili",
}

PLATFORM_NAMES = {
    "xiaohongshu": "小红书",
    "douyin": "抖音",
    "weibo": "微博",
    "bilibili": "B站",
}


from ipc_manager import emit_message, output_progress, output_error, output_complete

def load_cookies() -> Dict[str, str]:
    if not os.path.exists(COOKIES_FILE):
        return {}
    try:
        with open(COOKIES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def parse_cookie_string(cookie_str: str) -> Dict[str, str]:
    cookie_dict: Dict[str, str] = {}
    for cookie in cookie_str.split(";"):
        cookie = cookie.strip()
        if not cookie or "=" not in cookie:
            continue
        key, value = cookie.split("=", 1)
        cookie_dict[key.strip()] = value.strip()
    return cookie_dict


def ensure_media_crawler_path() -> None:
    if MEDIA_CRAWLER_DIR not in sys.path:
        sys.path.insert(0, MEDIA_CRAWLER_DIR)


from playwright_utils import (
    is_transient_page_error,
    wait_for_page_ready,
    safe_page_evaluate,
    safe_page_content,
    wait_for_visible_results
)

def build_browser_cookies(platform_id: str, cookie_str: str) -> List[Dict[str, Any]]:
    if not cookie_str.strip():
        return []

    cookie_dict = parse_cookie_string(cookie_str)
    if platform_id == "xiaohongshu":
        domains = [".xiaohongshu.com", "www.xiaohongshu.com", "edith.xiaohongshu.com"]
    elif platform_id == "weibo":
        domains = [".weibo.com", "weibo.com", ".m.weibo.cn", "m.weibo.cn"]
    else:
        domains = []

    cookies: List[Dict[str, Any]] = []
    for name, value in cookie_dict.items():
        for domain in domains:
            cookies.append({
                "name": name,
                "value": value,
                "domain": domain,
                "path": "/",
                "httpOnly": False,
                "secure": True,
            })
    return cookies


async def scrape_xhs_comments(page: Any, max_comments: int = 5) -> List[Dict[str, str]]:
    comments: List[Dict[str, str]] = []
    for _ in range(3):  # 减少滚动次数从 4 到 3
        try:
            comments = await safe_page_evaluate(
                page,
                """(maxCount) => {
                    const seen = new Set();
                    const selectors = [
                      '[class*="comment"]',
                      '[class*="Comment"]',
                      '[class*="comment-item"]',
                      '[class*="comments-container"] > div',
                    ];
                    const nodes = [];
                    for (const selector of selectors) {
                      for (const node of document.querySelectorAll(selector)) {
                        if (!nodes.includes(node)) nodes.push(node);
                      }
                    }
                    const textOf = (root, selectors) => {
                      for (const selector of selectors) {
                        const el = root.querySelector(selector);
                        const text = el?.textContent?.trim();
                        if (text) return text;
                      }
                      return '';
                    };
                    const result = [];
                    for (const node of nodes) {
                      const content = textOf(node, [
                        '[class*="content"]',
                        '[class*="text"]',
                        'p',
                        'span'
                      ]);
                      if (!content || content.length < 2) continue;
                      const author = textOf(node, [
                        '[class*="author"]',
                        '[class*="name"]',
                        'a',
                        'strong'
                      ]) || '未知';
                      const timestamp = textOf(node, [
                        '[class*="time"]',
                        '[class*="date"]',
                        'time'
                      ]);
                      const key = `${author}::${content}`;
                      if (seen.has(key)) continue;
                      seen.add(key);
                      result.push({
                        id: key,
                        author,
                        content,
                        timestamp,
                      });
                      if (result.length >= maxCount) break;
                    }
                    return result;
                }""",
                max_comments,
            )
        except Exception:
            comments = []
        if comments:
            break
        await page.mouse.wheel(0, 600)  # 减少滚动距离
        await asyncio.sleep(0.5)  # 减少等待时间从 1s 到 0.5s
    return comments


async def scrape_weibo_comments(page: Any, max_comments: int = 5) -> List[Dict[str, str]]:
    comments: List[Dict[str, str]] = []
    for _ in range(4):  # 减少滚动次数从 6 到 4
        try:
            await safe_page_evaluate(
                page,
                """() => {
                    const labels = ['评论', '全部评论', '转发评论'];
                    const clickableNodes = Array.from(document.querySelectorAll('button, a, div, span'));
                    for (const node of clickableNodes) {
                        const text = node.textContent?.trim() || '';
                        if (!text) continue;
                        if (labels.some((label) => text.includes(label))) {
                            node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        }
                    }
                    window.scrollBy(0, 800);
                }""",
            )
            await asyncio.sleep(0.5)  # 减少等待时间从 1s 到 0.5s
            comments = await safe_page_evaluate(
                page,
                """(maxCount) => {
                    const candidates = [];
                    const selectors = [
                      '.card-comment',
                      '.comment-content-item',
                      '.comment-item-wrap',
                      '.comment-list .item',
                      '[id*="comment"] li',
                      '.lite-page-wrap [class*="comment"]',
                      '.m-container-max [class*="comment"]',
                      '.comment-item',
                    ];
                    for (const selector of selectors) {
                      for (const node of document.querySelectorAll(selector)) {
                        if (!candidates.includes(node)) candidates.push(node);
                      }
                    }
                    const seen = new Set();
                    const pick = (root, selectors) => {
                      for (const selector of selectors) {
                        const el = root.querySelector(selector);
                        const text = el?.textContent?.trim();
                        if (text) return text;
                      }
                      return '';
                    };
                    const normalize = (text) => text.replace(/\\s+/g, ' ').trim();
                    const result = [];
                    for (const node of candidates) {
                      const content = normalize(pick(node, [
                        '[class*="content"]',
                        '[class*="txt"]',
                        '[class*="text"]',
                        '.m-text-cut',
                        'h3',
                        'p',
                        'span'
                      ]));
                      if (!content || content.length < 2) continue;
                      const author = normalize(pick(node, [
                        '[class*="name"]',
                        '[class*="user"] a',
                        '.m-text-box a',
                        'a',
                        'h4',
                        'strong'
                      ])) || '未知';
                      const timestamp = normalize(pick(node, [
                        'time',
                        '[class*="time"]',
                        '[class*="from"]',
                        '[class*="meta"]'
                      ]));
                      if (
                        content === author ||
                        content.includes('赞') && content.length <= 4 ||
                        content.includes('回复') && content.length <= 8
                      ) {
                        continue;
                      }
                      const key = `${author}::${content}`;
                      if (seen.has(key)) continue;
                      seen.add(key);
                      result.push({ id: key, author, content, timestamp });
                      if (result.length >= maxCount) break;
                    }
                    return result;
                }""",
                max_comments,
            )
        except Exception:
            comments = []
        if comments:
            break
        await page.mouse.wheel(0, 600)  # 减少滚动距离
        await asyncio.sleep(0.6)  # 减少等待时间从 1.2s 到 0.6s
    return comments


def extract_xhs_initial_state(html: str) -> Optional[Dict[str, Any]]:
    marker = "window.__INITIAL_STATE__="
    marker_index = html.find(marker)
    if marker_index < 0:
        return None

    raw_state = html[marker_index + len(marker):]
    json_start = raw_state.find("{")
    if json_start < 0:
        return None

    raw_state = raw_state[json_start:]
    raw_state = re.sub(r":\s*undefined\b", ":null", raw_state)
    raw_state = raw_state.replace("undefined", '""')

    try:
        decoder = json.JSONDecoder(strict=False)
        parsed, _ = decoder.raw_decode(raw_state)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    script_end = raw_state.find("</script>")
    if script_end > 0:
        trimmed = raw_state[:script_end].rstrip(" ;\n\r\t")
        try:
            parsed = json.loads(trimmed, strict=False)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None

    return None


def extract_xhs_note_from_html(note_id: str, html: str, url: str, keyword: str) -> Optional[Dict[str, Any]]:
    state = extract_xhs_initial_state(html)
    note = None
    if state:
        note = (
            state.get("note", {})
            .get("noteDetailMap", {})
            .get(note_id, {})
            .get("note")
        )

    if note:
        user_info = note.get("user", {}) or {}
        interact = note.get("interactInfo", {}) or {}
        return {
            "id": str(note.get("noteId") or note_id),
            "platform": PLATFORM_NAMES["xiaohongshu"],
            "keyword": keyword,
            "content": note.get("desc") or note.get("title") or "",
            "author": user_info.get("nickname") or "未知",
            "timestamp": normalize_timestamp(note.get("time") or note.get("lastUpdateTime") or ""),
            "url": url,
            "comments": [],
            "like_count": interact.get("likedCount"),
        }

    match = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
    title = re.sub(r"\s+", " ", match.group(1)).strip() if match else ""
    desc_match = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']', html, re.I | re.S)
    desc = desc_match.group(1).strip() if desc_match else ""
    content = desc or title
    if not content:
        return None

    return {
        "id": note_id,
        "platform": PLATFORM_NAMES["xiaohongshu"],
        "keyword": keyword,
        "content": content,
        "author": "未知",
        "timestamp": "",
        "url": url,
        "comments": [],
    }


async def is_xhs_logged_in(page: Any, context: Any) -> bool:
    try:
        cookies = await context.cookies()
    except Exception:
        cookies = []

    cookie_map = {cookie.get("name"): cookie.get("value") for cookie in cookies}
    if cookie_map.get("a1") and (cookie_map.get("web_session") or cookie_map.get("webId")):
        return True

    try:
        return bool(await safe_page_evaluate(
            page,
            """() => {
                const text = document.body?.innerText || '';
                const hasLoginPrompt = text.includes('登录') && (text.includes('扫码') || text.includes('验证码'));
                const hasProfileLink = Boolean(document.querySelector('a[href*="/user/profile/"]'));
                return hasProfileLink && !hasLoginPrompt;
            }"""
        ))
    except Exception:
        return False


async def wait_for_xhs_login(page: Any, context: Any, timeout_seconds: float = 240.0) -> bool:
    deadline = asyncio.get_event_loop().time() + timeout_seconds
    while asyncio.get_event_loop().time() < deadline:
        if await is_xhs_logged_in(page, context):
            await asyncio.sleep(2)
            if await is_xhs_logged_in(page, context):
                return True
        await asyncio.sleep(2)
    return False


async def collect_xhs_search_cards(page: Any) -> List[Dict[str, str]]:
    cards = await safe_page_evaluate(
        page,
        """() => {
            const normalize = (text) => (text || '').replace(/\\s+/g, ' ').trim();
            const nodes = Array.from(document.querySelectorAll('section, article, [class*="note-item"], [class*="search-item"]'));
            const result = [];
            const seen = new Set();
            for (const node of nodes) {
                const link = node.querySelector('a[href*="/explore/"], a[href*="/discovery/item/"]');
                const href = link?.href || '';
                if (!href || seen.has(href)) continue;
                seen.add(href);

                const title = normalize(
                    node.querySelector('[class*="title"]')?.textContent ||
                    node.querySelector('h3')?.textContent ||
                    ''
                );
                const content = normalize(
                    node.querySelector('[class*="desc"]')?.textContent ||
                    node.querySelector('[class*="content"]')?.textContent ||
                    node.querySelector('[class*="text"]')?.textContent ||
                    title
                );
                const author = normalize(
                    node.querySelector('[class*="author"]')?.textContent ||
                    node.querySelector('[class*="name"]')?.textContent ||
                    node.querySelector('a[href*="/user/profile/"]')?.textContent ||
                    ''
                );
                if (!title && !content) continue;
                result.push({
                    href,
                    title,
                    content,
                    author,
                });
            }
            return result;
        }""",
    )
    return cards or []


async def run_xhs_browser_fallback(keyword: str, count: int, cookie_str: str) -> List[Dict]:
    from playwright.async_api import async_playwright

    results: List[Dict] = []
    user_data_dir = str(PathManager.get_browser_user_data_dir("xiaohongshu"))
    async with async_playwright() as playwright:
        context = await playwright.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=False,
        )

        # 拦截无用资源，降低内存消耗和提高页面加载速度
        async def block_resources(route):
            if route.request.resource_type in ("image", "media", "font", "stylesheet"):
                await route.abort()
            else:
                await route.continue_()
        await context.route("**/*", block_resources)

        cookies = build_browser_cookies("xiaohongshu", cookie_str)
        if cookies:
            await context.add_cookies(cookies)
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto("https://www.xiaohongshu.com/", wait_until="domcontentloaded")

        if not await is_xhs_logged_in(page, context):
            output_error("小红书需要先在打开的浏览器里完成登录/二次验证，程序会继续等待登录成功。")
            if not await wait_for_xhs_login(page, context):
                output_error("小红书登录等待超时，请确认扫码和二次验证都已完成。")
                await context.close()
                return []

        search_url = f"https://www.xiaohongshu.com/search_result?keyword={quote(keyword)}&source=web_explore_feed"
        await page.goto(search_url, wait_until="domcontentloaded")
        await wait_for_visible_results(page, ['a[href*="/explore/"]', 'a[href*="/discovery/item/"]'])

        note_cards: List[Dict[str, str]] = []
        stagnant_rounds = 0
        # 抓取足够的卡片，确保过滤后仍有 count 条数据
        target_cards = int(count * 1.5)  # 多抓 50% 以应对过滤
        while len(note_cards) < max(target_cards, 20) and stagnant_rounds < 5:
            current_cards = await collect_xhs_search_cards(page)
            deduped: List[Dict[str, str]] = []
            seen_urls = set()
            for card in current_cards:
                href = card.get("href", "")
                if not href or href in seen_urls:
                    continue
                seen_urls.add(href)
                deduped.append(card)
            if len(deduped) == len(note_cards):
                stagnant_rounds += 1
            else:
                stagnant_rounds = 0
            note_cards = deduped
            await page.mouse.wheel(0, 1200)
            await asyncio.sleep(0.5)

        # 批量并发打开详情页，提升抓取速度，并实时推送进度
        detail_semaphore = asyncio.Semaphore(5)  # 最多同时打开 5 个详情页
        progress_counter = [0]  # 使用列表以便在闭包中修改
        total_cards = min(len(note_cards), count)

        async def fetch_detail_card(card: Dict[str, str], index: int) -> Optional[Dict]:
            async with detail_semaphore:
                raw_url = card.get("href", "")
                url = raw_url if raw_url.startswith("http") else urljoin("https://www.xiaohongshu.com", raw_url)
                note_match = re.search(r"/(?:explore|discovery/item)/([^/?]+)", url)
                if not note_match:
                    progress_counter[0] += 1
                    return None
                note_id = note_match.group(1)
                detail_page = await context.new_page()
                try:
                    await detail_page.goto(url, wait_until="domcontentloaded")
                    await asyncio.sleep(0.8)
                    html = await safe_page_content(detail_page)
                    post = extract_xhs_note_from_html(note_id, html, url, keyword)
                    if not post:
                        content = card.get("content") or card.get("title") or ""
                        if not content:
                            progress_counter[0] += 1
                            return None
                        post = {
                            "id": note_id,
                            "platform": PLATFORM_NAMES["xiaohongshu"],
                            "keyword": keyword,
                            "content": content,
                            "author": card.get("author") or "未知",
                            "timestamp": "",
                            "url": url,
                            "comments": [],
                        }
                    else:
                        post["comments"] = await scrape_xhs_comments(detail_page)

                    if not post.get("author") or post.get("author") == "未知":
                        post["author"] = card.get("author") or post.get("author") or "未知"
                    if not post.get("content"):
                        post["content"] = card.get("content") or card.get("title") or ""
                    
                    # 实时推送进度
                    progress_counter[0] += 1
                    output_progress(PLATFORM_NAMES["xiaohongshu"], keyword, progress_counter[0], total_cards, [post])
                    return post
                finally:
                    await detail_page.close()

        # 并发抓取详情页
        detail_tasks = [fetch_detail_card(card, i) for i, card in enumerate(note_cards[:count])]
        detail_results = await asyncio.gather(*detail_tasks)
        results = [r for r in detail_results if r is not None]

        await context.close()
    return results


async def run_weibo_browser_fallback(keyword: str, count: int, cookie_str: str) -> List[Dict]:
    from playwright.async_api import async_playwright

    results: List[Dict] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=False)
        context = await browser.new_context()

        # 拦截无用资源，降低内存消耗和提高页面加载速度
        async def block_resources(route):
            if route.request.resource_type in ("image", "media", "font", "stylesheet"):
                await route.abort()
            else:
                await route.continue_()
        await context.route("**/*", block_resources)

        cookies = build_browser_cookies("weibo", cookie_str)
        if cookies:
            await context.add_cookies(cookies)
        page = await context.new_page()
        search_url = f"https://s.weibo.com/weibo?q={quote(keyword)}"
        await page.goto(search_url, wait_until="domcontentloaded")
        await wait_for_visible_results(page, ['.card-wrap[data-mid]', '.card-wrap'])

        cards: List[Dict[str, str]] = []
        stagnant_rounds = 0
        while len(cards) < max(count, 20) and stagnant_rounds < 5:
            current = await page.evaluate(
                """() => {
                    const rows = [];
                    const nodes = document.querySelectorAll('.card-wrap, [mid]');
                    for (const node of nodes) {
                        const id = node.getAttribute('data-mid') || node.getAttribute('mid') || node.getAttribute('data-id') || '';
                        const content = node.querySelector('.txt')?.textContent?.trim() || '';
                        const author = node.querySelector('.name')?.textContent?.trim() || '';
                        const timeEl = node.querySelector('.from a');
                        const time = timeEl?.textContent?.trim() || '';
                        const href = timeEl?.href || node.querySelector('a[href*="/detail/"], a[href*="/status/"]')?.href || '';
                        if (id && content) {
                            rows.push({ id, content, author, time, url: href });
                        }
                    }
                    return rows;
                }"""
            )
            deduped: List[Dict[str, str]] = []
            seen_ids = set()
            for item in current:
                if item["id"] in seen_ids:
                    continue
                seen_ids.add(item["id"])
                deduped.append(item)
            if len(deduped) == len(cards):
                stagnant_rounds += 1
            else:
                stagnant_rounds = 0
            cards = deduped
            await page.mouse.wheel(0, 1400)
            await asyncio.sleep(0.5)

        # 批量并发打开微博详情页，并实时推送进度
        detail_semaphore = asyncio.Semaphore(5)
        progress_counter = [0]
        total_items = min(len(cards), count)

        async def fetch_weibo_detail(item: Dict[str, str]) -> Dict:
            async with detail_semaphore:
                detail_url = f"https://m.weibo.cn/detail/{item['id']}"
                detail_page = await context.new_page()
                comments: List[Dict[str, str]] = []
                try:
                    await detail_page.goto(detail_url, wait_until="domcontentloaded")
                    await asyncio.sleep(1)
                    comments = await scrape_weibo_comments(detail_page)
                except Exception:
                    comments = []
                finally:
                    await detail_page.close()

                result = {
                    "id": str(item["id"]),
                    "platform": PLATFORM_NAMES["weibo"],
                    "keyword": keyword,
                    "content": item.get("content", ""),
                    "author": item.get("author") or "未知",
                    "timestamp": item.get("time", ""),
                    "url": detail_url,
                    "comments": comments,
                }
                
                # 实时推送进度
                progress_counter[0] += 1
                output_progress(PLATFORM_NAMES["weibo"], keyword, progress_counter[0], total_items, [result])
                return result

        detail_tasks = [fetch_weibo_detail(item) for item in cards[:count]]
        results = await asyncio.gather(*detail_tasks)

        await context.close()
        await browser.close()
    return results


async def run_browser_fallback(platform_id: str, keyword: str, count: int, cookie_str: str) -> List[Dict]:
    try:
        if platform_id == "xiaohongshu":
            return await run_xhs_browser_fallback(keyword, count, cookie_str)
        if platform_id == "weibo":
            return await run_weibo_browser_fallback(keyword, count, cookie_str)
    except Exception as exc:
        output_error(f"{PLATFORM_NAMES.get(platform_id, platform_id)} 浏览器兜底抓取失败：{exc}")
    return []


def run_wrapper_file(wrapper_path: str) -> None:
    with open(wrapper_path, "r", encoding="utf-8") as f:
        config_data = json.load(f)

    sys.path.insert(0, config_data.pop("_MEDIA_CRAWLER_DIR", MEDIA_CRAWLER_DIR))

    import config
    for k, v in config_data.items():
        setattr(config, k, v)

    # Reset argv so MediaCrawler's Typer CLI does not see bridge-only flags.
    sys.argv = [wrapper_path]

    from tools.app_runner import run
    from main import main, async_cleanup

    run(main, async_cleanup, cleanup_timeout_seconds=60.0)


def validate_platform_cookie(platform_id: str, cookie_str: str) -> Optional[str]:
    if not cookie_str.strip():
        return None

    cookie_dict = parse_cookie_string(cookie_str)
    if not cookie_dict:
        return None

    if platform_id == "xiaohongshu":
        if not cookie_dict.get("a1") or not cookie_dict.get("web_session"):
            return "小红书 Cookie 缺少关键字段：至少需要 a1 和 web_session。请从已登录的小红书网页复制最新完整 Cookie。"

    if platform_id == "bilibili":
        if not cookie_dict.get("SESSDATA"):
            return "B站 Cookie 缺少关键字段：至少需要 SESSDATA。建议同时包含 DedeUserID 和 bili_jct。"

    return None


def normalize_timestamp(timestamp: Any) -> str:
    if isinstance(timestamp, (int, float)):
        try:
            if timestamp > 1000000000000:
                timestamp = timestamp / 1000
            return datetime.fromtimestamp(timestamp).isoformat()
        except Exception:
            return str(timestamp)
    return str(timestamp or "")


def build_match_ids(raw: Dict, url: str = "") -> List[str]:
    candidates = [
        raw.get("note_id"),
        raw.get("aweme_id"),
        raw.get("weibo_id"),
        raw.get("video_id"),
        raw.get("comment_aweme_id"),
        raw.get("item_id"),
        raw.get("id"),
    ]
    if url:
        parts = [part.strip() for part in url.replace("?", "/").split("/") if part.strip()]
        candidates.extend(parts[-3:])

    result: List[str] = []
    for value in candidates:
        text = str(value or "").strip()
        if text and text not in result:
            result.append(text)
    return result


def normalize_post(raw: Dict, platform_name: str, keyword: str) -> Dict:
    content = (
        raw.get("note_desc") or
        raw.get("desc") or
        raw.get("text") or
        raw.get("title") or
        raw.get("content") or ""
    )
    author = (
        raw.get("nickname") or
        raw.get("author") or
        raw.get("user_name") or
        raw.get("author_name") or "未知"
    )
    url = (
        raw.get("note_url") or
        raw.get("aweme_url") or
        raw.get("share_url") or
        raw.get("video_url") or
        raw.get("url") or ""
    )
    post_id = (
        raw.get("note_id") or raw.get("aweme_id") or
        raw.get("weibo_id") or raw.get("video_id") or
        raw.get("id") or ""
    )
    timestamp = (
        raw.get("time") or
        raw.get("create_time") or
        raw.get("created_at") or
        raw.get("create_date_time") or
        raw.get("last_update_time") or
        raw.get("pubdate") or
        raw.get("last_modify_ts") or ""
    )

    return {
        "id": str(post_id),
        "platform": platform_name,
        "keyword": keyword,
        "content": content,
        "author": author,
        "timestamp": normalize_timestamp(timestamp),
        "url": url,
        "comments": [],
        "_match_ids": build_match_ids(raw, url),
    }


def normalize_comment(raw: Dict) -> Tuple[Optional[str], Dict]:
    parent_id = (
        raw.get("note_id") or
        raw.get("aweme_id") or
        raw.get("comment_aweme_id") or
        raw.get("item_id") or
        raw.get("video_id") or ""
    )
    comment_id = (
        raw.get("comment_id") or
        raw.get("cid") or
        raw.get("id") or ""
    )
    comment = {
        "id": str(comment_id),
        "author": (
            raw.get("nickname") or
            raw.get("author") or
            raw.get("user_name") or
            raw.get("author_name") or "未知"
        ),
        "content": raw.get("content") or raw.get("text") or raw.get("desc") or "",
        "timestamp": normalize_timestamp(
            raw.get("create_time") or
            raw.get("created_at") or
            raw.get("create_date_time") or
            raw.get("last_modify_ts") or ""
        ),
    }
    return (str(parent_id) if parent_id else None, comment)


def is_comment_item(raw: Dict) -> bool:
    return any(key in raw for key in ("comment_id", "cid", "reply_id", "parent_comment_id"))


def collect_results(tmp_data_dir: str, platform_name: str, keyword: str) -> List[Dict]:
    posts_by_id: Dict[str, Dict] = {}
    posts_by_match_id: Dict[str, Dict] = {}
    comments_by_parent: Dict[str, List[Dict]] = {}

    for root, _dirs, files in os.walk(tmp_data_dir):
        for fname in files:
            if not fname.endswith(".jsonl"):
                continue
            fpath = os.path.join(root, fname)
            with open(fpath, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        raw = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if is_comment_item(raw):
                        parent_id, comment = normalize_comment(raw)
                        if parent_id:
                            comments_by_parent.setdefault(parent_id, []).append(comment)
                        continue

                    post = normalize_post(raw, platform_name, keyword)
                    if post["id"]:
                        posts_by_id[post["id"]] = post
                        for match_id in post.get("_match_ids", []):
                            posts_by_match_id[match_id] = post

    for post_id, comments in comments_by_parent.items():
        target_post = posts_by_id.get(post_id) or posts_by_match_id.get(post_id)
        if target_post:
            target_post["comments"] = comments

    results = list(posts_by_id.values())
    for item in results:
        item.pop("_match_ids", None)
        if item.get("comments"):
            item["comments"].sort(key=lambda comment: comment.get("timestamp", ""))
    results.sort(key=lambda item: item.get("timestamp", ""), reverse=True)
    return results


def normalize_keywords(values: List[str]) -> List[str]:
    normalized: List[str] = []
    for value in values:
        text = str(value or "").strip()
        if text and text not in normalized:
            normalized.append(text)
    return normalized


def filter_results_by_incremental(results: List[Dict], platform_name: str, keyword: str, is_incremental: bool) -> List[Dict]:
    if not is_incremental:
        return results

    state_file = PathManager.get_incremental_state_file()
    state = {}
    if state_file.exists():
        try:
            with open(state_file, "r", encoding="utf-8") as f:
                state = json.load(f)
        except Exception:
            pass

    key = f"{platform_name}_{keyword}"
    last_ts_str = state.get(key, "")
    
    filtered: List[Dict] = []
    new_latest_ts = last_ts_str

    for item in results:
        ts = str(item.get("timestamp") or "")
        if not ts:
            filtered.append(item)
            continue
        
        if not last_ts_str or ts > last_ts_str:
            filtered.append(item)
            if ts > new_latest_ts:
                new_latest_ts = ts

    if new_latest_ts > last_ts_str:
        state[key] = new_latest_ts
        try:
            with open(state_file, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False)
        except Exception:
            pass

    return filtered

def filter_results_by_content(results: List[Dict], include_keywords: List[str], exclude_keywords: List[str]) -> Tuple[List[Dict], int]:
    include_terms = [term.casefold() for term in normalize_keywords(include_keywords)]
    exclude_terms = [term.casefold() for term in normalize_keywords(exclude_keywords)]

    if not include_terms and not exclude_terms:
        return results, 0

    filtered: List[Dict] = []
    filtered_count = 0
    for item in results:
        content = str(item.get("content") or "").casefold()

        if include_terms and not all(term in content for term in include_terms):
            filtered_count += 1
            continue

        if exclude_terms and any(term in content for term in exclude_terms):
            filtered_count += 1
            continue

        filtered.append(item)

    return filtered, filtered_count


def make_wrapper_config(mc_platform: str, keyword: str, cookie_str: str,
                        count: int, data_dir: str, export_format: str = "excel") -> Dict:
    """生成动态覆盖 MediaCrawler config 的 JSON 配置数据"""
    login_type = "cookie" if cookie_str.strip() else "qrcode"
    use_cdp = True
    enable_get_comments = mc_platform in ("bili", "dy")
    
    # 提高并发度：基于 CPU 核心数，默认最多 6 个并发任务
    import multiprocessing
    cpu_count = multiprocessing.cpu_count() if multiprocessing.cpu_count() else 2
    max_concurrency = min(max(2, cpu_count), 6)

    return {
        "_MEDIA_CRAWLER_DIR": MEDIA_CRAWLER_DIR,
        "PLATFORM": mc_platform,
        "KEYWORDS": keyword,
        "LOGIN_TYPE": login_type,
        "COOKIES": cookie_str,
        "CRAWLER_TYPE": 'search',
        "SAVE_DATA_OPTION": "jsonl",
        "SAVE_DATA_PATH": data_dir,
        "CRAWLER_MAX_NOTES_COUNT": count,
        "HEADLESS": False,
        "ENABLE_CDP_MODE": use_cdp,
        "CDP_HEADLESS": False,
        "SAVE_LOGIN_STATE": True,
        "ENABLE_GET_COMMENTS": enable_get_comments,
        "CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES": 20,
        "ENABLE_GET_SUB_COMMENTS": mc_platform == "dy",
        "BROWSER_LAUNCH_TIMEOUT": 120,
        "ENABLE_GET_WORDCLOUD": False,
        "CRAWLER_MAX_SLEEP_SEC": 1,
        "MAX_CONCURRENCY_NUM": max_concurrency,
    }


def save_results(results: List[Dict], output_dir: str, platform_name: str, keyword: str, export_format: str) -> None:
    if not results or not output_dir:
        return

    try:
        os.makedirs(output_dir, exist_ok=True)
    except PermissionError:
        output_error(f"无法创建输出目录：{output_dir}，请检查目录权限。")
        return
    
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_base = os.path.join(output_dir, f"{platform_name}_{keyword}_{ts}")
    headers = ["id", "platform", "keyword", "author", "timestamp", "url", "content", "comment_count", "comments"]

    def to_export_row(item: Dict) -> Dict[str, str]:
        comments = item.get("comments") or []
        return {
            "id": str(item.get("id", "")),
            "platform": str(item.get("platform", "")),
            "keyword": str(item.get("keyword", "")),
            "author": str(item.get("author", "")),
            "timestamp": str(item.get("timestamp", "")),
            "url": str(item.get("url", "")),
            "content": str(item.get("content", "")),
            "comment_count": str(len(comments)),
            "comments": json.dumps(comments, ensure_ascii=False),
        }

    if export_format == "csv":
        out_file = f"{file_base}.csv"
        try:
            with open(out_file, "w", encoding="utf-8-sig", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=headers)
                writer.writeheader()
                for item in results:
                    writer.writerow(to_export_row(item))
        except PermissionError:
            output_error(f"无法写入文件：{out_file}，请检查目录权限。")
        return

    if export_format == "excel":
        out_file = f"{file_base}.xlsx"
        try:
            from openpyxl import Workbook
        except Exception:
            out_file = f"{file_base}.jsonl"
            try:
                with open(out_file, "w", encoding="utf-8") as f:
                    for item in results:
                        f.write(json.dumps(item, ensure_ascii=False) + "\n")
            except PermissionError:
                output_error(f"无法写入文件：{out_file}，请检查目录权限。")
            return

        wb = Workbook()
        ws = wb.active
        ws.title = "data"
        ws.append(headers)
        for item in results:
            row = to_export_row(item)
            ws.append([row.get(key, "") for key in headers])
        try:
            wb.save(out_file)
        except PermissionError:
            output_error(f"无法写入文件：{out_file}，请检查目录权限。")
        return

    out_file = f"{file_base}.jsonl"
    try:
        with open(out_file, "w", encoding="utf-8") as f:
            for item in results:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
    except PermissionError:
        output_error(f"无法写入文件：{out_file}，请检查目录权限。")


async def crawl_one(platform_id: str, mc_platform: str, keyword: str,
                    count: int, cookie_str: str, output_dir: str,
                    include_keywords: List[str], exclude_keywords: List[str],
                    export_format: str = "excel", is_incremental: bool = False):
    platform_name = PLATFORM_NAMES.get(platform_id, platform_id)
    tmp_data_dir = tempfile.mkdtemp(prefix=f"chitu_{mc_platform}_")

    try:
        output_progress(platform_name, keyword, 0, count, [])
        should_try_browser_fallback = platform_id == "weibo"

        cookie_error = validate_platform_cookie(platform_id, cookie_str)
        if cookie_error:
            output_error(cookie_error)
            return

        if platform_id == "xiaohongshu":
            fallback_results = await run_xhs_browser_fallback(keyword, count, cookie_str)
            fallback_results, xhs_filtered = filter_results_by_content(fallback_results, include_keywords, exclude_keywords)
            fallback_results = filter_results_by_incremental(fallback_results, platform_name, keyword, is_incremental)

            if not fallback_results:
                output_error(
                    f"{platform_name} 浏览器自动抓取已完成，但没有拿到可展示的数据。可能是关键词结果为空、登录态失效，或详情页没有成功加载。"
                )
                return

            # 严格控制返回数量，确保不超过预设 count
            if len(fallback_results) > count:
                fallback_results = fallback_results[:count]

            # 进度已在抓取过程中实时推送，这里只保存结果
            save_results(fallback_results, output_dir, platform_name, keyword, export_format)
            return

        if platform_id == "weibo":
            fallback_results = await run_weibo_browser_fallback(keyword, count, cookie_str)
            fallback_results, weibo_filtered = filter_results_by_content(fallback_results, include_keywords, exclude_keywords)
            fallback_results = filter_results_by_incremental(fallback_results, platform_name, keyword, is_incremental)

            if not fallback_results:
                output_error(
                    f"{platform_name} 浏览器自动抓取已完成，但没有拿到可展示的数据。可能是关键词结果为空、登录态失效，或详情页评论未加载出来。"
                )
                return

            # 严格控制返回数量
            if len(fallback_results) > count:
                fallback_results = fallback_results[:count]

            # 进度已在抓取过程中实时推送，这里只保存结果
            save_results(fallback_results, output_dir, platform_name, keyword, export_format)
            return

        # 写 wrapper 脚本
        wrapper_config = make_wrapper_config(mc_platform, keyword, cookie_str, count, tmp_data_dir, export_format)
        wrapper_file = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        )
        json.dump(wrapper_config, wrapper_file, ensure_ascii=False)
        wrapper_file.close()

        try:
            if IS_FROZEN:
                launcher = [sys.executable, "--run-wrapper"]
            else:
                launcher = [VENV_PYTHON, os.path.abspath(__file__), "--run-wrapper"]
            proc = await asyncio.create_subprocess_exec(
                *launcher,
                wrapper_file.name,
                cwd=MEDIA_CRAWLER_DIR,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            
            try:
                # 实时读取子进程输出，同时定期检查临时目录中的 JSONL 文件以推送进度
                async def read_stream(stream, stream_name):
                    if not stream:
                        return
                    while True:
                        line = await stream.readline()
                        if not line:
                            break
                        # 可以在这里解析 MediaCrawler 的日志来更新进度
                        pass

                # 启动后台任务定期检查临时目录
                async def poll_progress():
                    """定期检查临时目录中的 JSONL 文件，实时推送进度"""
                    seen_ids = set()
                    poll_interval = 2  # 每 2 秒检查一次
                    while proc.returncode is None:
                        await asyncio.sleep(poll_interval)
                        try:
                            # 读取当前已有的 JSONL 文件
                            current_results = collect_results(tmp_data_dir, platform_name, keyword)
                            new_items = []
                            for item in current_results:
                                item_key = f"{item['platform']}-{item['id']}"
                                if item_key not in seen_ids:
                                    seen_ids.add(item_key)
                                    new_items.append(item)
                            
                            if new_items:
                                output_progress(platform_name, keyword, len(seen_ids), count, new_items)
                        except Exception:
                            pass  # 忽略轮询期间的错误

                # 启动后台进度轮询
                poll_task = asyncio.create_task(poll_progress())

                try:
                    stdout_bytes, stderr_bytes = await asyncio.wait_for(
                        proc.communicate(), timeout=600
                    )
                except asyncio.TimeoutError:
                    proc.kill()
                    output_error(f"{platform_name}采集超时")
                    poll_task.cancel()
                    return
                
                # 等待轮询任务完成
                poll_task.cancel()
                try:
                    await poll_task
                except asyncio.CancelledError:
                    pass
            finally:
                if proc.returncode is None:
                    try:
                        proc.kill()
                    except Exception:
                        pass
        finally:
            os.unlink(wrapper_file.name)

        # 针对 MediaCrawler 吞掉了 DataFetchError 导致 returncode=0 但没有实际数据的问题：
        err_str = stderr_bytes.decode("utf-8", errors="replace")
        with open("/tmp/chitu_debug_stderr.log", "w") as f:
            f.write(err_str)
        login_type = "cookie" if cookie_str.strip() else "qrcode"
        if ("DataFetchError" in err_str or "RetryError" in err_str or "CAPTCHA" in err_str or "登录已过期" in err_str or "扫码登录失败" in err_str):
            # Exclude timeout errors when it's actually waiting for user input
            if "TimeoutError" in err_str and ("page.wait_for_timeout" in err_str or "PlaywrightTimeoutError" in err_str):
                pass
            elif should_try_browser_fallback:
                fallback_results = await run_browser_fallback(platform_id, keyword, count, cookie_str)
                fallback_results, _ = filter_results_by_content(fallback_results, include_keywords, exclude_keywords)
                fallback_results = filter_results_by_incremental(fallback_results, platform_name, keyword, is_incremental)
                if fallback_results:
                    if len(fallback_results) > count:
                        fallback_results = fallback_results[:count]
                    for i, item in enumerate(fallback_results):
                        output_progress(platform_name, keyword, i + 1, len(fallback_results), [item])
                    save_results(fallback_results, output_dir, platform_name, keyword, export_format)
                    return
            elif "扫码登录失败" in err_str or "登录已过期" in err_str:
                output_error(f"❌ [登录失效] {platform_name} 登录已失效或扫码失败。引导：请在配置页面重新扫码或更新最新Cookie。")
            elif "CAPTCHA" in err_str or "verify" in err_str.lower():
                output_error(f"⚠️ [风控触发] {platform_name} 触发了验证码拦截，当前请求受限！引导：请在真实浏览器中打开 {platform_name}，手动解除验证码后重试。")
            elif "TimeoutError" in err_str or "NetError" in err_str:
                output_error(f"❌ [网络错误] {platform_name} 接口请求超时或网络异常。引导：请检查网络连接或尝试更换代理 IP。")
            else:
                output_error(f"❌ [数据获取失败] {platform_name} 接口返回异常 (可能原因：Cookie无权限、账号被风控或频繁抓取)。引导：建议降低并发数或更换账号重试。")
            
            if "TimeoutError" not in err_str or ("page.wait_for_timeout" not in err_str and "PlaywrightTimeoutError" not in err_str):
                return
            
        if proc.returncode != 0:
            # Check if this is a playwright timeout error during wait_for_timeout
            if "TimeoutError" in err_str and ("page.wait_for_timeout" in err_str or "PlaywrightTimeoutError" in err_str):
                pass # Ignore expected timeout when waiting for user action
            elif should_try_browser_fallback:
                fallback_results = await run_browser_fallback(platform_id, keyword, count, cookie_str)
                fallback_results, _ = filter_results_by_content(fallback_results, include_keywords, exclude_keywords)
                fallback_results = filter_results_by_incremental(fallback_results, platform_name, keyword, is_incremental)
                if fallback_results:
                    if len(fallback_results) > count:
                        fallback_results = fallback_results[:count]
                    for i, item in enumerate(fallback_results):
                        output_progress(platform_name, keyword, i + 1, len(fallback_results), [item])
                    save_results(fallback_results, output_dir, platform_name, keyword, export_format)
                    return
            else:
                err = stderr_bytes.decode("utf-8", errors="replace")[-1000:]
                output_error(f"{platform_name}采集子进程异常退出 (code {proc.returncode}): {err}")
                return

        # 读取 JSONL 输出
        raw_results = collect_results(tmp_data_dir, platform_name, keyword)
        results, content_filtered_count = filter_results_by_content(raw_results, include_keywords, exclude_keywords)
        results = filter_results_by_incremental(results, platform_name, keyword, is_incremental)

        # 严格控制返回数量
        if len(results) > count:
            results = results[:count]

        if not results:
            if raw_results:
                output_error(
                    f"{platform_name} 已抓到 {len(raw_results)} 条原始内容，但都被当前“包含/不包含关键词”过滤掉了，请调整筛选条件后重试。"
                )
                return

            if should_try_browser_fallback:
                fallback_results = await run_browser_fallback(platform_id, keyword, count, cookie_str)
                fallback_results, _ = filter_results_by_content(fallback_results, include_keywords, exclude_keywords)
                if fallback_results:
                    if len(fallback_results) > count:
                        fallback_results = fallback_results[:count]
                    for i, item in enumerate(fallback_results):
                        output_progress(platform_name, keyword, i + 1, len(fallback_results), [item])
                    save_results(fallback_results, output_dir, platform_name, keyword, export_format)
                    return

            if f"search {mc_platform if mc_platform != 'dy' else 'douyin'} keyword: {keyword}, page: 1 is empty" in err_str:
                output_error(f"{platform_name} 当前关键词搜索结果为空，可能是平台风控、搜索页异常，或该账号此刻拿不到搜索数据。")
                return

            tail = err_str.strip().splitlines()[-1] if err_str.strip() else ""
            if tail:
                output_error(f"{platform_name} 本次运行未返回任何数据。最后一条调试信息：{tail}")
            else:
                output_error(
                    f"{platform_name} 本次运行已结束，但没有返回任何数据。可能是登录态失效、关键词结果为空，或平台触发了风控。"
                )
            return

        # 分批推送进度，提升实时响应体验
        chunk_size = 10  # 每 10 条推送一次
        for i in range(0, len(results), chunk_size):
            chunk = results[i:i + chunk_size]
            current = min(i + chunk_size, len(results))
            output_progress(platform_name, keyword, current, len(results), chunk, content_filtered_count, len(results))

        save_results(results, output_dir, platform_name, keyword, export_format)

    finally:
        shutil.rmtree(tmp_data_dir, ignore_errors=True)


async def main():
    config_line = sys.stdin.readline().strip()
    try:
        config = json.loads(config_line)
    except json.JSONDecodeError:
        output_error("Invalid config")
        return

    keywords: List[str] = config.get("keywords", [])
    include_keywords: List[str] = config.get("includeKeywords", [])
    exclude_keywords: List[str] = config.get("excludeKeywords", [])
    platforms: List[str] = config.get("platforms", [])
    count: int = config.get("count", 20)
    output_dir: str = config.get("outputDir", "")
    export_format: str = config.get("exportFormat", "excel")
    is_incremental: bool = config.get("incremental", False)

    cookies = load_cookies()

    tasks = []
    for keyword in keywords:
        for platform_id in platforms:
            mc_platform = PLATFORM_MAP.get(platform_id)
            if not mc_platform:
                continue
            cookie_str = cookies.get(platform_id, "")
            tasks.append(
                crawl_one(
                    platform_id,
                    mc_platform,
                    keyword,
                    count,
                    cookie_str,
                    output_dir,
                    include_keywords,
                    exclude_keywords,
                    export_format,
                    is_incremental
                )
            )

    if tasks:
        # 使用 Semaphore 控制并发度，提高默认值到 4
        sem = asyncio.Semaphore(4)

        async def bound_task(t):
            async with sem:
                await t

        await asyncio.gather(*(bound_task(t) for t in tasks))

    output_complete(len(tasks))


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--run-wrapper":
        run_wrapper_file(sys.argv[2])
        sys.exit(0)
    asyncio.run(main())
