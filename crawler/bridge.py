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
from typing import List, Dict, Any, Optional, Tuple, TYPE_CHECKING
from datetime import datetime
import csv
from urllib.parse import quote, urljoin
from pathlib import Path

if TYPE_CHECKING:
    from playwright.async_api import Page, BrowserContext

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
COOKIES_FILE = os.path.expanduser("~/.chitu/cookies.json")

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


class DouyinVerificationRequired(Exception):
    pass


def emit_message(message_type: str, payload: Dict[str, Any]) -> None:
    print(
        json.dumps({"type": message_type, "payload": payload}, ensure_ascii=False),
        file=sys.stderr,
        flush=True,
    )


def load_cookies() -> Dict[str, str]:
    if not os.path.exists(COOKIES_FILE):
        return {}
    try:
        with open(COOKIES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_platform_cookie(platform_id: str, cookie_str: str) -> None:
    if not cookie_str.strip():
        return
    cookies = load_cookies()
    cookies[platform_id] = cookie_str
    try:
        Path(COOKIES_FILE).parent.mkdir(parents=True, exist_ok=True)
        with open(COOKIES_FILE, "w", encoding="utf-8") as f:
            json.dump(cookies, f, ensure_ascii=False, indent=2)
    except Exception as exc:
        emit_message("log", {
            "stream": "stderr",
            "message": f"保存{PLATFORM_NAMES.get(platform_id, platform_id)} Cookie 失败：{exc}",
        })


def parse_cookie_string(cookie_str: str) -> Dict[str, str]:
    cookie_dict: Dict[str, str] = {}
    for cookie in cookie_str.split(";"):
        cookie = cookie.strip()
        if not cookie or "=" not in cookie:
            continue
        key, value = cookie.split("=", 1)
        cookie_dict[key.strip()] = value.strip()
    return cookie_dict


def output_progress(platform: str, keyword: str, current: int, total: int, data: List[Dict] = None):
    emit_message("progress", {
        "platform": platform,
        "keyword": keyword,
        "current": current,
        "total": total,
        "data": data or [],
    })


def output_account_progress(company_name: str, platform: str, current: int, total: int, data: List[Dict] = None):
    emit_message("account-progress", {
        "companyName": company_name,
        "platform": platform,
        "current": current,
        "total": total,
        "data": data or [],
    })


def output_error(message: str) -> None:
    emit_message("error", {"message": message})


def output_complete(total: int) -> None:
    emit_message("complete", {"total": total})


def ensure_media_crawler_path() -> None:
    if MEDIA_CRAWLER_DIR not in sys.path:
        sys.path.insert(0, MEDIA_CRAWLER_DIR)


def is_transient_page_error(exc: Exception) -> bool:
    text = str(exc)
    lowered = text.lower()
    return (
        "execution context was destroyed" in lowered or
        "most likely because of a navigation" in lowered or
        "cannot find context with specified id" in lowered or
        "page has been closed" in lowered or
        "target closed" in lowered
    )


def build_browser_cookies(platform_id: str, cookie_str: str) -> List[Dict[str, Any]]:
    if not cookie_str.strip():
        return []

    cookie_dict = parse_cookie_string(cookie_str)
    if platform_id == "xiaohongshu":
        domains = [".xiaohongshu.com", "www.xiaohongshu.com", "edith.xiaohongshu.com"]
    elif platform_id == "weibo":
        domains = [".weibo.com", "weibo.com", ".m.weibo.cn", "m.weibo.cn"]
    elif platform_id == "douyin":
        domains = [".douyin.com", "www.douyin.com"]
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


async def serialize_context_cookies(context: "BrowserContext", platform_id: str) -> str:
    domain_terms = {
        "xiaohongshu": ("xiaohongshu.com",),
        "douyin": ("douyin.com",),
        "weibo": ("weibo.com", "m.weibo.cn"),
        "bilibili": ("bilibili.com",),
    }.get(platform_id, ())
    try:
        raw_cookies = await context.cookies()
    except Exception:
        return ""

    deduped: Dict[str, str] = {}
    for cookie in raw_cookies:
        name = str(cookie.get("name") or "")
        value = str(cookie.get("value") or "")
        domain = str(cookie.get("domain") or "")
        if not name or not value:
            continue
        if domain_terms and not any(term in domain for term in domain_terms):
            continue
        deduped[name] = value

    return "; ".join(f"{name}={value}" for name, value in sorted(deduped.items()))


async def wait_for_visible_results(page: "Page", selectors: List[str], timeout_seconds: float = 120.0) -> bool:
    deadline = asyncio.get_event_loop().time() + timeout_seconds
    selector_expr = ", ".join(selectors)
    while asyncio.get_event_loop().time() < deadline:
        try:
            count = await page.locator(selector_expr).count()
            if count > 0:
                return True
        except Exception:
            pass
        await asyncio.sleep(1)
    return False


async def wait_for_page_ready(page: "Page", timeout_ms: int = 5000) -> None:
    for state in ("domcontentloaded", "networkidle"):
        try:
            await page.wait_for_load_state(state, timeout=timeout_ms)
        except Exception:
            pass


async def safe_page_goto(page: "Page", url: str, timeout_ms: int = 60000) -> bool:
    for wait_until in ("commit", "domcontentloaded"):
        try:
            await page.goto(url, wait_until=wait_until, timeout=timeout_ms)
            await wait_for_page_ready(page, timeout_ms=5000)
            return True
        except Exception:
            if page.url and page.url != "about:blank":
                await wait_for_page_ready(page, timeout_ms=3000)
                return True
    return False


async def safe_page_evaluate(page: "Page", expression: str, arg: Any = None, retries: int = 3) -> Any:
    last_error: Optional[Exception] = None
    for _ in range(retries):
        try:
            await wait_for_page_ready(page, timeout_ms=3000)
            if arg is None:
                return await page.evaluate(expression)
            return await page.evaluate(expression, arg)
        except Exception as exc:
            last_error = exc
            if not is_transient_page_error(exc):
                raise
            await asyncio.sleep(1)
    if last_error:
        raise last_error
    return None


async def safe_page_content(page: "Page", retries: int = 3) -> str:
    last_error: Optional[Exception] = None
    for _ in range(retries):
        try:
            await wait_for_page_ready(page, timeout_ms=3000)
            return await page.content()
        except Exception as exc:
            last_error = exc
            if not is_transient_page_error(exc):
                raise
            await asyncio.sleep(1)
    if last_error:
        raise last_error
    return ""


async def scroll_search_results(page: "Page", target_count: int, selector: str, max_rounds: int = 10) -> None:
    previous_count = -1
    stable_rounds = 0
    rounds = max(2, min(max_rounds, max(4, target_count // 10)))
    for _ in range(rounds):
        try:
            current_count = await page.locator(selector).count()
        except Exception:
            current_count = 0
        if current_count >= target_count:
            break
        if current_count == previous_count:
            stable_rounds += 1
        else:
            stable_rounds = 0
        if stable_rounds >= 3:
            break
        previous_count = current_count
        try:
            await page.mouse.wheel(0, 1600)
        except Exception:
            pass
        await asyncio.sleep(1.2)


async def scrape_xhs_comments(page: "Page", max_comments: int = 5) -> List[Dict[str, str]]:
    comments: List[Dict[str, str]] = []
    for _ in range(4):
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
        await page.mouse.wheel(0, 900)
        await asyncio.sleep(1)
    return comments


async def scrape_weibo_comments(page: "Page", max_comments: int = 5) -> List[Dict[str, str]]:
    comments: List[Dict[str, str]] = []
    for _ in range(6):
        try:
            await safe_page_evaluate(
                page,
                """() => {
                    const unsafeHref = (href) => /\\/compose\\/comment|\\/compose\\//.test(href || '');
                    const candidates = Array.from(document.querySelectorAll(
                      'a[href="#comment"], a[href*="detail"][href*="comment"], [role="tab"], .m-tab a'
                    ));
                    for (const node of candidates) {
                        const text = (node.textContent || '').replace(/\\s+/g, '').trim();
                        const href = node.getAttribute('href') || '';
                        const isCommentTab = text === '评论' || text === '全部评论' || /^评论\\d*$/.test(text);
                        if (!isCommentTab || unsafeHref(href)) continue;
                        node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        break;
                    }
                    window.scrollBy(0, 800);
                }""",
            )
            await asyncio.sleep(1)
            if await is_weibo_comment_composer_page(page):
                return []
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
        await page.mouse.wheel(0, 900)
        await asyncio.sleep(1.2)
    return comments


async def is_weibo_comment_composer_page(page: "Page") -> bool:
    try:
        return bool(await safe_page_evaluate(
            page,
            """() => {
                const href = location.href || '';
                if (/\\/compose\\/comment(?:#comment)?/.test(href)) return true;
                const title = document.querySelector('title')?.textContent || '';
                const bodyText = document.body?.innerText || '';
                return title.includes('评论微博') ||
                  (bodyText.includes('评论微博') && bodyText.includes('写评论') && bodyText.includes('发送'));
            }""",
        ))
    except Exception:
        return False


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
            "profile_url": f"https://www.xiaohongshu.com/user/profile/{user_info.get('userId')}" if user_info.get("userId") else "",
            "user_id": user_info.get("userId") or "",
            "raw_bio": user_info.get("desc") or "",
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


async def is_xhs_logged_in(page: "Page", context: "BrowserContext") -> bool:
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


async def wait_for_xhs_login(page: "Page", context: "BrowserContext", timeout_seconds: float = 240.0) -> bool:
    deadline = asyncio.get_event_loop().time() + timeout_seconds
    while asyncio.get_event_loop().time() < deadline:
        if await is_xhs_logged_in(page, context):
            await asyncio.sleep(2)
            if await is_xhs_logged_in(page, context):
                return True
        await asyncio.sleep(2)
    return False


async def collect_xhs_search_cards(page: "Page") -> List[Dict[str, str]]:
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
                const profileLink = node.querySelector('a[href*="/user/profile/"]');
                const profileUrl = profileLink?.href || '';
                const userId = (profileUrl.match(/\\/user\\/profile\\/([^/?#]+)/) || [])[1] || '';
                if (!title && !content) continue;
                result.push({
                    href,
                    title,
                    content,
                    author,
                    profileUrl,
                    userId,
                });
            }
            return result;
        }""",
    )
    return cards or []


async def run_xhs_browser_fallback(keyword: str, count: int, cookie_str: str) -> List[Dict]:
    from playwright.async_api import async_playwright

    results: List[Dict] = []
    user_data_dir = os.path.expanduser("~/.chitu/browser/xiaohongshu")
    Path(user_data_dir).mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        context = await playwright.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=False,
        )
        cookies = build_browser_cookies("xiaohongshu", cookie_str)
        if cookies:
            await context.add_cookies(cookies)
        page = context.pages[0] if context.pages else await context.new_page()
        if not await safe_page_goto(page, "https://www.xiaohongshu.com/"):
            output_error("小红书页面加载超时，请检查当前网络是否能在浏览器中打开小红书，或稍后重试。")
            await context.close()
            return []

        if not await is_xhs_logged_in(page, context):
            output_error("小红书需要先在打开的浏览器里完成登录/二次验证，程序会继续等待登录成功。")
            if not await wait_for_xhs_login(page, context):
                output_error("小红书登录等待超时，请确认扫码和二次验证都已完成。")
                await context.close()
                return []

        search_url = f"https://www.xiaohongshu.com/search_result?keyword={quote(keyword)}&source=web_explore_feed"
        if not await safe_page_goto(page, search_url):
            output_error("小红书搜索页加载超时，请检查网络或平台风控状态后重试。")
            await context.close()
            return []
        await asyncio.sleep(3)
        await wait_for_visible_results(page, ['a[href*="/explore/"]', 'a[href*="/discovery/item/"]'])

        note_cards: List[Dict[str, str]] = []
        stagnant_rounds = 0
        while len(note_cards) < max(count * 2, 20) and stagnant_rounds < 5:
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
            await asyncio.sleep(1.2)

        for card in note_cards:
            if len(results) >= count:
                break
            raw_url = card.get("href", "")
            url = raw_url if raw_url.startswith("http") else urljoin("https://www.xiaohongshu.com", raw_url)
            note_match = re.search(r"/(?:explore|discovery/item)/([^/?]+)", url)
            if not note_match:
                continue
            note_id = note_match.group(1)
            detail_page = await context.new_page()
            try:
                if not await safe_page_goto(detail_page, url):
                    continue
                await asyncio.sleep(2)
                html = await safe_page_content(detail_page)
                post = extract_xhs_note_from_html(note_id, html, url, keyword)
                if not post:
                    content = card.get("content") or card.get("title") or ""
                    if not content:
                        continue
                    post = {
                        "id": note_id,
                        "platform": PLATFORM_NAMES["xiaohongshu"],
                        "keyword": keyword,
                        "content": content,
                        "author": card.get("author") or "未知",
                        "timestamp": "",
                        "url": url,
                        "comments": [],
                        "profile_url": card.get("profileUrl") or "",
                        "user_id": card.get("userId") or "",
                    }
                else:
                    post["comments"] = await scrape_xhs_comments(detail_page)

                if not post.get("author") or post.get("author") == "未知":
                    post["author"] = card.get("author") or post.get("author") or "未知"
                if not post.get("content"):
                    post["content"] = card.get("content") or card.get("title") or ""
                post["profile_url"] = post.get("profile_url") or card.get("profileUrl") or ""
                post["user_id"] = post.get("user_id") or card.get("userId") or ""
                results.append(post)
            finally:
                await detail_page.close()

        await context.close()
    return results


async def run_weibo_browser_fallback(keyword: str, count: int, cookie_str: str) -> List[Dict]:
    from playwright.async_api import async_playwright

    results: List[Dict] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=False)
        context = await browser.new_context()
        cookies = build_browser_cookies("weibo", cookie_str)
        if cookies:
            await context.add_cookies(cookies)
        page = await context.new_page()
        search_url = f"https://s.weibo.com/weibo?q={quote(keyword)}"
        if not await safe_page_goto(page, search_url):
            output_error("微博搜索页加载超时，请检查网络或平台风控状态后重试。")
            await context.close()
            await browser.close()
            return []
        await asyncio.sleep(3)
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
                        const profileEl = node.querySelector('a.name[href*=".weibo.com/"], a[href*="/u/"]');
                        const profileUrl = profileEl?.href || '';
                        const userId = (profileUrl.match(/\\/u\\/(\\d+)/) || profileUrl.match(/weibo\\.com\\/(\\d+)/) || [])[1] || '';
                        const timeEl = node.querySelector('.from a');
                        const time = timeEl?.textContent?.trim() || '';
                        const href = timeEl?.href || node.querySelector('a[href*="/detail/"], a[href*="/status/"]')?.href || '';
                        if (id && content) {
                            rows.push({ id, content, author, time, url: href, profileUrl, userId });
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
            await asyncio.sleep(1.2)

        for item in cards[:count]:
            detail_url = f"https://m.weibo.cn/detail/{item['id']}"
            detail_page = await context.new_page()
            comments: List[Dict[str, str]] = []
            try:
                if not await safe_page_goto(detail_page, detail_url):
                    raise TimeoutError("微博详情页加载超时")
                await asyncio.sleep(2.5)
                comments = await scrape_weibo_comments(detail_page)
            except Exception:
                comments = []
            finally:
                await detail_page.close()

            results.append({
                "id": str(item["id"]),
                "platform": PLATFORM_NAMES["weibo"],
                "keyword": keyword,
                "content": item.get("content", ""),
                "author": item.get("author") or "未知",
                "timestamp": item.get("time", ""),
                "url": detail_url,
                "profile_url": item.get("profileUrl", ""),
                "user_id": item.get("userId", ""),
                "comments": comments,
            })

        await context.close()
        await browser.close()
    return results


async def run_douyin_browser_fallback(
    keyword: str,
    count: int,
    cookie_str: str,
    terminal_error_on_verification: bool = True,
) -> List[Dict]:
    from playwright.async_api import async_playwright
    results: List[Dict] = []
    account_mode = not terminal_error_on_verification

    async def has_douyin_verification(page: "Page") -> bool:
        try:
            return bool(await safe_page_evaluate(
                page,
                """() => {
                    const text = document.body?.innerText || '';
                    const verificationTerms = [
                      '手机号验证',
                      '短信验证',
                      '安全验证',
                      '验证身份',
                      '请输入手机号',
                      '获取验证码',
                      '拖动滑块',
                      '请完成验证'
                    ];
                    return verificationTerms.some((term) => text.includes(term));
                }""",
            ))
        except Exception:
            return False

    async def wait_for_douyin_access(page: "Page", timeout_seconds: float = 180.0) -> bool:
        deadline = asyncio.get_event_loop().time() + timeout_seconds
        result_selectors = [
            '[data-e2e="search-card-video"]',
            '[class*="search-card"]',
            'a[href*="/video/"]',
            'a[href*="/user/"]',
        ]
        while asyncio.get_event_loop().time() < deadline:
            if await has_douyin_verification(page):
                await asyncio.sleep(2)
                continue
            try:
                if await wait_for_visible_results(page, result_selectors, timeout_seconds=3.0):
                    return True
            except Exception:
                pass
            await asyncio.sleep(2)
        return False

    async def persist_current_douyin_cookie(context: "BrowserContext") -> None:
        refreshed_cookie = await serialize_context_cookies(context, "douyin")
        if refreshed_cookie and parse_cookie_string(refreshed_cookie).get("sessionid"):
            save_platform_cookie("douyin", refreshed_cookie)
            emit_message("log", {
                "stream": "stderr",
                "message": "已保存本次验证后的抖音 Cookie，下次会复用当前登录态。",
            })

    async def extract_visible_douyin_cards(page: "Page") -> List[Dict]:
        return await safe_page_evaluate(
            page,
            """(options) => {
                const accountMode = Boolean(options?.accountMode);
                const result = [];
                const seen = new Set();
                const verificationTerms = [
                  '手机号验证', '短信验证', '安全验证', '验证身份',
                  '请输入手机号', '获取验证码', '拖动滑块', '请完成验证',
                  '为保护账号安全', '认证徽章', '已认证', '官方认证',
                  '企业认证', '蓝V认证', '蓝V'
                ];
                const normalize = (text) => (text || '').replace(/\\s+/g, ' ').trim();
                const bodyText = normalize(document.body?.innerText || '');
                if (verificationTerms.some((term) => bodyText.includes(term))) {
                    return [];
                }
                const cleanHref = (href) => {
                    try {
                        const url = new URL(href, location.origin);
                        url.search = '';
                        url.hash = '';
                        return url.href;
                    } catch (_) {
                        return href || '';
                    }
                };
                const profileIdFromUrl = (href) => {
                    const match = (href || '').match(/\\/user\\/([^/?#]+)/);
                    return match ? decodeURIComponent(match[1]) : '';
                };
                const isValidProfile = (href) => {
                    const userId = profileIdFromUrl(href);
                    if (!userId || userId === 'self') return false;
                    try {
                        const url = new URL(href, location.origin);
                        return /^\\/user\\/[^/?#]+/.test(url.pathname);
                    } catch (_) {
                        return /\\/user\\/[^/?#]+/.test(href || '');
                    }
                };
                const chooseRoot = (start) => {
                    let current = start;
                    let best = start;
                    for (let depth = 0; current && depth < 9; depth += 1) {
                        const tag = current.tagName || '';
                        if (tag === 'BODY' || tag === 'HTML') break;
                        const text = normalize(current.innerText || current.textContent || '');
                        const rect = current.getBoundingClientRect?.();
                        const usefulSize = !rect || (
                            rect.width >= 80 &&
                            rect.height >= 20 &&
                            rect.width <= 1280 &&
                            rect.height <= 760
                        );
                        const hasProfile = Boolean(current.querySelector?.('a[href*="/user/"]'));
                        const hasVideo = Boolean(current.querySelector?.('a[href*="/video/"]'));
                        const hasUserSignal = /粉丝|关注|获赞|作品|抖音号|简介/.test(text);
                        if (usefulSize && text.length >= 2 && text.length <= 1200 && (hasUserSignal || hasVideo || hasProfile || depth <= 2)) {
                            best = current;
                        }
                        if (tag === 'MAIN') break;
                        current = current.parentElement;
                    }
                    return best;
                };
                const pickText = (root, selectors) => {
                    for (const selector of selectors) {
                        const node = root.querySelector(selector);
                        const text = normalize(node?.innerText || node?.textContent || node?.getAttribute?.('aria-label') || node?.getAttribute?.('title') || '');
                        if (text) return text;
                    }
                    return '';
                };
                const textWithoutCounters = (text) => normalize(
                    (text || '')
                      .replace(/\\d+(?:\\.\\d+)?\\s*(?:亿|万|w|W|千|k|K)?\\s*(?:粉丝|获赞|点赞|关注|作品)/g, ' ')
                      .replace(/(?:粉丝|获赞|点赞|关注|作品)/g, ' ')
                );
                const badName = (text) => {
                    const value = normalize(text);
                    if (!value || value.length > 40) return true;
                    if (verificationTerms.some((term) => value.includes(term))) return true;
                    if (/^(关注|已关注|粉丝|获赞|点赞|作品|首页|朋友|消息|我的|我|登录|推荐|综合|视频|用户|直播|地点|头像|搜索|认证徽章|已认证|官方认证|企业认证|蓝V认证|蓝V)$/.test(value)) return true;
                    if (/^\\d/.test(value) && /(粉丝|关注|获赞|作品|点赞)/.test(value)) return true;
                    return false;
                };
                const splitLines = (text) => (text || '')
                    .split(/[\\n\\r]+/)
                    .map(normalize)
                    .filter(Boolean);
                const pickAuthor = (root, anchor) => {
                    const anchorText = textWithoutCounters(anchor?.innerText || anchor?.textContent || anchor?.getAttribute?.('aria-label') || anchor?.getAttribute?.('title') || '');
                    const anchorParts = anchorText.split(/[｜|·•]/).map(normalize).filter(Boolean);
                    const fromAnchor = anchorParts.find((line) => !badName(line));
                    if (fromAnchor) return fromAnchor;
                    const selectorText = textWithoutCounters(pickText(root, [
                      '[data-e2e*="user"]',
                      '[data-e2e*="author"]',
                      '[data-e2e*="nickname"]',
                      '[class*="author"]',
                      '[class*="Author"]',
                      '[class*="nickname"]',
                      '[class*="Nickname"]',
                      '[class*="name"]',
                      '[class*="Name"]'
                    ]));
                    const fromSelector = selectorText.split(/[｜|·•]/).map(normalize).find((line) => !badName(line));
                    if (fromSelector) return fromSelector;
                    return splitLines(root.innerText || root.textContent || '').find((line) => !badName(textWithoutCounters(line))) || '';
                };
                const extractFollowers = (text) => {
                    const patterns = [
                        /粉丝\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?\\s*(?:亿|万|w|W|千|k|K)?)/,
                        /(\\d+(?:\\.\\d+)?\\s*(?:亿|万|w|W|千|k|K)?)\\s*粉丝/
                    ];
                    for (const pattern of patterns) {
                        const match = (text || '').match(pattern);
                        if (match) return `${normalize(match[1])}粉丝`;
                    }
                    return '';
                };
                const extractBio = (root, author) => {
                    const picked = pickText(root, [
                      '[data-e2e*="user-desc"]',
                      '[class*="signature"]',
                      '[class*="Signature"]',
                      '[class*="desc"]',
                      '[class*="Desc"]',
                      '[class*="bio"]',
                      '[class*="Bio"]'
                    ]);
                    if (picked && !verificationTerms.some((term) => picked.includes(term))) {
                        return picked.slice(0, 180);
                    }
                    const lines = splitLines(root.innerText || root.textContent || '');
                    const bio = lines.find((line) => {
                        const clean = normalize(line);
                        if (clean === author || badName(clean)) return false;
                        if (/粉丝|获赞|关注|作品|抖音号/.test(clean)) return false;
                        return clean.length >= 4 && clean.length <= 180;
                    });
                    return bio || '';
                };
                const push = (item) => {
                    const profileUrl = cleanHref(item.profileUrl || '');
                    const href = cleanHref(item.href || '');
                    const userId = item.userId || profileIdFromUrl(profileUrl);
                    if (accountMode && !isValidProfile(profileUrl)) return;
                    if (accountMode && badName(item.author || '')) return;
                    const key = profileUrl || userId || href;
                    if (!key || seen.has(key)) return;
                    seen.add(key);
                    result.push({ ...item, href, profileUrl, userId });
                };

                for (const anchor of Array.from(document.querySelectorAll('a[href*="/user/"]'))) {
                    const profileUrl = cleanHref(anchor.href || anchor.getAttribute('href') || '');
                    if (!isValidProfile(profileUrl)) continue;
                    const root = chooseRoot(anchor);
                    const rootText = normalize(root.innerText || root.textContent || '');
                    if (!rootText || verificationTerms.some((term) => rootText.includes(term))) continue;
                    const author = pickAuthor(root, anchor);
                    const followers = extractFollowers(rootText);
                    const bio = extractBio(root, author);
                    const videoLink = root.querySelector('a[href*="/video/"]');
                    const href = cleanHref(videoLink?.href || '');
                    push({
                        href,
                        title: bio || rootText,
                        content: bio || rootText,
                        author,
                        profileUrl,
                        userId: profileIdFromUrl(profileUrl),
                        followers,
                        rawBio: bio,
                    });
                }

                if (!accountMode) {
                    for (const link of Array.from(document.querySelectorAll('a[href*="/video/"]'))) {
                        const href = cleanHref(link.href || link.getAttribute('href') || '');
                        if (!href) continue;
                        const root = chooseRoot(link);
                        const profileLink = root.querySelector('a[href*="/user/"]');
                        const profileUrl = cleanHref(profileLink?.href || '');
                        const rawText = normalize(root.innerText || root.textContent || '');
                        const title = pickText(root, [
                          '[data-e2e*="title"]',
                          '[class*="title"]',
                          '[class*="Title"]',
                          '[class*="desc"]',
                          '[class*="Desc"]'
                        ]);
                        const author = pickAuthor(root, profileLink);
                        push({
                            href,
                            title,
                            content: title || rawText || href,
                            author: author || '未知',
                            profileUrl,
                            userId: profileIdFromUrl(profileUrl),
                        });
                    }
                }
                return result;
            }""",
            {"accountMode": account_mode},
        ) or []

    user_data_dir = os.path.expanduser("~/.chitu/browser/douyin")
    Path(user_data_dir).mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        context = await playwright.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=False,
        )
        if cookie_str.strip():
            cookies = build_browser_cookies("douyin", cookie_str)
            if cookies:
                await context.add_cookies(cookies)
        page = context.pages[0] if context.pages else await context.new_page()
        search_types = ["user", "general"] if account_mode else ["video"]
        cards: List[Dict] = []
        for search_type in search_types:
            search_url = f"https://www.douyin.com/search/{quote(keyword)}?type={search_type}"
            if not await safe_page_goto(page, search_url):
                continue
            await asyncio.sleep(3)
            if await has_douyin_verification(page):
                emit_message("log", {
                    "stream": "stderr",
                    "message": "抖音触发手机号/安全验证，已打开持久化浏览器等待人工处理；完成验证后请保持窗口打开，程序会继续检测。"
                })
            if not await wait_for_douyin_access(page):
                continue

            await persist_current_douyin_cookie(context)
            await scroll_search_results(page, count, 'a[href*="/user/"], a[href*="/video/"]', max_rounds=16)
            cards = await extract_visible_douyin_cards(page)
            emit_message("log", {
                "stream": "stderr",
                "message": f"抖音关键词「{keyword}」{search_type} 搜索页解析到 {len(cards or [])} 条有效线索。",
            })
            if cards:
                break

        if not cards:
            await persist_current_douyin_cookie(context)
            message = "抖音当前页面没有解析到有效账号线索，可能是平台验证页、搜索页结构变化或该关键词暂无用户结果。"
            if terminal_error_on_verification:
                output_error(message)
            else:
                emit_message("log", {"stream": "stderr", "message": message})

        for card in (cards or [])[:count]:
            item_id = card.get("href", "").split("/video/")[-1].split("?")[0] if card.get("href") else ""
            results.append({
                "id": item_id or card.get("userId", "") or card.get("profileUrl", ""),
                "platform": PLATFORM_NAMES["douyin"],
                "keyword": keyword,
                "content": card.get("content") or card.get("title") or "",
                "author": card.get("author") or "未知",
                "timestamp": "",
                "url": card.get("href") or card.get("profileUrl", ""),
                "profile_url": card.get("profileUrl", ""),
                "user_id": card.get("userId", ""),
                "followers": card.get("followers") or "",
                "raw_bio": card.get("rawBio") or "",
                "comments": [],
            })
        await context.close()
    return results


async def run_bilibili_browser_fallback(keyword: str, count: int, cookie_str: str) -> List[Dict]:
    from playwright.async_api import async_playwright
    results: List[Dict] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=False)
        context = await browser.new_context()
        if cookie_str.strip():
            cookies = build_browser_cookies("bilibili", cookie_str)
            if cookies:
                await context.add_cookies(cookies)
        page = await context.new_page()
        search_url = f"https://search.bilibili.com/all?keyword={quote(keyword)}"
        if not await safe_page_goto(page, search_url):
            output_error("B站搜索页加载超时，请检查网络或平台风控状态后重试。")
            await context.close()
            await browser.close()
            return []
        await asyncio.sleep(3)
        await wait_for_visible_results(page, ['.video-list-item', '.article-item', '[class*="search-card"]'])

        cards = await safe_page_evaluate(
            page,
            """() => {
                const nodes = Array.from(document.querySelectorAll('.video-list-item, .article-item, [class*="search-card"]'));
                const result = [];
                const seen = new Set();
                for (const node of nodes) {
                    const link = node.querySelector('a[href*="/video/"], a[href*="/read/"]');
                    const href = link?.href || '';
                    if (!href || seen.has(href)) continue;
                    seen.add(href);
                    const title = (node.querySelector('.title, [class*="title"]')?.textContent || '').trim();
                    const desc = (node.querySelector('.desc, [class*="desc"]')?.textContent || '').trim();
                    const author = (node.querySelector('.up-name, [class*="author"]')?.textContent || '').trim();
                    if (!title && !desc) continue;
                    result.push({ href, title, content: desc || title, author });
                }
                return result;
            }""",
        )
        for card in (cards or [])[:count]:
            results.append({
                "id": card.get("href", "").split("/")[-1].split("?")[0] or "",
                "platform": PLATFORM_NAMES["bilibili"],
                "keyword": keyword,
                "content": card.get("content") or card.get("title") or "",
                "author": card.get("author") or "未知",
                "timestamp": "",
                "url": card.get("href", ""),
                "comments": [],
            })
        await context.close()
        await browser.close()
    return results


async def run_browser_fallback(platform_id: str, keyword: str, count: int, cookie_str: str) -> List[Dict]:
    try:
        if platform_id == "xiaohongshu":
            return await run_xhs_browser_fallback(keyword, count, cookie_str)
        if platform_id == "weibo":
            return await run_weibo_browser_fallback(keyword, count, cookie_str)
        if platform_id == "douyin":
            return await run_douyin_browser_fallback(keyword, count, cookie_str)
        if platform_id == "bilibili":
            return await run_bilibili_browser_fallback(keyword, count, cookie_str)
    except Exception as exc:
        output_error(f"{PLATFORM_NAMES.get(platform_id, platform_id)} 浏览器兜底抓取失败：{exc}")
    return []


def run_wrapper_file(wrapper_path: str) -> None:
    with open(wrapper_path, "r", encoding="utf-8") as f:
        source = f.read()

    # Reset argv so MediaCrawler's Typer CLI does not see bridge-only flags.
    sys.argv = [wrapper_path]

    globals_dict = {
        "__name__": "__main__",
        "__file__": wrapper_path,
    }
    exec(compile(source, wrapper_path, "exec"), globals_dict)


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


_URL_PATH_NOISE = {"explore", "discovery", "item", "detail", "status", "video", "p", "user", "profile", "search"}


def _looks_like_id(text: str) -> bool:
    if len(text) < 4:
        return False
    if text in _URL_PATH_NOISE:
        return False
    return bool(re.search(r"[a-zA-Z0-9]", text))


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
        for part in parts:
            if _looks_like_id(part):
                candidates.append(part)

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


def filter_results_by_content(results: List[Dict], include_keywords: List[str], exclude_keywords: List[str]) -> List[Dict]:
    include_terms = [term.casefold() for term in normalize_keywords(include_keywords)]
    exclude_terms = [term.casefold() for term in normalize_keywords(exclude_keywords)]

    if not include_terms and not exclude_terms:
        return results

    filtered: List[Dict] = []
    for item in results:
        content = str(item.get("content") or "").casefold()

        if include_terms and not all(term in content for term in include_terms):
            continue

        if exclude_terms and any(term in content for term in exclude_terms):
            continue

        filtered.append(item)

    return filtered


def _parse_date_filter(date_str: str):
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return None


def filter_results_by_date(results: List[Dict], start_date: str, end_date: str) -> List[Dict]:
    start = _parse_date_filter(start_date)
    end = _parse_date_filter(end_date)
    if not start and not end:
        return results

    filtered: List[Dict] = []
    for item in results:
        ts_str = str(item.get("timestamp") or "")
        if not ts_str:
            filtered.append(item)
            continue
        try:
            item_date = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).date()
        except ValueError:
            try:
                item_date = datetime.strptime(ts_str[:10], "%Y-%m-%d").date()
            except ValueError:
                filtered.append(item)
                continue

        if start and item_date < start:
            continue
        if end and item_date > end:
            continue
        filtered.append(item)

    return filtered


def make_wrapper_script(mc_platform: str, keyword: str, cookie_str: str,
                        count: int, data_dir: str, export_format: str = "excel",
                        start_date: str = "", end_date: str = "") -> str:
    """生成动态覆盖 MediaCrawler config 的 Python wrapper 脚本"""
    # 如果没有 Cookie，则使用 qrcode 登录；否则使用 cookie 登录
    login_type = "cookie" if cookie_str.strip() else "qrcode"

    # 小红书和抖音在标准模式下扫码登录容易失败，默认使用 CDP 模式
    use_cdp = True

    # 评论抓取按平台差异化开启。抖音和 B 站默认抓评论。
    enable_get_comments = mc_platform in ("bili", "dy")

    # 使用三重引号避免引号转义问题
    return f'''
import sys
import os
sys.path.insert(0, r"""{MEDIA_CRAWLER_DIR}""")

import config
config.PLATFORM = r"""{mc_platform}"""
config.KEYWORDS = r"""{keyword}"""
config.LOGIN_TYPE = r"""{login_type}"""
config.COOKIES = r"""{cookie_str}"""
config.CRAWLER_TYPE = 'search'
config.SAVE_DATA_OPTION = "jsonl"
config.SAVE_DATA_PATH = r"""{data_dir}"""
config.CRAWLER_MAX_NOTES_COUNT = {count}
config.START_DATE = r"""{start_date}"""
config.END_DATE = r"""{end_date}"""
config.HEADLESS = False
config.ENABLE_CDP_MODE = {str(use_cdp)}
config.CDP_HEADLESS = False
config.SAVE_LOGIN_STATE = True
config.ENABLE_GET_COMMENTS = {str(enable_get_comments)}
config.CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES = 20
config.ENABLE_GET_SUB_COMMENTS = {str(mc_platform == "dy")}
config.BROWSER_LAUNCH_TIMEOUT = 120

# 禁用词云生成，避免额外等待
config.ENABLE_GET_WORDCLOUD = False

# 设置 crawers 最大休眠时间（秒）
config.CRAWLER_MAX_SLEEP_SEC = 1

from tools.app_runner import run
from main import main, async_cleanup

run(main, async_cleanup, cleanup_timeout_seconds=60.0)
'''


def save_results(results: List[Dict], output_dir: str, platform_name: str, keyword: str, export_format: str) -> None:
    if not results or not output_dir:
        return

    os.makedirs(output_dir, exist_ok=True)
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
        with open(out_file, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            for item in results:
                writer.writerow(to_export_row(item))
        return

    if export_format == "excel":
        out_file = f"{file_base}.xlsx"
        try:
            from openpyxl import Workbook
        except Exception:
            out_file = f"{file_base}.jsonl"
            with open(out_file, "w", encoding="utf-8") as f:
                for item in results:
                    f.write(json.dumps(item, ensure_ascii=False) + "\n")
            return

        wb = Workbook()
        ws = wb.active
        ws.title = "data"
        ws.append(headers)
        for item in results:
            row = to_export_row(item)
            ws.append([row.get(key, "") for key in headers])
        wb.save(out_file)
        return

    out_file = f"{file_base}.jsonl"
    with open(out_file, "w", encoding="utf-8") as f:
        for item in results:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")


ACCOUNT_PLATFORM_IDS = {"xiaohongshu", "douyin", "weibo"}
EMPLOYEE_SIGNAL_TERMS = [
    "员工", "同事", "入职", "在职", "上班", "工牌", "内推", "招聘", "校招", "社招",
    "产品经理", "研发", "工程师", "设计", "运营", "市场", "售后", "门店", "导购", "销售",
    "办公室", "园区", "食堂", "团建", "公司", "老板",
]
DOUYIN_VERIFICATION_TERMS = [
    "手机号验证", "短信验证", "安全验证", "验证身份", "请输入手机号", "获取验证码",
    "拖动滑块", "请完成验证", "为保护账号安全",
]
INVALID_ACCOUNT_NAMES = {
    "", "未知", "我的", "我", "登录", "关注", "已关注", "粉丝", "获赞", "作品", "头像",
    "认证徽章", "已认证", "官方认证", "企业认证", "蓝V认证", "蓝V",
}
EMPLOYEE_NAME_BLOCK_TERMS = {
    "员工", "同事", "入职", "在职", "上班", "招聘", "内推", "产品经理", "研发", "售后",
    "账号", "官方", "粉丝", "僵尸", "公司", "科技", "旗舰店", "专卖店",
    "认证", "徽章", "蓝V",
}
OFFICIAL_ACCOUNT_TERMS = {"官方旗舰店", "旗舰店", "专卖店", "官方账号", "官方直播间", "企业号", "客服"}


def parse_count_text(value: Any) -> Tuple[Optional[int], str]:
    text = str(value or "").strip()
    if not text:
        return None, "未知"
    normalized = text.replace(",", "").replace("，", "")
    match = re.search(r"(\d+(?:\.\d+)?)\s*([亿万wW千kK]?)", normalized)
    if not match:
        return None, text
    number = float(match.group(1))
    unit = match.group(2).lower()
    if unit == "亿":
        number *= 100000000
    elif unit in ("万", "w"):
        number *= 10000
    elif unit in ("千", "k"):
        number *= 1000
    return int(number), text


def contains_douyin_verification_text(*values: Any) -> bool:
    text = " ".join(str(value or "") for value in values)
    return any(term in text for term in DOUYIN_VERIFICATION_TERMS)


def is_valid_douyin_profile(profile_url: str, user_id: str = "") -> bool:
    raw_profile = str(profile_url or "").strip()
    raw_user_id = str(user_id or "").strip()
    if raw_user_id == "self":
        return False
    if raw_profile:
        match = re.search(r"/user/([^/?#]+)", raw_profile)
        if not match:
            return False
        return match.group(1) != "self"
    return bool(raw_user_id and raw_user_id != "self")


def is_invalid_account_post(platform_id: str, post: Dict) -> bool:
    account_name = str(post.get("author") or "").strip()
    profile_url = str(post.get("profile_url") or post.get("profileUrl") or "").strip()
    user_id = str(post.get("user_id") or post.get("userId") or post.get("sec_uid") or "").strip()
    content = str(post.get("content") or "")
    raw_bio = str(post.get("raw_bio") or post.get("bio") or "")
    combined = " ".join([account_name, content, raw_bio])

    if contains_douyin_verification_text(content, raw_bio, account_name):
        return True

    if platform_id == "douyin":
        if account_name in INVALID_ACCOUNT_NAMES:
            return True
        if not is_valid_douyin_profile(profile_url, user_id):
            return True
        if any(term in combined for term in OFFICIAL_ACCOUNT_TERMS):
            return True

    return False


def looks_like_person_name(name: str, company_name: str) -> bool:
    value = str(name or "").strip()
    if not value or len(value) > 24 or company_name in value:
        return False
    if any(term in value for term in EMPLOYEE_NAME_BLOCK_TERMS):
        return False
    return bool(re.search(r"[\u4e00-\u9fa5A-Za-z]", value))


def is_valid_account_name(value: str) -> bool:
    name = str(value or "").strip()
    if not name or name in INVALID_ACCOUNT_NAMES or len(name) > 40:
        return False
    if any(term in name for term in DOUYIN_VERIFICATION_TERMS):
        return False
    if any(term in name for term in ("认证徽章", "已认证", "官方认证", "企业认证", "蓝V认证", "蓝V")):
        return False
    return bool(re.search(r"[\u4e00-\u9fa5A-Za-z]", name))


def clean_douyin_account_text(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return ""
    text = re.sub(r"(认证徽章|已认证|官方认证|企业认证|蓝V认证|蓝V)", " ", text).strip()
    split_patterns = [
        r"\s*抖音号[:：].*$",
        r"\s*Douyin ID[:：].*$",
        r"\s*发过相关视频.*$",
        r"\s*已关注.*$",
        r"\s*已\s*$",
        r"\s*关注\s*.*$",
        r"\s*获赞.*$",
        r"\s*\d+(?:\.\d+)?\s*(?:亿|万|w|W|千|k|K)?粉丝.*$",
    ]
    for pattern in split_patterns:
        text = re.sub(pattern, "", text).strip()
    return text.strip(" -_｜|:：")


def normalize_account_name(platform_id: str, post: Dict, fallback_name: str) -> str:
    if platform_id != "douyin":
        return fallback_name

    candidates = [
        post.get("raw_bio") or post.get("bio") or "",
        fallback_name,
        post.get("content") or "",
    ]
    for candidate in candidates:
        cleaned = clean_douyin_account_text(candidate)
        if is_valid_account_name(cleaned):
            return cleaned
    return fallback_name if is_valid_account_name(fallback_name) else "未知"


def derive_name_from_account(account_name: str, company_name: str) -> str:
    text = clean_douyin_account_text(account_name)
    if not text:
        return ""

    replacements = [
        f"{company_name}科技",
        f"{company_name}扫地机",
        f"{company_name}洗地机",
        f"{company_name}AURORA",
        company_name,
        "Dreame",
        "dreame",
    ]
    nickname = text
    for term in replacements:
        nickname = nickname.replace(term, "")
    nickname = nickname.strip(" -_｜|:：()（）")
    if "在" + company_name in nickname:
        nickname = nickname.split("在" + company_name, 1)[0].strip(" -_｜|:：")
    if nickname.endswith("在"):
        nickname = nickname[:-1].strip(" -_｜|:：")
    if "-" in nickname:
        nickname = nickname.split("-")[-1].strip(" -_｜|:：()（）")
    if "，" in nickname:
        nickname = nickname.split("，", 1)[0].strip()
    if "," in nickname:
        nickname = nickname.split(",", 1)[0].strip()
    if "(" in nickname:
        nickname = nickname.split("(", 1)[0].strip()
    if "（" in nickname:
        nickname = nickname.split("（", 1)[0].strip()
    if looks_like_person_name(nickname, company_name):
        return nickname
    return ""


def extract_profile_id(platform_id: str, post: Dict) -> str:
    user_id = str(post.get("user_id") or post.get("userId") or post.get("sec_uid") or "").strip()
    if user_id:
        return user_id
    profile_url = str(post.get("profile_url") or post.get("profileUrl") or "").strip()
    if platform_id == "xiaohongshu":
        match = re.search(r"/user/profile/([^/?#]+)", profile_url)
        if match:
            return match.group(1)
    if platform_id == "douyin":
        match = re.search(r"/user/([^/?#]+)", profile_url)
        if match:
            return match.group(1)
    if platform_id == "weibo":
        match = re.search(r"/u/(\d+)|weibo\.com/(\d+)", profile_url)
        if match:
            return match.group(1) or match.group(2) or ""
    return ""


def extract_suspected_employee_name(account_name: str, texts: List[str], company_name: str) -> str:
    direct_name = derive_name_from_account(account_name, company_name)
    if direct_name:
        return direct_name

    source_text = " ".join([account_name, *texts])
    cleaned_company = re.escape(company_name)
    patterns = [
        rf"{cleaned_company}[\s科技]*(?:员工|同事|产品经理|研发|工程师|运营|市场|售后|门店|导购|销售)?[\s:：-]*([\u4e00-\u9fa5]{{2,4}})",
        r"(?:我是|本人是|这里是|大家好我是)[\s:：-]*([\u4e00-\u9fa5]{2,4})",
        r"([\u4e00-\u9fa5]{1,2}(?:哥|姐|叔|姨|总|老师|同学))",
        r"(小[\u4e00-\u9fa5])",
    ]
    for pattern in patterns:
        match = re.search(pattern, source_text)
        if match:
            name = match.group(1).strip()
            if looks_like_person_name(name, company_name):
                return name

    nickname = re.sub(company_name, "", account_name).strip(" -_｜|:：")
    if 1 < len(nickname) <= 6 and looks_like_person_name(nickname, company_name):
        return nickname
    return "疑似员工但未公开姓名"


def score_employee_account(company_name: str, account_name: str, texts: List[str], profile_url: str) -> Tuple[int, str, List[str]]:
    evidence: List[str] = []
    score = 0
    combined = " ".join([account_name, *texts])
    company_terms = {company_name, "Dreame", "dreame"}

    if any(term and term in account_name for term in company_terms):
        score += 30
        evidence.append("账号名包含公司名称")
    if any(term and term in combined for term in company_terms):
        score += 20
        evidence.append("公开内容命中公司名称")

    employee_hits = [term for term in EMPLOYEE_SIGNAL_TERMS if term in combined]
    if employee_hits:
        score += min(30, 10 + len(employee_hits) * 4)
        evidence.append(f"公开文本包含员工/岗位信号：{'、'.join(employee_hits[:4])}")

    if profile_url:
        score += 5
        evidence.append("可定位公开主页")

    if len(texts) >= 2:
        score += min(10, len(texts) * 2)
        evidence.append(f"累计命中 {len(texts)} 条相关内容")

    if score >= 70:
        level = "高"
    elif score >= 40:
        level = "中"
    else:
        level = "低"

    if not evidence:
        evidence.append("仅通过关键词搜索命中，需人工复核")
    return min(score, 100), level, evidence


def build_account_results(company_name: str, posts: List[Dict], limit: int) -> List[Dict]:
    grouped: Dict[str, Dict[str, Any]] = {}
    collected_at = datetime.now().isoformat(timespec="seconds")

    for post in posts:
        platform_name = str(post.get("platform") or "")
        platform_id = next((key for key, name in PLATFORM_NAMES.items() if name == platform_name), "")
        if platform_id not in ACCOUNT_PLATFORM_IDS:
            continue
        if is_invalid_account_post(platform_id, post):
            continue

        raw_account_name = str(post.get("author") or "未知").strip() or "未知"
        account_name = normalize_account_name(platform_id, post, raw_account_name)
        profile_url = str(post.get("profile_url") or post.get("profileUrl") or "").strip()
        user_id = extract_profile_id(platform_id, post)
        fallback_id = (
            user_id or
            profile_url or
            str(post.get("url") or post.get("id") or "").strip() or
            account_name
        )
        key = f"{platform_id}:{fallback_id}"
        item = grouped.setdefault(key, {
            "platform": platform_id,
            "platformName": PLATFORM_NAMES.get(platform_id, platform_id),
            "accountName": account_name,
            "userId": user_id or fallback_id,
            "profileUrl": profile_url,
            "followersCount": None,
            "followersText": "未知",
            "sourceKeywords": [],
            "contents": [],
            "latestActiveAt": "",
            "rawBio": str(post.get("raw_bio") or post.get("bio") or ""),
            "rawVerifiedReason": str(post.get("verified_reason") or post.get("verifiedReason") or ""),
        })

        if account_name != "未知" and item["accountName"] == "未知":
            item["accountName"] = account_name
        if profile_url and not item["profileUrl"]:
            item["profileUrl"] = profile_url
        if user_id and not item["userId"]:
            item["userId"] = user_id

        follower_count, follower_text = parse_count_text(post.get("followers") or post.get("followers_text") or "")
        if follower_count is not None and (item["followersCount"] is None or follower_count > item["followersCount"]):
            item["followersCount"] = follower_count
            item["followersText"] = str(follower_count)

        keyword = str(post.get("keyword") or "").strip()
        if keyword and keyword not in item["sourceKeywords"]:
            item["sourceKeywords"].append(keyword)
        content = str(post.get("content") or "").strip()
        if content:
            item["contents"].append(content)
        timestamp = str(post.get("timestamp") or "").strip()
        if timestamp and timestamp > item["latestActiveAt"]:
            item["latestActiveAt"] = timestamp

    results: List[Dict] = []
    for item in grouped.values():
        evidence_texts = [item.get("rawBio") or "", item.get("rawVerifiedReason") or "", *item["contents"]]
        score, level, evidence = score_employee_account(
            company_name,
            item["accountName"],
            evidence_texts,
            item.get("profileUrl", ""),
        )
        suspected_name = extract_suspected_employee_name(item["accountName"], evidence_texts, company_name)
        result = {
            "rank": 0,
            "platform": item["platform"],
            "platformName": item["platformName"],
            "accountName": item["accountName"],
            "suspectedEmployeeName": suspected_name,
            "userId": item["userId"],
            "profileUrl": item["profileUrl"],
            "followersCount": item["followersCount"],
            "followersText": item["followersText"],
            "confidenceLevel": level,
            "confidenceScore": score,
            "evidence": evidence,
            "matchedPostCount": len(item["contents"]),
            "latestActiveAt": item["latestActiveAt"],
            "sourceKeywords": item["sourceKeywords"],
            "collectedAt": collected_at,
            "rawBio": item.get("rawBio") or "",
            "rawVerifiedReason": item.get("rawVerifiedReason") or "",
        }
        results.append(result)

    results.sort(
        key=lambda item: (
            item.get("confidenceScore") or 0,
            item.get("matchedPostCount") or 0,
            item.get("followersCount") or 0,
        ),
        reverse=True,
    )
    for index, item in enumerate(results[:limit], start=1):
        item["rank"] = index
    return results[:limit]


def save_account_results(results: List[Dict], output_dir: str, company_name: str, export_format: str) -> None:
    if not results or not output_dir:
        return

    os.makedirs(output_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_company = re.sub(r'[\\/:*?"<>|]', "_", company_name).strip() or "员工账号识别"
    file_base = os.path.join(output_dir, f"{safe_company}_员工账号识别_TOP{len(results)}_{ts}")
    headers = [
        "rank", "platformName", "accountName", "suspectedEmployeeName", "userId",
        "followersCount", "followersText", "confidenceLevel", "confidenceScore",
        "profileUrl", "evidence", "matchedPostCount", "latestActiveAt",
        "sourceKeywords", "collectedAt", "rawBio", "rawVerifiedReason",
    ]

    def row(item: Dict) -> Dict[str, str]:
        return {
            "rank": str(item.get("rank", "")),
            "platformName": str(item.get("platformName", "")),
            "accountName": str(item.get("accountName", "")),
            "suspectedEmployeeName": str(item.get("suspectedEmployeeName", "")),
            "userId": str(item.get("userId", "")),
            "followersCount": "" if item.get("followersCount") is None else str(item.get("followersCount")),
            "followersText": str(item.get("followersText", "")),
            "confidenceLevel": str(item.get("confidenceLevel", "")),
            "confidenceScore": str(item.get("confidenceScore", "")),
            "profileUrl": str(item.get("profileUrl", "")),
            "evidence": "；".join(item.get("evidence") or []),
            "matchedPostCount": str(item.get("matchedPostCount", "")),
            "latestActiveAt": str(item.get("latestActiveAt", "")),
            "sourceKeywords": "、".join(item.get("sourceKeywords") or []),
            "collectedAt": str(item.get("collectedAt", "")),
            "rawBio": str(item.get("rawBio", "")),
            "rawVerifiedReason": str(item.get("rawVerifiedReason", "")),
        }

    if export_format == "csv":
        with open(f"{file_base}.csv", "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            for item in results:
                writer.writerow(row(item))
        return

    if export_format == "excel":
        try:
            from openpyxl import Workbook
            wb = Workbook()
            ws = wb.active
            ws.title = "accounts"
            ws.append(headers)
            ws.freeze_panes = "A2"
            ws.auto_filter.ref = f"A1:Q{len(results) + 1}"
            widths = {
                "A": 8, "B": 12, "C": 24, "D": 18, "E": 28, "F": 14, "G": 14,
                "H": 10, "I": 14, "J": 40, "K": 46, "L": 16, "M": 20,
                "N": 24, "O": 22, "P": 36, "Q": 28,
            }
            for col, width in widths.items():
                ws.column_dimensions[col].width = width
            for item in results:
                data = row(item)
                values = [data.get(key, "") for key in headers]
                for index, key in enumerate(headers):
                    if key in {"rank", "followersCount", "followersText", "confidenceScore", "matchedPostCount"} and re.fullmatch(r"-?\d+", str(values[index])):
                        values[index] = int(values[index])
                ws.append(values)
            wb.save(f"{file_base}.xlsx")
            return
        except Exception:
            pass

    with open(f"{file_base}.jsonl", "w", encoding="utf-8") as f:
        for item in results:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")


async def collect_account_posts(platform_id: str, keyword: str, count: int, cookie_str: str) -> List[Dict]:
    if platform_id == "xiaohongshu":
        return await run_xhs_browser_fallback(keyword, count, cookie_str)
    if platform_id == "weibo":
        return await run_weibo_browser_fallback(keyword, count, cookie_str)
    if platform_id == "douyin":
        return await run_douyin_browser_fallback(keyword, count, cookie_str, terminal_error_on_verification=False)
    return []


async def run_account_identification(config: Dict[str, Any]) -> None:
    company_name = str(config.get("companyName") or "追觅").strip() or "追觅"
    raw_keywords = normalize_keywords(config.get("keywords", []))
    default_keywords = [
        company_name,
        f"{company_name}科技",
        f"{company_name}员工",
        f"{company_name}上班",
        f"{company_name}入职",
        f"{company_name}内推",
        f"{company_name}招聘",
        f"{company_name}产品经理",
        f"{company_name}研发",
        f"{company_name}售后",
        "Dreame",
    ]
    keywords = normalize_keywords([*raw_keywords, *default_keywords])
    platforms = [platform for platform in config.get("platforms", []) if platform in ACCOUNT_PLATFORM_IDS]
    limit = max(1, min(int(config.get("count", 100) or 100), 1000))
    fetch_count = max(20, min(limit, 200))
    output_dir = str(config.get("outputDir") or "")
    export_format = str(config.get("exportFormat") or "excel")
    cookies = load_cookies()

    all_posts: List[Dict] = []
    total_tasks = max(1, len(platforms) * len(keywords))
    finished_tasks = 0

    for platform_id in platforms:
        platform_name = PLATFORM_NAMES.get(platform_id, platform_id)
        cookie_str = cookies.get(platform_id, "")
        cookie_error = validate_platform_cookie(platform_id, cookie_str)
        if cookie_error:
            output_error(cookie_error)
            finished_tasks += len(keywords)
            continue
        for keyword in keywords:
            output_account_progress(company_name, platform_name, finished_tasks, total_tasks, [])
            try:
                posts = await collect_account_posts(platform_id, keyword, fetch_count, cookie_str)
                all_posts.extend(posts)
            except DouyinVerificationRequired as exc:
                emit_message("log", {"stream": "stderr", "message": f"{platform_name} 账号识别已跳过：{exc}"})
                finished_tasks += len(keywords) - keywords.index(keyword)
                partial_results = build_account_results(company_name, all_posts, limit)
                output_account_progress(company_name, platform_name, finished_tasks, total_tasks, partial_results)
                break
            except Exception as exc:
                emit_message("log", {"stream": "stderr", "message": f"{platform_name} 账号识别关键词「{keyword}」失败：{exc}"})
            finished_tasks += 1
            partial_results = build_account_results(company_name, all_posts, limit)
            output_account_progress(company_name, platform_name, finished_tasks, total_tasks, partial_results)

    final_results = build_account_results(company_name, all_posts, limit)
    save_account_results(final_results, output_dir, company_name, export_format)
    output_account_progress(company_name, "账号识别", total_tasks, total_tasks, final_results)
    output_complete(len(final_results))


_ErrorCategory = Optional[str]


def classify_error(stderr_text: str) -> _ErrorCategory:
    lowered = stderr_text.lower()
    if "登录已过期" in stderr_text or "扫码登录失败" in stderr_text:
        return "auth_expired"
    if "captcha" in lowered:
        return "captcha"
    if "datafetcherror" in lowered or "retryerror" in lowered:
        return "data_fetch"
    return None


def is_expected_user_timeout(stderr_text: str) -> bool:
    return "TimeoutError" in stderr_text and (
        "page.wait_for_timeout" in stderr_text or "PlaywrightTimeoutError" in stderr_text
    )


async def _try_browser_fallback(
    platform_id: str,
    platform_name: str,
    keyword: str,
    count: int,
    cookie_str: str,
    output_dir: str,
    include_keywords: List[str],
    exclude_keywords: List[str],
    export_format: str,
    start_date: str,
    end_date: str,
) -> bool:
    fallback_results = await run_browser_fallback(platform_id, keyword, count, cookie_str)
    fallback_results = filter_results_by_content(fallback_results, include_keywords, exclude_keywords)
    fallback_results = filter_results_by_date(fallback_results, start_date, end_date)
    if fallback_results:
        for i, item in enumerate(fallback_results):
            output_progress(platform_name, keyword, i + 1, len(fallback_results), [item])
        save_results(fallback_results, output_dir, platform_name, keyword, export_format)
        return True
    return False


def _emit_stderr_error(platform_name: str, category: _ErrorCategory, stderr_text: str, returncode: int = 0) -> None:
    if category == "auth_expired":
        output_error(f"❌ {platform_name} 登录已失效或扫码失败，请重新登录获取最新Cookie！")
    elif category == "captcha":
        output_error(f"⚠️ {platform_name} 触发了验证码拦截，Cookie暂时受限！")
    elif category == "data_fetch":
        output_error(f"❌ {platform_name} 接口数据获取失败 (可能是Cookie无权限或被风控)")
    elif returncode != 0:
        err = stderr_text[-1000:]
        output_error(f"{platform_name}采集子进程异常退出 (code {returncode}): {err}")
    else:
        tail = stderr_text.strip().splitlines()[-1] if stderr_text.strip() else ""
        if tail:
            output_error(f"{platform_name} 本次运行未返回任何数据。最后一条调试信息：{tail}")
        else:
            output_error(
                f"{platform_name} 本次运行已结束，但没有返回任何数据。可能是登录态失效、关键词结果为空，或平台触发了风控。"
            )


async def crawl_one(platform_id: str, mc_platform: str, keyword: str,
                    count: int, cookie_str: str, output_dir: str,
                    include_keywords: List[str], exclude_keywords: List[str],
                    export_format: str = "excel",
                    start_date: str = "", end_date: str = ""):
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
            fallback_results = filter_results_by_content(fallback_results, include_keywords, exclude_keywords)
            fallback_results = filter_results_by_date(fallback_results, start_date, end_date)

            if not fallback_results:
                output_error(
                    f"{platform_name} 浏览器自动抓取已完成，但没有拿到可展示的数据。可能是关键词结果为空、登录态失效，或详情页没有成功加载。"
                )
                return

            for i, item in enumerate(fallback_results):
                output_progress(platform_name, keyword, i + 1, len(fallback_results), [item])

            save_results(fallback_results, output_dir, platform_name, keyword, export_format)
            return

        if platform_id == "weibo":
            fallback_results = await run_weibo_browser_fallback(keyword, count, cookie_str)
            fallback_results = filter_results_by_content(fallback_results, include_keywords, exclude_keywords)
            fallback_results = filter_results_by_date(fallback_results, start_date, end_date)

            if not fallback_results:
                output_error(
                    f"{platform_name} 浏览器自动抓取已完成，但没有拿到可展示的数据。可能是关键词结果为空、登录态失效，或详情页评论未加载出来。"
                )
                return

            for i, item in enumerate(fallback_results):
                output_progress(platform_name, keyword, i + 1, len(fallback_results), [item])

            save_results(fallback_results, output_dir, platform_name, keyword, export_format)
            return

        # 写 wrapper 脚本
        wrapper_src = make_wrapper_script(mc_platform, keyword, cookie_str, count, tmp_data_dir, export_format, start_date, end_date)
        wrapper_file = tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        )
        wrapper_file.write(wrapper_src)
        wrapper_file.close()

        try:
            launcher = [sys.executable, "--run-wrapper"] if IS_FROZEN else [VENV_PYTHON]
            proc = await asyncio.create_subprocess_exec(
                *launcher,
                wrapper_file.name,
                cwd=MEDIA_CRAWLER_DIR,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    proc.communicate(), timeout=600
                )
            except asyncio.TimeoutError:
                proc.kill()
                output_error(f"{platform_name}采集超时")
                return
        finally:
            os.unlink(wrapper_file.name)

        err_str = stderr_bytes.decode("utf-8", errors="replace")
        with open("/tmp/chitu_debug_stderr.log", "w") as f:
            f.write(err_str)

        error_category = classify_error(err_str)
        has_expected_timeout = is_expected_user_timeout(err_str)

        # 子进程异常退出或检测到已知错误类型时，先尝试浏览器兜底
        if (proc.returncode != 0 or error_category) and not has_expected_timeout:
            if should_try_browser_fallback:
                if await _try_browser_fallback(
                    platform_id, platform_name, keyword, count, cookie_str,
                    output_dir, include_keywords, exclude_keywords, export_format,
                    start_date, end_date
                ):
                    return
            _emit_stderr_error(platform_name, error_category, err_str, proc.returncode)
            return

        # 读取 JSONL 输出
        raw_results = collect_results(tmp_data_dir, platform_name, keyword)
        results = filter_results_by_content(raw_results, include_keywords, exclude_keywords)
        results = filter_results_by_date(results, start_date, end_date)

        if not results:
            if raw_results:
                output_error(
                    f"{platform_name} 已抓到 {len(raw_results)} 条原始内容，但都被当前“包含/不包含关键词”过滤掉了，请调整筛选条件后重试。"
                )
                return

            if should_try_browser_fallback:
                if await _try_browser_fallback(
                    platform_id, platform_name, keyword, count, cookie_str,
                    output_dir, include_keywords, exclude_keywords, export_format,
                    start_date, end_date
                ):
                    return

            if f"search {mc_platform if mc_platform != 'dy' else 'douyin'} keyword: {keyword}, page: 1 is empty" in err_str:
                output_error(f"{platform_name} 当前关键词搜索结果为空，可能是平台风控、搜索页异常，或该账号此刻拿不到搜索数据。")
                return

            _emit_stderr_error(platform_name, error_category, err_str, proc.returncode)
            return

        # 推送给前端
        for i, item in enumerate(results):
            output_progress(platform_name, keyword, i + 1, len(results), [item])

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

    if config.get("taskType") == "account_identification":
        await run_account_identification(config)
        return

    keywords: List[str] = config.get("keywords", [])
    include_keywords: List[str] = config.get("includeKeywords", [])
    exclude_keywords: List[str] = config.get("excludeKeywords", [])
    platforms: List[str] = config.get("platforms", [])
    count: int = config.get("count", 20)
    output_dir: str = config.get("outputDir", "")
    export_format: str = config.get("exportFormat", "excel")
    start_date: str = config.get("startDate", "") or ""
    end_date: str = config.get("endDate", "") or ""

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
                    start_date,
                    end_date
                )
            )

    if tasks:
        # Run tasks sequentially to prevent multiple browser windows from popping up simultaneously
        for task in tasks:
            await task

    output_complete(len(tasks))


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--run-wrapper":
        run_wrapper_file(sys.argv[2])
        sys.exit(0)
    asyncio.run(main())
