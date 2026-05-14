# 赤兔数据采集系统

> 一款在 macOS 上运行的数据采集软件，支持根据关键词自动爬取多个平台的用户信息

**版本号**: v0.0.28

## 功能特性

- ✅ 支持多关键词同时搜索
- ✅ 支持四个主流平台：小红书、抖音、微博、B 站
- ✅ 可自定义时间范围筛选
- ✅ 灵活的数量设置（10-1000 条）
- ✅ 实时爬取进度展示
- ✅ 数据本地保存为 Excel/CSV/JSONL 格式
- ✅ 每条数据附带原贴链接
- ✅ 现代化深色主题界面
- ✅ 自动保存登录状态，避免重复登录

## 技术栈

### 前端
- Electron 28
- React 18 + TypeScript
- Ant Design 5
- TailwindCSS

### 后端爬虫
- Python 3.11+
- Playwright (浏览器自动化)
- MediaCrawler 框架

## 快速开始

### 1. 安装依赖

```bash
# 安装 Node.js 依赖
npm install

# 安装 MediaCrawler 依赖
cd crawler/MediaCrawler
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install
```

### 2. 开发模式

```bash
chmod +x start.sh
./start.sh
```

### 3. 构建应用

```bash
npm run build
```

### 4. 打包 macOS 应用

```bash
npm run package
```

## 项目结构

```
ChiTu/
├── src/
│   ├── main/           # Electron 主进程
│   ├── preload/        # 预加载脚本
│   └── renderer/       # React 渲染进程
│       ├── components/ # UI 组件
│       ├── App.tsx     # 主应用组件
│       └── index.css   # 全局样式
├── crawler/            # Python 爬虫模块
│   ├── bridge.py       # 爬虫桥接入口
│   └── MediaCrawler/   # 爬虫框架
│       ├── main.py     # 爬虫核心
│       ├── media_platform/  # 平台爬虫实现
│       │   ├── xhs/         # 小红书
│       │   ├── douyin/      # 抖音
│       │   ├── weibo/       # 微博
│       │   └── bilibili/    # B 站
│       ├── config/     # 配置管理
│       └── tools/      # 工具库
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## 使用说明

1. **首次使用**：启动应用后，需要先登录各平台账号保存 Cookie
2. 添加关键词（支持多个）
3. 选择要爬取的平台（可多选）
4. 设置时间范围（可选）
5. 设置爬取数量（10-1000）
6. 选择数据保存目录
7. 点击"开始爬取"

## 注意事项

### Cookie 管理
- 首次使用需要登录各平台账号
- Cookie 保存在 `~/.chitu/cookies.json`
- Cookie 过期后需要重新登录

### 合规使用
⚠️ 本软件仅供学习和研究使用
- 请遵守各平台的使用条款和 robots.txt 规则
- 请合理设置爬取频率，避免对服务器造成压力
- 请勿用于商业用途
- 数据版权归原平台所有

## License

MIT
