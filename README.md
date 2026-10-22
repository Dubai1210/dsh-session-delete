# DSH Session Delete

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/Dubai1210/dsh-session-delete)

在会话「⋯」菜单的「归档会话」下面多一项 **删除会话**：点一下、确认一次，这个会话连同它在磁盘上的全部数据都会被彻底删掉。

DSH 自带的「归档」只是把会话从列表里挪走，文件还在、可以取消归档恢复。这个插件补上真正不可逆的那一步。

## 功能

- 菜单项插在 `sidebar.workspaces.session.menu.item` 插槽 **order 410**，即「归档会话」之后、「会话 ID」之前
- 垃圾桶图标，点击先关闭菜单，再弹出二次确认框（显示会话标题，明确写"无法恢复"）
- 确认后在 Host 侧一次性完成清理，所有已打开的窗口立刻把该行移除

## 删除范围

一次调用会删掉下面这些，缺一不可：

| 数据 | 处理 |
| --- | --- |
| 正在运行的 agent | `cancel({kind:"user"})` + `agent.scope.dispose()`，释放日志文件句柄 |
| 会话日志目录 | `~/.dsh/sessions/<project>/<session-id>/` 整目录删除（`session.v4.jsonl.zstd` 等世代日志） |
| 投影缓存 | `storages/session_projcache` 里该会话的行（含投影后的消息正文） |
| 工作区归属 | 从每个工作区记录的 `sessionIds` 中 `detachSession` |
| 归档 / 置顶集合 | 全局 `archivedSessionIds`、`pinnedSessionIds` 中移除 |
| 客户端列表 | `ctx.emit("api-session/removed", id)` → 所有窗口实时移除该行 |

删除**不进回收站**，不可恢复。

## 安装

源码安装（GitHub）：

```bash
dsh plugin --profile web add github:Dubai1210/dsh-session-delete
```

本地目录安装（开发调试）：

```bash
dsh plugin --profile desktop add link:/path/to/dsh-session-delete
```

安装后**刷新一次 DSH 窗口**（Ctrl+R）让 client bundle 加载；如果菜单里没有出现新项，重启一次 DSH。

## 使用

1. 在左侧工作区列表里找到目标会话行，点行尾的「⋯」
2. 选择「归档会话」下面的「**删除会话**」
3. 确认框里核对标题，点「删除」
4. 该会话行消失，磁盘上的对应目录同时被删除

## 权限与风险

- Host 半注册一个同源 HTTP 路由 `POST /dsh-session-delete/delete`，请求体 `{"sessionId":"..."}`。同源校验照抄 DSH 官方插件的做法：拒绝 `sec-fetch-site: cross-site`、`origin: null`、以及 `origin.host` 与 `host` 头不一致的请求
- 只操作本机 `~/.dsh` 下的会话数据与工作区注册表，**不发起任何外部网络请求**，不依赖任何第三方服务
- 没有任何遥测、没有后台常驻任务
- 风险点只有一个：删除是永久性的。确认框是唯一的刹车

## 兼容与运行要求

- DSH：0.2.x（desktop profile 与 web profile 均可）
- 平台：Windows / macOS / Linux
- 运行时：Node.js >= 18（Host 半只用 `node:fs/promises` 与 `node:path`）
- 依赖的服务：`webServer`、`sessions`、`agents`、`sessionPersistence`、`workspaceRegistry`、`storageDomain`，全部来自 DSH 基础 bundle，无额外依赖

## 能力分类

界面与体验（同时涉及会话与消息的数据清理）

## 实现说明

bundle 插件，两半：

**Host** — `lib/index.js`，导出 `apply(ctx)`，注册 `webServer` exact 路由。删除流水线：

1. 停活 agent 并释放文件句柄
2. `sessionPersistence.locate({cwd, id})` 定位日志文件，`rm -r` 其所在会话目录
3. `storageDomain.get("session_projcache").table("sessions").delete(id)` 清投影缓存行
4. 遍历 `workspaceRegistry.list()`，逐个 `entity.detachSession(id)`
5. `unarchiveSession(id)` + `unpinSession(id)` 清全局集合
6. `ctx.emit("api-session/removed", id)` 通知所有客户端

每一步独立 try/catch，单步失败不影响其余步骤；返回值 `{ok, live, removedFiles, cacheRows, headerFound}` 便于排查。

**Client** — `client.js`，`window.__ModuleLoader__.load` 注册懒工厂，往两个插槽注册：

- `sidebar.workspaces.session.menu.item` → 删除菜单项（order 410）
- `shell.overlay` → 确认弹窗（`Modal` + 取消/删除按钮）

确认后 `fetch("/dsh-session-delete/delete", {method:"POST"})`，同源、`credentials: same-origin`。

## 目录结构

```
dsh-session-delete/
├── package.json          # dsh.bundle.patch + dsh.client
├── cordis.patch.yml      # - insert: 宿主插件条目
├── lib/index.js          # Host 半：路由 + 删除流水线
├── client.js             # Client 半：菜单项 + 确认框
├── locale/en.json        # meta.title / meta.description
├── locale/zh.json
└── icon.svg
```

## 开发

改完文件后重新装一次即可热生效（Host 半需要重新加载）：

```bash
dsh plugin --profile desktop add link:/path/to/dsh-session-delete
```

## 许可证

MIT，见 [LICENSE](LICENSE)。
