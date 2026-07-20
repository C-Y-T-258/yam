"""统计 MOE 名称数量."""
import json

data = json.load(open("data/moe_self_set_names.json", encoding="utf-8"))
print(f"总记录: {data['total_combos']}")
print(f"不同名称: {data['total_unique_names']}")
print(f"一级学科数: {len(data['by_discipline'])}")
total_searches = data["total_unique_names"]
print(f"需要搜索次数: 约 {total_searches} 次")
print(f"预计时间(2s/次): {total_searches * 2 / 60:.1f} 分钟")
print(f"并发5后预计: {total_searches * 2 / 5 / 60:.1f} 分钟")
