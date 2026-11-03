# DSH Session Delete

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/Dubai1210/dsh-session-delete)

在会话「⋯」菜单的「归档会话」下面多一项 **删除会话**：点一下、确认一次，这个会话连同它在磁盘上的全部数据、以及它在这个工作区里操作过的文件，一起删掉。

DSH 自带的「归档」只是把会话从列表里挪走，文件还在、可以取消归档恢复。这个插件补上真正不可逆的那一步。

## 功能

- 菜单项插在 `sidebar.workspaces.session.menu.item` 插槽 **order 410**，即「归档会话」之后、「会话 ID」之前
- 垃圾桶图标，点击先关闭菜单，再弹出二次确认框（显示会话标题，明确写"无法恢复"）
- 确认后 Host 侧一次性完成清理，所有已打开的窗口立刻把该行移除

## 删除范围

一次调用会删掉下面这些，缺一不可：

| 数据 | 处理 |
| --- | --- |
| 工作区文件 | 该会话用写文件工具碰过的文件，逐个 `rm`，随后清掉因此变空的目录（不越过会话 `cwd`） |
| 正在运行的 agent | `cancel({kind:"user"})` + `agent.scope.dispose()`，释放日志文件句柄 |
| 会话日志目录 | `~/.dsh/sessions/<project>/<session-id>/` 整目录删除（`session.v4.jsonl.zstd` 等世代日志） |
| 投影缓存 | `storages/session_projcache` 里该会话的行（含投影后的消息正文） |
| 工作区归属 | 从每个工作区记录的 `sessionIds` 中 `detachSession` |
| 归档 / 置顶集合 | 全局 `archivedSessionIds`、`pinnedSessionIds` 中移除 |
| 客户端列表 | `ctx.emit("api-session/removed", id)` → 所有窗口实时移除该行 |

删除**不进回收站**，不可恢复。

## 工作区文件怎么认定

- 打开确认框时不动磁盘，也不需要额外请求：确认后 Host 侧解析该会话的转录日志，扫描 `tool/call` 事件，取出写文件工具（`write` / `edit` / `multi_edit` / `apply_patch` / `str_replace_editor` / `ops_write` / `ops_edit` / `create_file`）的路径参数
- 只处理会话工作区目录（`cwd`）内部的路径；越界路径（`../`、绝对路径指向别处、`.git` 内部）一律跳过
- 文件删完后把它留下的空目录一并删掉，但不会动 `cwd` 本身

做不到的部分（明确写在这里，避免误解）：

- **通过 shell 命令写出的文件不在归属范围内**。`bash` / `ops_bash` 的命令行只有字符串，没有可解析的目标路径，插件不会去猜
- 子会话（subagent）写出的文件不计入父会话；要清就删对应子会话
- 「修改」类文件只删不还原 —— 原内容已被覆盖，没有备份；需要旧版本请靠自己的 git

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
3. 确认框里核对标题
4. 点「删除」
5. 该会话行消失，磁盘上的对应目录和它操作过的文件同时被删除

## 权限与风险

- Host 半只注册一个同源 HTTP 路由：`POST /dsh-session-delete/delete`。同源校验照抄 DSH 官方插件的做法：拒绝 `sec-fetch-site: cross-site`、`origin: null`、以及 `origin.host` 与 `host` 头不一致的请求
- 只操作本机 `~/.dsh` 下的会话数据、工作区注册表，以及该会话自己操作过的工作区文件，**不发起任何外部网络请求**，不依赖任何第三方服务
- 没有任何遥测、没有后台常驻任务
- 风险点：删除是永久性的 —— 会话日志、工作区里被它写过/改过的文件都会消失，没有备份

## 兼容与运行要求

- DSH：0.2.x（desktop profile 与 web profile 均可）
- 平台：Windows / macOS / Linux
- 运行时：Node.js >= 18（Host 半只用 `node:fs/promises` 与 `node:path`）
- 依赖的服务：`webServer`、`sessions`、`agents`、`sessionPersistence`、`workspaceRegistry`、`storageDomain`，全部来自 DSH 基础 bundle，无额外依赖

## 能力分类

界面与体验（同时涉及会话与消息的数据清理）

## 实现说明

bundle 插件，两半：

**Host** — `lib/index.js`，导出 `apply(ctx)`，注册一个 `webServer` exact 路由。删除流水线：

1. 读转录日志（多帧 zstd）拿出该会话碰过的工作区文件，逐个 `rm`，再清空目录
2. 停活 agent 并释放文件句柄
3. `sessionPersistence.locate({cwd, id})` 定位日志文件，`rm -r` 其所在会话目录
4. `storageDomain.get("session_projcache").table("sessions").delete(id)` 清投影缓存行
5. 遍历 `workspaceRegistry.list()`，逐个 `entity.detachSession(id)`
6. `unarchiveSession(id)` + `unpinSession(id)` 清全局集合
7. `ctx.emit("api-session/removed", id)` 通知所有客户端

每一步独立 try/catch，单步失败不影响其余步骤；返回值 `{ok, live, removedFiles, cacheRows, headerFound, workspace:{removed,failed,cwd}}` 便于排查。

文件归属解析在 `lib/transcript.js`：会话日志是**多帧 zstd**（每个追加批次一帧），一次性 `zstdDecompressSync` 只能解出第一帧，所以这里先按 frame header / block header 走一遍结构定位所有完整帧再逐帧解压；然后扫描 `tool/call` 事件，按工具名取路径参数（`path` / `file_path` / `target_file`，`apply_patch` 走 `*** Update File:` 行），用会话 `cwd` 规整并拒绝越界路径。

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
├── lib/transcript.js     # Host 半：多帧 zstd 解码 + 会话写文件归属解析
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
