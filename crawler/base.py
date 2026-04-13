"""
爬虫基类
"""

import aiohttp
from typing import List, Dict, Any, Optional
from datetime import datetime


class BaseCrawler:
    """爬虫基类"""

    platform_name: str = "unknown"

    def __init__(self, keyword: str, max_count: int = 100):
        self.keyword = keyword
        self.max_count = max_count
        self.session: Optional[aiohttp.ClientSession] = None
        self.crawled_count = 0

    async def init_session(self):
        """初始化会话"""
        if self.session is None:
            self.session = aiohttp.ClientSession(
                headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                }
            )

    async def close_session(self):
        """关闭会话"""
        if self.session:
            await self.session.close()
            self.session = None

    async def search(self, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        搜索内容

        Args:
            start_date: 起始日期 YYYY-MM-DD
            end_date: 结束日期 YYYY-MM-DD

        Returns:
            爬取的数据列表
        """
        raise NotImplementedError("Subclasses must implement search method")

    async def get_comments(self, post_id: str) -> List[Dict[str, Any]]:
        """
        获取评论

        Args:
            post_id: 帖子 ID

        Returns:
            评论列表
        """
        return []

    def parse_item(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        解析单条数据

        Args:
            data: 原始数据

        Returns:
            标准化数据
        """
        return {
            'platform': self.platform_name,
            'keyword': self.keyword,
            'content': data.get('content', ''),
            'author': data.get('author', '未知'),
            'timestamp': data.get('timestamp', ''),
            'url': data.get('url', ''),
            'comments': data.get('comments', []),
            'crawled_at': datetime.now().isoformat()
        }

    async def crawl(self, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        执行爬取

        Args:
            start_date: 起始日期
            end_date: 结束日期

        Returns:
            爬取的数据列表
        """
        await self.init_session()
        try:
            results = await self.search(start_date, end_date)
            parsed_results = [self.parse_item(item) for item in results]
            return parsed_results[:self.max_count]
        finally:
            await self.close_session()
