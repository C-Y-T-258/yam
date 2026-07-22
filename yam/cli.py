"""YAM 命令行入口."""

import asyncio
import os
import sys
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from yam.audit import DataAuditor
from yam.config import config
from yam.crawler.dynamic import DynamicYanZhaoCrawler, LoginRequiredError
from yam.crawler.yanzhao import YanZhaoCrawler
from yam.crawler.zhangshangkaoyan import ZhangShangKaoYanCrawler
from yam.storage.db import Database
from yam.utils import now_str
from yam.verify import CrossSourceVerifier

app = typer.Typer(help="研喵 YAM - 本地优先的考研择校数据工具")
console = Console()


@app.command()
def list_majors(
    all: bool = typer.Option(False, "--all", help="显示所有专业，包括未启用"),
) -> None:
    """列出支持的专业."""
    majors = config.list_majors(enabled_only=not all)

    table = Table(title="YAM 支持的专业")
    table.add_column("代码", style="cyan")
    table.add_column("名称")
    table.add_column("门类")
    table.add_column("学位类型")
    table.add_column("启用", justify="center")

    for major in majors:
        table.add_row(
            major["code"],
            major["name"],
            f"{major['category_code']} {major['category_name']}",
            major.get("degree_type", "-"),
            "✓" if major.get("enabled") else "",
        )

    console.print(table)


@app.command()
def fetch(
    major: str = typer.Option(..., "--major", "-m", help="专业代码，如 085410"),
    years: Optional[list[int]] = typer.Option(
        None, "--year", "-y", help="要抓取的分数线年份，可多次指定"
    ),
    dry_run: bool = typer.Option(False, "--dry-run", help="仅模拟，不写入数据库"),
    limit: int = typer.Option(0, "--limit", "-l", help="限制抓取学校数量，0 表示全部"),
    skip_scores: bool = typer.Option(False, "--skip-scores", help="跳过分数线抓取"),
    force: bool = typer.Option(False, "--force", help="强制重新抓取，忽略已有的 fetch_log 记录"),
) -> None:
    """抓取指定专业的数据."""
    major_info = config.get_major(major)
    if not major_info:
        console.print(f"[red]错误：未知专业代码 {major}[/red]")
        raise typer.Exit(1)

    if not major_info.get("enabled"):
        # 输出结构化 YAM_ERROR 让 Rust 端捕获并展示给用户
        # 之前只是警告但继续执行，会导致后续采集流程异常卡住（ISSUE-022）
        msg = f"专业 {major} {major_info['name']} 当前未启用，暂不支持采集，请选择其他专业"
        console.print(f"[red]错误：{msg}[/red]")
        print(f"YAM_ERROR {msg}", flush=True)
        raise typer.Exit(1)

    target_years = years or [2026, 2025, 2024, 2023]

    console.print(f"[bold]开始抓取 {major} {major_info['name']} 数据...[/bold]")
    console.print(f"目标年份：{target_years}")

    if force:
        with Database() as db:
            db.conn.execute(
                "DELETE FROM fetch_log WHERE major_code = ?", (major,)
            )
            db.conn.commit()
        console.print("[yellow]已强制清空历史抓取记录，将重新抓取所有院校[/yellow]")

    crawler = YanZhaoCrawler(major, major_info["name"])
    score_crawler = ZhangShangKaoYanCrawler(major, major_info["name"])
    is_desktop = bool(os.environ.get("YAM_DESKTOP"))
    try:
        schools = crawler.fetch_schools()
    except LoginRequiredError as e:
        if is_desktop:
            console.print(
                f"[red]错误：{e}\n"
                f"请在桌面端完成登录向导后再试。[/red]"
            )
            print(f"YAM_ERROR 需要登录研招网：{e}", flush=True)
        else:
            console.print(
                f"[red]错误：{e}\n"
                f"请先在终端运行：yam fetch-seeds -m {major} --login 完成研招网登录后重试。[/red]"
            )
            print(f"YAM_ERROR 需要登录研招网：{e}。请先运行 yam fetch-seeds -m {major} --login", flush=True)
        raise typer.Exit(1) from e
    except RuntimeError as e:
        console.print(f"[red]错误：{e}[/red]")
        print(f"YAM_ERROR {e}", flush=True)
        raise typer.Exit(1) from e
    except Exception as e:
        # 捕获所有其他异常（网络超时、Playwright 错误等），
        # 输出结构化错误而非让 Python 打印完整 traceback 到 stderr。
        console.print(f"[red]采集异常：{e}[/red]")
        print(f"YAM_ERROR 采集异常：{type(e).__name__}: {e}", flush=True)
        raise typer.Exit(1) from e
    if limit > 0:
        schools = schools[:limit]

    console.print(f"共 {len(schools)} 所院校待抓取")

    if dry_run:
        console.print("[yellow]这是模拟运行，不写入数据库[/yellow]")
        return

    # ISSUE-029：httpx 并发采集（套用 ISSUE-023 验证可行的 15 并发 + 限流退避）
    asyncio.run(
        _fetch_async(
            major=major,
            major_info=major_info,
            schools=schools,
            target_years=target_years,
            skip_scores=skip_scores,
        )
    )


async def _fetch_async(
    major: str,
    major_info: dict,
    schools: list[dict],
    target_years: list[int],
    skip_scores: bool,
) -> None:
    """ISSUE-029 异步并发采集核心逻辑.

    两阶段并发：
    1. 阶段 1：fetch_departments_batch 并发获取所有待采集校的院系所
    2. 阶段 2：fetch_score_lines_batch 并发获取所有待采集校的分数线

    进度协议（与 commands.rs process_stdout_line 兼容）：
    - YAM_TOTAL {total_tasks}（院系任务数 + 分数线任务数）
    - YAM_PROGRESS {current}/{total} 院系|分数线 {name}
    - YAM_DONE {success} {failed} {skipped}
    """
    crawler = YanZhaoCrawler(major, major_info["name"])
    score_crawler = ZhangShangKaoYanCrawler(major, major_info["name"])

    with Database() as db:
        fetched_school_ids = _get_fetched_school_ids(db, major, "departments")
        fetched_score_ids = (
            set() if skip_scores else _get_fetched_school_ids(db, major, "score_lines")
        )

        # 过滤出需要采集的学校（跳过已成功的）
        pending_schools = [s for s in schools if s["school_id"] not in fetched_school_ids]
        skipped_count = len(schools) - len(pending_schools)
        score_pending = (
            [s for s in pending_schools if s["school_id"] not in fetched_score_ids]
            if not skip_scores else []
        )

        # 总任务数 = 院系阶段 + 分数线阶段
        total_tasks = len(pending_schools) + len(score_pending)
        print(f"YAM_TOTAL {total_tasks}", flush=True)
        console.print(f"待采集院系：{len(pending_schools)} 所，跳过（已存在）：{skipped_count} 所")
        if not skip_scores:
            console.print(f"待采集分数线：{len(score_pending)} 所")

        updated_at = now_str()
        success = 0
        failed = 0
        skipped = skipped_count
        score_success = 0
        score_failed = 0

        # ===== 阶段 1：并发获取院系所（三阶段降级重试）=====
        if pending_schools:
            console.print(
                f"[bold cyan]阶段 1/2：并发获取院系所（{len(pending_schools)} 所，三阶段降级）...[/bold cyan]"
            )

            def _dept_progress(current: int, total: int, name: str) -> None:
                print(f"YAM_PROGRESS {current}/{total_tasks} 院系 {name}", flush=True)

            def _dept_log(level: str, msg: str) -> None:
                # 转发为 YAM_LOG 协议供 Rust 端解析并 emit 给前端
                print(f"YAM_LOG {level} {msg}", flush=True)
                # 同时在终端彩色显示
                style = {"info": "dim", "warn": "yellow", "success": "green"}.get(level, "dim")
                console.print(f"  [{style}]{msg}[/{style}]")

            depts_map, depts_errors = await crawler.fetch_departments_with_retries(
                pending_schools,
                on_progress=_dept_progress,
                on_log=_dept_log,
            )

            # 写入数据库（按原始顺序，便于日志可读）
            for school in pending_schools:
                school_id = school["school_id"]
                name = school["name"]
                if school_id not in depts_map:
                    # 失败（HTTP 错误/限流/flag=false），记录真实错误
                    err_msg = depts_errors.get(school_id, "未知失败")
                    db.log_fetch(major, school_id, "departments", "failed", err_msg)
                    failed += 1
                    console.print(f"  [red]{name} 院系失败：{err_msg[:60]}[/red]")
                    continue
                depts = depts_map[school_id]
                try:
                    db.save_school(major, school, updated_at)
                    for dept in depts:
                        db.save_department(major, school_id, dept, updated_at)
                    db.log_fetch(major, school_id, "departments", "success")
                    success += 1
                    console.print(f"  [green]{name} OK[/green] ({len(depts)} 个院系)")
                except Exception as e:
                    db.log_fetch(major, school_id, "departments", "failed", str(e))
                    failed += 1
                    console.print(f"  [red]{name} 写入失败：{str(e)[:50]}[/red]")

        # ===== 阶段 2：并发获取分数线 =====
        if score_pending:
            console.print(
                f"[bold cyan]阶段 2/2：并发获取分数线（{len(score_pending)} 所 × {len(target_years)} 年，15 并发）...[/bold cyan]"
            )
            print(f"YAM_LOG info 阶段 2/2：并发获取分数线（{len(score_pending)} 所，15 并发）...", flush=True)

            offset = len(pending_schools)

            def _score_progress(current: int, total: int, name: str) -> None:
                print(f"YAM_PROGRESS {offset + current}/{total_tasks} 分数线 {name}", flush=True)

            scores_map = await score_crawler.fetch_score_lines_batch(
                score_pending, target_years, on_progress=_score_progress
            )

            for school in score_pending:
                school_id = school["school_id"]
                name = school["name"]
                if school_id not in scores_map:
                    # 失败（school_id 未找到/HTTP 错误）
                    db.log_fetch(major, school_id, "score_lines", "failed", "school_id 未找到或网络错误")
                    score_failed += 1
                    console.print(f"  [yellow]{name} 分数线失败[/yellow]")
                    continue
                scores = scores_map[school_id]
                try:
                    for score in scores:
                        db.save_score_line(
                            major,
                            school_id,
                            score["department_id"],
                            score["year"],
                            score,
                            score_crawler.source,
                            updated_at,
                        )
                    db.log_fetch(major, school_id, "score_lines", "success")
                    score_success += 1
                    console.print(f"  [blue]{name} 分数线 {len(scores)} 条[/blue]")
                except Exception as e:
                    db.log_fetch(major, school_id, "score_lines", "failed", str(e))
                    score_failed += 1
                    console.print(f"  [yellow]{name} 分数线写入失败：{str(e)[:40]}[/yellow]")

        db.save_snapshot(major, major_info["name"], school_count=success, source="yanzhao")

    console.print(f"\n[bold]抓取完成[/bold]")
    console.print(f"院系成功：{success} 所")
    console.print(f"院系失败：{failed} 所")
    console.print(f"院系跳过（已存在）：{skipped} 所")
    if not skip_scores:
        console.print(f"分数线成功：{score_success} 所")
        console.print(f"分数线失败：{score_failed} 所")

    print(f"YAM_DONE {success} {failed} {skipped}", flush=True)


def _get_fetched_school_ids(db: Database, major_code: str, task_type: str) -> set[str]:
    rows = db.conn.execute(
        "SELECT school_id FROM fetch_log WHERE major_code = ? AND task_type = ? AND status = 'success'",
        (major_code, task_type),
    ).fetchall()
    return {row["school_id"] for row in rows if row["school_id"]}


@app.command()
def fetch_plans(
    major: str = typer.Option(..., "--major", "-m", help="专业代码，如 085410"),
    years: Optional[list[int]] = typer.Option(
        None, "--year", "-y", help="要抓取的年份，可多次指定"
    ),
    dry_run: bool = typer.Option(False, "--dry-run", help="仅模拟，不写入数据库"),
    limit: int = typer.Option(0, "--limit", "-l", help="限制抓取学校数量，0 表示全部"),
) -> None:
    """抓取掌上考研招生计划（按专业代码过滤）."""
    major_info = config.get_major(major)
    if not major_info:
        console.print(f"[red]错误：未知专业代码 {major}[/red]")
        raise typer.Exit(1)

    target_years = years or [2026, 2025, 2024, 2023]
    crawler = ZhangShangKaoYanCrawler(major, major_info["name"])
    schools = YanZhaoCrawler(major, major_info["name"]).fetch_schools()
    if limit > 0:
        schools = schools[:limit]

    console.print(
        f"[bold]开始抓取 {major} {major_info['name']} 的招生计划，"
        f"目标年份 {target_years}...[/bold]"
    )
    console.print(f"共 {len(schools)} 所院校待抓取")

    if dry_run:
        console.print("[yellow]这是模拟运行，不写入数据库[/yellow]")
        return

    with Database() as db:
        fetched_ids = _get_fetched_school_ids(db, major, "admission_plans")
        success = 0
        failed = 0
        skipped = 0
        updated_at = now_str()

        for i, school in enumerate(schools):
            school_id = school["school_id"]
            name = school["name"]

            if school_id in fetched_ids:
                skipped += 1
                continue

            console.print(f"[{i+1}/{len(schools)}] {name} ... ", end="")

            try:
                plans = crawler.fetch_admission_plans(school, target_years)
                for plan in plans:
                    db.save_admission_plan(
                        major, school_id, plan, crawler.source, updated_at
                    )
                db.log_fetch(major, school_id, "admission_plans", "success")
                console.print(f"[green]OK[/green] ({len(plans)} 条计划)")
                success += 1
            except Exception as e:
                db.log_fetch(major, school_id, "admission_plans", "failed", str(e))
                console.print(f"[red]失败[/red] {str(e)[:50]}")
                failed += 1

    console.print(f"\n[bold]抓取完成[/bold]")
    console.print(f"成功：{success} 所")
    console.print(f"失败：{failed} 所")
    console.print(f"跳过（已存在）：{skipped} 所")


@app.command()
def fetch_seeds(
    major: str = typer.Option(..., "--major", "-m", help="专业代码，如 085410"),
    login: bool = typer.Option(False, "--login", "-l", help="先打开浏览器让用户登录"),
) -> None:
    """从研招网抓取完整院校列表并更新种子文件.

    需要安装动态抓取依赖：pip install 'kaoyan-yam[dynamic]'
    首次使用建议加 --login 参数手动登录，cookie 会保存到 ~/.yam/cookies/
    """
    major_info = config.get_major(major)
    if not major_info:
        console.print(f"[red]错误：未知专业代码 {major}[/red]")
        raise typer.Exit(1)

    try:
        import playwright  # noqa: F401
    except ImportError:
        console.print(
            "[red]未安装动态抓取依赖，请运行：pip install 'kaoyan-yam[dynamic]'[/red]"
        )
        raise typer.Exit(1)

    crawler = DynamicYanZhaoCrawler(major, major_info["name"])

    if login:
        console.print("[yellow]将打开浏览器窗口，请在 5 分钟内完成研招网登录...[/yellow]")
        import asyncio

        result = asyncio.run(crawler.login_and_fetch())
    else:
        try:
            console.print(f"[bold]开始抓取 {major} 的完整院校列表...[/bold]")
            import asyncio

            result = asyncio.run(crawler.fetch_and_save())
        except LoginRequiredError as e:
            console.print(f"[red]{e}[/red]")
            console.print("[yellow]请运行：yam fetch-seeds -m {major} --login[/yellow]")
            raise typer.Exit(1)

    count = result.get("school_count", 0)
    console.print(f"[green]种子文件已更新，共 {count} 所院校[/green]")


@app.command()
def search_majors(
    yjxkdm: str = typer.Option("", "--yjxkdm", help="按一级学科代码查询，如 0812"),
    name: str = typer.Option("", "--name", help="按专业名称关键词查询，如 '软件'"),
    login: bool = typer.Option(False, "--login", "-l", help="先打开浏览器让用户登录"),
    json_output: bool = typer.Option(False, "--json", help="输出 JSON（供桌面端调用）"),
) -> None:
    """实时查询研招网 zys.do 接口获取所有专业.

    --yjxkdm：按一级学科代码查询（推荐，能拿全完整专业列表）
    --name：按专业名称关键词查询（适合已知名称反查代码）

    未登录时仅能拿前 10 条；加 --login 先在浏览器中登录研招网。
    """
    if not yjxkdm and not name:
        console.print("[red]错误：必须指定 --yjxkdm 或 --name[/red]")
        raise typer.Exit(1)

    try:
        import playwright  # noqa: F401
    except ImportError:
        msg = "未安装动态抓取依赖，请运行：pip install 'kaoyan-yam[dynamic]'"
        if json_output:
            print(f'{{"error": "{msg}"}}', flush=True)
        else:
            console.print(f"[red]{msg}[/red]")
        raise typer.Exit(1)

    from yam.majors_searcher import MajorsSearcher

    searcher = MajorsSearcher(headless=not login)

    async def run() -> dict:
        await searcher._ensure_browser()
        try:
            if login:
                # --login 模式：先打开可见浏览器让用户手动登录
                # 清空旧 cookies 强制重新登录，避免过期 session 误判
                logged_in = await searcher.interactive_login(
                    major_code_for_login=yjxkdm + "00" if yjxkdm else "081200"
                )
                if not logged_in:
                    return {
                        "majors": [],
                        "total_count": 0,
                        "fetched_count": 0,
                        "need_login": True,
                        "error": "未检测到登录凭证，请确认已在浏览器中完成研招网登录",
                    }
            if yjxkdm:
                return await searcher.search_by_yjxkdm(yjxkdm)
            return await searcher.search_by_name(name)
        finally:
            await searcher.close()

    try:
        result = asyncio.run(run())
    except Exception as e:
        msg = str(e)
        if json_output:
            print(f'{{"error": "{msg}"}}', flush=True)
        else:
            console.print(f"[red]查询失败：{msg}[/red]")
        raise typer.Exit(1)

    if json_output:
        # 结构化 JSON 输出，供 Rust 端解析
        import json as _json
        print("YAM_SEARCH_RESULT " + _json.dumps(result, ensure_ascii=False), flush=True)
        return

    majors = result.get("majors", [])
    total = result.get("total_count", 0)
    fetched = result.get("fetched_count", 0)
    need_login = result.get("need_login", False)

    console.print(
        f"[bold]查询：{yjxkdm or name}[/bold]  "
        f"研招网返回 {total} 个，已抓取 {fetched} 个"
    )
    if need_login:
        console.print(
            "[yellow]未登录研招网，仅拿到前 10 条。"
            "运行 yam search-majors --yjxkdm ... --login 先登录可拿全。[/yellow]"
        )

    table = Table(title=f"研招网专业列表（{yjxkdm or name}）")
    table.add_column("代码", style="cyan")
    table.add_column("名称")
    table.add_column("一级学科")
    table.add_column("门类")
    table.add_column("学位类型")

    for m in majors:
        xwlx_label = {"xs": "学术", "zy": "专业"}.get(m.get("xwlx", ""), "-")
        table.add_row(
            m.get("zydm", ""),
            m.get("zymc", ""),
            f"{m.get('yjxkdm', '')} {m.get('yjxkmc', '')}",
            f"{m.get('mldm', '')} {m.get('mlmc', '')}",
            xwlx_label,
        )

    console.print(table)


@app.command()
def stats(
    major: str = typer.Option(..., "--major", "-m", help="专业代码"),
) -> None:
    """查看指定专业的数据完整率."""
    with Database() as db:
        s = db.get_stats(major)

    table = Table(title=f"{major} 数据完整率")
    table.add_column("指标", style="cyan")
    table.add_column("数量", justify="right")

    table.add_row("院校数", str(s.get("school_count", 0)))
    table.add_row("院系所数", str(s.get("department_count", 0)))
    table.add_row("2026 分数线", str(s.get("score_2026", 0)))
    table.add_row("2025 分数线", str(s.get("score_2025", 0)))
    table.add_row("2024 分数线", str(s.get("score_2024", 0)))
    table.add_row("2023 分数线", str(s.get("score_2023", 0)))

    console.print(table)


@app.command()
def audit(
    major: str = typer.Option(..., "--major", "-m", help="专业代码"),
) -> None:
    """审计指定专业的数据质量."""
    with Database() as db:
        auditor = DataAuditor(db)
        issues = auditor.audit(major)

    if not issues:
        console.print(f"[green]{major} 数据审计通过，未发现问题[/green]")
        return

    table = Table(title=f"{major} 数据审计问题")
    table.add_column("级别", style="red")
    table.add_column("类别")
    table.add_column("描述")

    for issue in issues:
        table.add_row(issue.level, issue.category, issue.message)

    console.print(table)


@app.command()
def cross_check(
    major: str = typer.Option(..., "--major", "-m", help="专业代码"),
    diff_abs: int = typer.Option(5, "--diff-abs", help="招生人数绝对差异阈值"),
    diff_pct: float = typer.Option(20.0, "--diff-pct", help="招生人数相对差异阈值（%）"),
) -> None:
    """跨数据源一致性校验，列出所有不一致或缺失的地方."""
    with Database() as db:
        verifier = CrossSourceVerifier(db)
        issues = verifier.verify(major, enrollment_diff_abs=diff_abs, enrollment_diff_pct=diff_pct)

    if not issues:
        console.print(f"[green]{major} 跨数据源校验通过，未发现问题[/green]")
        return

    # 分类统计
    counts: dict[str, int] = {}
    for issue in issues:
        counts[issue.category] = counts.get(issue.category, 0) + 1

    console.print(f"\n[bold]{major} 跨数据源校验结果[/bold]")
    console.print("两站口径不同，以下差异仅供参考，建议到院校官网核实最终数据。\n")

    for category, count in counts.items():
        console.print(f"[cyan]{category}[/cyan]: {count} 所")

    table = Table(title=f"{major} 数据不一致/缺失明细")
    table.add_column("级别", style="red")
    table.add_column("类别")
    table.add_column("院校")
    table.add_column("说明")

    for issue in issues:
        table.add_row(
            issue.level,
            issue.category,
            issue.school_name,
            issue.message,
        )

    console.print(table)


@app.command()
def serve(
    major: str = typer.Option(None, "--major", "-m", help="专业代码（可选，不指定则从启动画面选择）"),
    port: int = typer.Option(8080, "--port", "-p", help="UI 端口"),
) -> None:
    """启动本地桌面 UI."""
    try:
        import nicegui  # noqa: F401
    except ImportError:
        console.print(
            "[red]未安装 UI 依赖，请运行：pip install 'kaoyan-yam[ui]'[/red]"
        )
        raise typer.Exit(1)

    import subprocess
    import sys

    if major:
        console.print(f"[bold]启动 {major} 桌面 UI，端口 {port}...[/bold]")
    else:
        console.print(f"[bold]启动研喵 YAM，端口 {port}...[/bold]")
        console.print("[cyan]请在启动画面选择专业[/cyan]")
    console.print(f"[cyan]请打开浏览器访问：http://localhost:{port}[/cyan]")

    args = [sys.executable, "-m", "yam.ui_entry"]
    if major:
        args.append(major)
    args.append(str(port))

    subprocess.run(args, cwd=str(config.project_dir))


@app.callback()
def main() -> None:
    """YAM CLI."""


if __name__ == "__main__":
    app()
