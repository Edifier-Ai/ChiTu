import asyncio
from typing import Any, List, Optional

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

async def wait_for_page_ready(page: Any, timeout_ms: int = 5000) -> None:
    for state in ("domcontentloaded", "networkidle"):
        try:
            await page.wait_for_load_state(state, timeout=timeout_ms)
        except Exception:
            pass

async def safe_page_evaluate(page: Any, expression: str, arg: Any = None, retries: int = 3) -> Any:
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

async def safe_page_content(page: Any, retries: int = 3) -> str:
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

async def wait_for_visible_results(page: Any, selectors: List[str], timeout_seconds: float = 120.0) -> bool:
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