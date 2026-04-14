# 赤兔数据采集系统 v0.0.26 - 项目完成报告

## 项目概述

"赤兔"是一款现代化的 macOS 桌面应用，用于根据关键词自动爬取多个社交平台的内容数据。

## 支持平台

| 平台 | 标识 | 状态 |
|------|------|------|
| 小红书 | xiaohongshu | ✅ 已实现 |
| 抖音 | douyin | ✅ 已实现 |
| 微博 | weibo | ✅ 已实现 |
| B 站 | bilibili | ✅ 已实现 |

## 已实现功能

### 1. 关键词管理
- 支持添加多个关键词
- 标签化展示已添加的关键词
- 支持回车快速添加
- 可单独删除每个关键词

### 2. 平台选择
- 四个平台复选框
- 支持单选/多选
- 美观的卡片式 UI
- 选中状态动画效果

### 3. 时间筛选
- 起始日期选择
- 结束日期选择
- 年月日分别可选
- 支持清除时间限制

### 4. 数量设置
- 预设值快速选择（10/50/100/200/500/1000）
- 自定义输入（10-1000）
- 滚轮滑块控制
- 实时数值显示

### 5. 实时进度展示
- 进度条动画
- 已爬取条数统计
- 当前平台/关键词显示
- 实时内容预览

### 6. 数据保存
- JSONL 格式存储
- 自动命名文件
- 包含原贴链接
- 包含评论数据

### 7. 界面设计
- 深色主题
- 渐变效果
- 流畅动画
- 响应式布局

### 8. Cookie 管理
- 支持导入各平台 Cookie
- Cookie 保存在 `~/.chitu/cookies.json`
- 支持扫码登录获取 Cookie

## 项目结构

```
ChiTu/
├── src/
│   ├── main/
│   │   └── main.ts           # Electron 主进程
│   ├── preload/
│   │   ├── preload.ts        # 预加载脚本
│   │   └── types.ts          # 类型定义
│   └── renderer/
│       ├── components/       # React 组件
│       │   ├── Header.tsx
│       │   ├── KeywordInput.tsx
│       │   ├── PlatformSelector.tsx
│       │   ├── DateRangePicker.tsx
│       │   ├── CountSelector.tsx
│       │   ├── ProgressBar.tsx
│       │   ├── ContentPreview.tsx
│       │   ├── CookieSettings.tsx
│       │   └── ActionButtons.tsx
│       ├── App.tsx           # 主应用
│       ├── index.tsx         # React 入口
│       └── index.css         # 全局样式
├── crawler/
│   ├── bridge.py            # 爬虫桥接入口
│   └── MediaCrawler/        # 爬虫框架
│       ├── main.py          # 爬虫核心
│       ├── media_platform/  # 平台爬虫实现
│       │   ├── xhs/         # 小红书
│       │   ├── douyin/      # 抖音
│       │   ├── weibo/       # 微博
│       │   └── bilibili/    # B 站
│       ├── config/          # 配置管理
│       └── tools/           # 工具库
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

## 技术栈

### 前端
- Electron 28
- React 18 + TypeScript
- Ant Design 5
- TailwindCSS
- Vite 5

### 后端爬虫
- Python 3.11
- Playwright (浏览器自动化)
- MediaCrawler 框架

## 运行方式

### 开发模式
```bash
# 使用启动脚本
chmod +x start.sh
./start.sh

# 或手动安装
npm install
cd crawler/MediaCrawler
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install
npm run dev
```

### 打包应用
```bash
npm run package
```

## 数据格式

每条爬取的数据包含以下字段：

```json
{
  "platform": "小红书",
  "keyword": "美妆",
  "content": "笔记内容...",
  "author": "作者名",
  "timestamp": "2026-03-23T16:38:56",
  "url": "https://www.xiaohongshu.com/explore/...",
  "comments": [
    {
      "author": "评论者",
      "content": "评论内容",
      "timestamp": "2026-03-23T17:00:00",
      "likes": 10
    }
  ],
  "crawled_at": "2026-03-23T17:00:00"
}
```

## 使用说明

1. **首次使用**：启动应用后，在设置中导入各平台 Cookie
2. 添加关键词（支持多个）
3. 选择要爬取的平台（可多选）
4. 设置时间范围（可选）
5. 设置爬取数量（10-1000）
6. 选择数据保存目录
7. 点击"开始爬取"

## 注意事项

### Cookie 获取
- 小红书：浏览器登录 xiaohongshu.com，复制 Cookie
- 抖音：浏览器登录 douyin.com，复制 Cookie
- 微博：浏览器登录 weibo.com，复制 Cookie
- B 站：浏览器登录 bilibili.com，复制 Cookie

### 合规使用
⚠️ 本软件仅供学习和研究使用
- 请遵守各平台的使用条款和 robots.txt 规则
- 请合理设置爬取频率
- 请勿用于商业用途
- 数据版权归原平台所有

## 免责声明

本软件仅供学习和研究使用：
- 请遵守各平台的使用条款
- 请勿用于商业用途
- 请合理设置爬取频率
- 数据版权归原平台所有

---

**开发完成时间**: 2026-03-24
**版本**: v0.0.26
