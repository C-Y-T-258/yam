"""httpx 共享并发工具.

ISSUE-029 提取的公共模块，复用 ISSUE-023 验证可行的限流退避策略：
- 15 并发（研招网 IP 级限流，30 并发立即触发，15 + 400ms sleep 稳定）
- 限流指数退避重试 3 次（2s → 4s → 8s）
- 单任务失败不影响其他任务（gather 容错）

供 YanZhaoCrawler / ZhangShangKaoYanCrawler / DynamicReader 共用。
"""

from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable, TypeVar

import httpx

# ISSUE-023 实测稳定的并发参数
DEFAULT_CONCURRENCY = 15
# 限流指数退避：2s → 4s → 8s，共重试 3 次
DEFAULT_RETRY_BACKOFF: tuple[int, ...] = (2, 4, 8)
# 研招网限流响应关键词（msg 字段为字符串时表示被限流或需登录）
RATE_LIMIT_KEYWORDS: tuple[str, ...] = ("访问太频繁", "请稍后", "请登录")
# 请求间隔，避免触发"访问太频繁"
DEFAULT_SLEEP_BETWEEN: float = 0.4

T = TypeVar("T")


async def call_api_with_retry(
    client: httpx.AsyncClient,
    url: str,
    data: dict[str, str],
    headers: dict[str, str],
    *,
    timeout: float = 30.0,
    retry_backoff: tuple[int, ...] = DEFAULT_RETRY_BACKOFF,
    rate_limit_keywords: tuple[str, ...] = RATE_LIMIT_KEYWORDS,
    method: str = "POST",
) -> tuple[dict[str, Any] | None, str | None]:
    """调用 HTTP API，限流时指数退避重试.

    返回 (json_result, error_msg)：
    - 成功：(result_dict, None)
    - 限流耗尽重试：(None, limit_msg)
    - HTTP/JSON 异常：(None, error_str)

    限流判定：研招网响应 `{"msg": "访问太频繁"}` 或 `{"msg": "请登录"}` 时
    msg 字段为字符串（正常是 dict），视为限流/未登录，进入退避重试。
    """
    last_err: str | None = None
    total_attempts = len(retry_backoff) + 1

    for attempt in range(total_attempts):
        try:
            if method.upper() == "GET":
                r = await client.get(url, params=data, headers=headers, timeout=timeout)
            else:
                r = await client.post(url, data=data, headers=headers, timeout=timeout)

            if r.status_code != 200:
                last_err = f"HTTP {r.status_code}"
                if attempt < len(retry_backoff):
                    await asyncio.sleep(retry_backoff[attempt])
                    continue
                return None, last_err

            try:
                result = r.json()
            except Exception as e:
                last_err = f"JSON 解析失败: {e}"
                if attempt < len(retry_backoff):
                    await asyncio.sleep(retry_backoff[attempt])
                    continue
                return None, last_err

            # 限流判定：msg 为字符串且含限流关键词
            msg = result.get("msg", "") if isinstance(result, dict) else ""
            if isinstance(msg, str) and msg and any(k in msg for k in rate_limit_keywords):
                last_err = msg
                if attempt < len(retry_backoff):
                    await asyncio.sleep(retry_backoff[attempt])
                    continue
                return None, msg

            return result, None

        except (httpx.HTTPError, httpx.InvalidURL) as e:
            last_err = f"httpx 异常: {e}"
            if attempt < len(retry_backoff):
                await asyncio.sleep(retry_backoff[attempt])
                continue
            return None, last_err
        except Exception as e:
            last_err = f"未知异常: {e}"
            if attempt < len(retry_backoff):
                await asyncio.sleep(retry_backoff[attempt])
                continue
            return None, last_err

    return None, last_err


async def gather_with_concurrency(
    coros: list[Awaitable[T]],
    limit: int = DEFAULT_CONCURRENCY,
    *,
    sleep_between: float = 0.0,
) -> list[T]:
    """限制并发数的 gather.

    - 最多 `limit` 个协程同时执行
    - `sleep_between` > 0 时，每个任务启动后 sleep 一会（避免瞬间打满并发）
    - 单任务异常会被捕获并作为结果返回（调用方需自行处理 None/异常值）

    注意：调用方应在 coro 内部 try/except，否则异常会中断整个 gather。
    本函数不做吞异常处理，保持与 asyncio.gather 一致的行为。
    """
    sem = asyncio.Semaphore(limit)

    async def _wrap(coro: Awaitable[T]) -> T:
        async with sem:
            if sleep_between > 0:
                # 错开启动，降低同时打满并发的概率
                await asyncio.sleep(sleep_between * 0.1)
            return await coro

    return await asyncio.gather(*[_wrap(c) for c in coros])


async def gather_with_concurrency_safe(
    factory: Callable[[], Awaitable[T]],
    items: list[Any],
    limit: int = DEFAULT_CONCURRENCY,
) -> list[tuple[Any, T | Exception]]:
    """安全的并发 gather，单任务异常不中断整体.

    - `factory` 是无参函数（闭包），每次调用返回一个新协程
    - `items` 是任务对应的输入，用于结果回填
    - 返回 [(item, result_or_exception), ...]，顺序与 items 一致

    用于"批量并发 + 单任务容错"场景，如批量获取多校院系所。
    """
    sem = asyncio.Semaphore(limit)
    results: list[tuple[Any, T | Exception]] = [None] * len(items)  # type: ignore[list-item]

    async def _run(idx: int, item: Any) -> None:
        async with sem:
            try:
                result = await factory()
                results[idx] = (item, result)
            except Exception as e:
                results[idx] = (item, e)

    await asyncio.gather(*[_run(i, item) for i, item in enumerate(items)])
    return results


__all__ = [
    "DEFAULT_CONCURRENCY",
    "DEFAULT_RETRY_BACKOFF",
    "DEFAULT_SLEEP_BETWEEN",
    "RATE_LIMIT_KEYWORDS",
    "call_api_with_retry",
    "gather_with_concurrency",
    "gather_with_concurrency_safe",
]
