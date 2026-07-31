# Week UP 轻量运行与版本清理设计

## 目标

将开发工程、生产运行包和用户数据彻底分层：

- 开发工程保留源码、测试、构建工具和 `node_modules`。
- 生产运行包只保留静态构建、服务端入口、必要领域模块和启动脚本。
- 用户数据库、备份、日志和 AI 状态继续独立存放在 `%LOCALAPPDATA%\Week UP`。
- 发布新版本后只保留当前版和上一版，并清理其余历史版本与残留临时构建目录。
- 压缩历史 SQLite 备份，限制迁移备份数量，并在备份后回收 WAL。

## 目录结构

默认安装根目录为 `%LOCALAPPDATA%\Programs\Week UP`：

```text
Week UP/
├── current.json
├── previous.json
├── run-current-week-up.ps1
├── versions/
│   ├── 0.1.0-<commit>/
│   └── 0.1.0-<previous-commit>/
└── .staging-*/
```

用户数据根目录保持为 `%LOCALAPPDATA%\Week UP`：

```text
Week UP/
├── data/
├── backups/
├── logs/
└── ai/
```

安装根和数据根必须是不同目录。清理器只允许删除安装根下 `versions` 中未受保护的直接子目录，以及安装根下符合临时命名规则的直接子目录。

## 运行包

运行包由构建后的 `demo-dist`、四个服务端模块、服务端实际依赖的领域模块和服务启动脚本组成。它不包含：

- `tests`
- React/TypeScript 页面源码
- `node_modules`
- npm/pnpm 缓存
- 文档
- 用户数据

版本号默认采用 `<package-version>-<git-short-sha>`。发布先写入独立 staging 目录，验证必需文件齐全后再原子移动到 `versions/<release-id>`。

## 版本保护与清理

发布完成后：

1. 读取原 `current.json`。
2. 将原当前版写为 `previous.json`。
3. 将新版本写为 `current.json`。
4. 再次读取当前版和上一版，组成保护集合。
5. 只删除 `versions` 下不在保护集合中的其他直接子目录。
6. 删除安装根下 `.staging-*`、`.tmp-*`、`tmp-*` 和 `build-*` 临时目录。

任何候选目标只要等于用户数据目录、位于用户数据目录内，或包含用户数据目录，清理立即拒绝。路径在删除前必须完成绝对化和根目录边界校验。

## 备份轻量化

- 最新每日备份保留为未压缩 SQLite，便于快速恢复。
- 更早的每日备份压缩为 `.sqlite.gz`。
- 每日备份继续保留最近 14 份，并最多补留 8 个较早的周一备份。
- 迁移/升级前备份只保留最新 2 份，其余删除；较旧的保留项使用 gzip。
- 每次备份成功后执行 WAL checkpoint truncate，减少活动数据目录占用。

压缩和删除只作用于传入的 `backups` 目录，不扫描其父目录，也不触碰 `data`、`logs` 或 `ai`。

## 启动与升级

计划任务改为指向安装根下稳定的 `run-current-week-up.ps1`。稳定启动器读取 `current.json`，再调用当前版本内的服务脚本。发布失败时不更新当前版指针，现有版本继续可用。

## 验证

- 单元测试验证当前版和上一版受保护、旧版本和临时目录被清理、数据目录永不成为删除目标。
- 集成测试从轻量运行包启动服务，证明运行不依赖 `node_modules` 或测试目录。
- SQLite 测试验证旧备份被压缩、迁移备份受限、最新每日备份可直接打开、WAL 可回收。
- 完整运行类型检查、测试、生产构建和本机发布烟雾测试。
