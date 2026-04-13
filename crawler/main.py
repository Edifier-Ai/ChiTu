"""
赤兔数据采集系统 - 爬虫模块
支持平台：小红书、抖音、微博、B 站

注意：此文件已被废弃，请使用 bridge.py 作为爬虫入口
"""

import sys
import os

# 直接调用 bridge.py
bridge_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bridge.py")
if os.path.exists(bridge_path):
    sys.path.insert(0, os.path.dirname(bridge_path))
    import bridge
    if __name__ == '__main__':
        import asyncio
        asyncio.run(bridge.main())
else:
    print("Error: bridge.py not found", file=sys.stderr)
    sys.exit(1)
