# Week UP Web

## Lightweight production runtime

开发工程、生产运行包和用户数据相互独立：

- 开发工程保留源码、测试和 `node_modules`。
- `npm run deploy:local` 构建并发布轻量运行包到 `%LOCALAPPDATA%\Programs\Week UP`。
- 运行包只保留当前版和上一版；其余版本及残留临时构建目录会自动清理。
- 正式数据库、压缩历史备份和日志独立保存在 `%LOCALAPPDATA%\Week UP`，不会进入版本清理范围。

```powershell
npm run deploy:local
```

本地优先的 Week UP Web 正式试用版，包含日程、目标、回顾、属性徽章、技能书收藏、体重趋势与 Learning MORE 联动。

## 本地运行

```powershell
npm install
npm run start
```

## 已包含

- 今日计划、完成打卡、属性经验与像素结算卡；
- Learning MORE 每日课表及完成状态直连演示；
- 目标计划、周日历、周月回顾；
- 属性徽章与技能书收藏；
- 体重每日值、7 日移动平均和目标线；
- 桌面与移动端响应式布局。

正式档案保存在 `%LOCALAPPDATA%\Week UP\data\week-up.sqlite`，自动备份位于 `%LOCALAPPDATA%\Week UP\backups`。浏览器 IndexedDB 只保留最近一次成功读取的缓存；首次切换到正式服务时会安全迁移旧浏览器档案。
