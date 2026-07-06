"""数据爬取层."""

from yam.crawler.base import BaseCrawler
from yam.crawler.yanzhao import YanZhaoCrawler
from yam.crawler.zhangshangkaoyan import ZhangShangKaoYanCrawler

__all__ = ["BaseCrawler", "YanZhaoCrawler", "ZhangShangKaoYanCrawler"]
