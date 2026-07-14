"""YAM 命令行入口."""

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
) -> None:
    """抓取指定专业的数据."""
    major_info = config.get_major(major)
    if not major_info:
        console.print(f"[red]错误：未知专业代码 {major}[/red]")
        raise typer.Exit(1)

    if not major_info.get("enabled"):
        console.print(f"[yellow]警告：专业 {major} 当前未启用[/yellow]")

    target_years = years or [2026, 2025, 2024, 2023]

    console.print(f"[bold]开始抓取 {major} {major_info['name']} 数据...[/bold]")
    console.print(f"目标年份：{target_years}")

    crawler = YanZhaoCrawler(major, major_info["name"])
    score_crawler = ZhangShangKaoYanCrawler(major, major_info["name"])
    schools = crawler.fetch_schools()
    if limit > 0:
        schools = schools[:limit]

    console.print(f"共 {len(schools)} 所院校待抓取")
    total_schools = len(schools)
    print(f"YAM_TOTAL {total_schools}", flush=True)

    if dry_run:
        console.print("[yellow]这是模拟运行，不写入数据库[/yellow]")
        return

    with Database() as db:
        fetched_school_ids = _get_fetched_school_ids(db, major, "departments")
        fetched_score_ids = (
            set() if skip_scores else _get_fetched_school_ids(db, major, "score_lines")
        )
        success = 0
        failed = 0
        skipped = 0
        score_success = 0
        score_failed = 0
        updated_at = now_str()

        for i, school in enumerate(schools):
            school_id = school["school_id"]
            name = school["name"]
            print(f"YAM_PROGRESS {i + 1}/{total_schools} {name}", flush=True)

            if school_id in fetched_school_ids:
                skipped += 1
                continue

            console.print(f"[{i+1}/{len(schools)}] {name} ... ", end="")

            try:
                departments = crawler.fetch_departments(school)

                db.save_school(major, school, updated_at)
                for dept in departments:
                    db.save_department(major, school_id, dept, updated_at)

                db.log_fetch(major, school_id, "departments", "success")
                console.print(f"[green]OK[/green] ({len(departments)} 个院系)", end="")
                success += 1

            except Exception as e:
                db.log_fetch(major, school_id, "departments", "failed", str(e))
                console.print(f"[red]失败[/red] {str(e)[:50]}")
                failed += 1
                continue

            if skip_scores or school_id in fetched_score_ids:
                console.print("")
                continue

            try:
                scores = score_crawler.fetch_score_lines(school, target_years)
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
                console.print(f" [blue]分数线 {len(scores)} 条[/blue]")
                score_success += 1
            except Exception as e:
                db.log_fetch(major, school_id, "score_lines", "failed", str(e))
                console.print(f" [yellow]分数线失败 {str(e)[:40]}[/yellow]")
                score_failed += 1

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

        count = asyncio.run(crawler.login_and_fetch())
    else:
        try:
            console.print(f"[bold]开始抓取 {major} 的完整院校列表...[/bold]")
            import asyncio

            count = asyncio.run(crawler.fetch_and_save())
        except LoginRequiredError as e:
            console.print(f"[red]{e}[/red]")
            console.print("[yellow]请运行：yam fetch-seeds -m {major} --login[/yellow]")
            raise typer.Exit(1)

    console.print(f"[green]种子文件已更新，共 {count} 所院校[/green]")


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
