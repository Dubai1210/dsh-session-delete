# DSH Session Delete

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/Dubai1210/dsh-session-delete)

在会话「⋯」菜单的「归档会话」下面多一项 **删除会话**：点一下、确认一次，这个会话的对话记录消失、它在工作区留下的过程残留被清掉，**它做出来的成果保留**。

DSH 自带的「归档」只是把会话从列表里挪走，文件还在、可以取消归档恢复。这个插件补上真正不可逆的那一步。

## 功能

- 菜单项插在 `sidebar.workspaces.session.menu.item` 插槽 **order 410**，即「归档会话」之后、「会话 ID」之前
- 垃圾桶图标，点击先关闭菜单，再弹出二次确认框
- 确认框打开时先做一次只读扫描，列出「会删掉哪些过程文件」「会保留多少成果文件」，可取消勾选只删对话
- 确认后 Host 侧一次性完成清理，所有已打开的窗口立刻把该行移除

## 删除范围

| 对象 | 处理 |
| --- | --- |
| 对话记录 | `~/.dsh/sessions/<project>/<session-id>/` 整目录删除（`session.v4.jsonl.zstd` 等世代日志） |
| 投影缓存 | `storages/session_projcache` 里该会话的行（含投影后的消息正文） |
| 工作区里的过程残留 | 该会话新建的脚本、下载的工具、临时文件和脚手架目录，逐个 `rm`，随后清掉因此变空的目录（不越过会话 `cwd`） |
| 正在运行的 agent | `cancel({kind:"user"})` + `agent.scope.dispose()`，释放日志文件句柄 |
| 工作区归属 | 从每个工作区记录的 `sessionIds` 中 `detachSession` |
| 归档 / 置顶集合 | 全局 `archivedSessionIds`、`pinnedSessionIds` 中移除 |
| 客户端列表 | `ctx.emit("api-session/removed", id)` → 所有窗口实时移除该行 |

成果文件、你原来就有并被它改过的文件，都不在删除范围内。详见下一节。

删除**不进回收站**，对话记录不可恢复。

## 哪些文件算残留，哪些算成果

判定在 `lib/classify.js`，先保后删：

**一律保留**

| 情况 | 理由 |
| --- | --- |
| 会话**修改过**的文件（`kind === "modified"`） | 改的是你的东西，删了无法还原 |
| 通过 `present` 工具交付的文件 | 会话明确交给你的成果 |
| 最后一次回复正文里点名的文件 | 同上 |
| 位于 git 仓库内的文件 | 是项目代码，能靠 git 回滚 |
| 文档/数据/媒体扩展名：`.docx .xlsx .pptx .pdf .md .txt .csv .png .jpg .mp4 .json .yaml .html` 等 | 成果形态 |
| 判不出来的扩展名 | 宁可留着 |

**会被清理（仅当文件是该会话新建的）**

| 类型 | 例子 |
| --- | --- |
| 脚手架目录内的文件 | `node_modules/` `dist/` `build/` `tmp/` `temp/` `.cache/` `__pycache__/` `.venv/` `target/` `coverage/` |
| 脚本/源码 | `.js .mjs .cjs .ts .py .ps1 .sh .bat .rb .pl .php .lua .go .rs .java` … |
| 下载或构建产物 | `.exe .msi .zip .7z .tar .gz .apk .jar .whl .dll .so` … |
| 临时文件 | `.log .bak .tmp .out .err .orig .rej .swp` |
| 隐藏文件 | 以 `.` 开头的 |
| 因此变空的目录 | 顺手删掉，不越过会话 `cwd` |

「新建」的判定：该会话对它的第一次操作是写、且此前没读过它 —— DSH 要求覆盖已有文件前先读，所以「写而无读」即表示文件原本不存在。

做不到的部分（明确写在这里，避免误解）：

- **通过 shell 命令写出的文件不在归属范围内**。`bash` / `ops_bash` 的命令行只有字符串，没有可解析的目标路径，插件不会去猜。所以 `pip install`、`curl -o`、`python make.py` 产生的东西会留在磁盘上
- 子会话（subagent）写出的文件不计入父会话；要清就删对应子会话
- 「修改」类文件只保留、不还原 —— 原内容已被覆盖，本插件不做备份；需要旧版本请靠自己的 git

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
3. 弹窗会先扫一次工作区，列出要清的过程文件；不想清就取消勾选
4. 点「删除」
5. 该会话行消失，对话记录和过程残留同时被清掉，成果文件还在

## 权限与风险

- Host 半只注册同源 HTTP 路由：`POST /dsh-session-delete/inspect`（只读预检）、`POST /dsh-session-delete/delete`。同源校验照抄 DSH 官方插件的做法：拒绝 `sec-fetch-site: cross-site`、`origin: null`、以及 `origin.host` 与 `host` 头不一致的请求
- 只操作本机 `~/.dsh` 下的会话数据、工作区注册表，以及该会话自己留下的过程文件，**不发起任何外部网络请求**，不依赖任何第三方服务
- 没有任何遥测、没有后台常驻任务
- 风险点：删除是永久性的。被判定为「残留」的文件如果没有版本控制，删掉就没了；判定规则和预览清单就是为此存在的

## 兼容与运行要求

- DSH：0.2.x（desktop profile 与 web profile 均可）
- 平台：Windows / macOS / Linux
- 运行时：Node.js >= 18（Host 半只用 `node:fs/promises`、`node:path`、`node:zlib`）
- 依赖的服务：`webServer`、`sessions`、`agents`、`sessionPersistence`、`workspaceRegistry`、`storageDomain`，全部来自 DSH 基础 bundle，无额外依赖

## 能力分类

界面与体验（同时涉及会话与消息的数据清理）

## 实现说明

bundle 插件，两半：

**Host** — `lib/index.js`，导出 `apply(ctx)`，注册两条 `webServer` exact 路由。删除流水线：

1. `lib/transcript.js` 读转录日志（多帧 zstd）拿出该会话碰过的工作区文件
2. `lib/classify.js` 把它分成「保留 / 残留」两堆（有 `present`、末尾回复、git 仓库、扩展名等信号）
3. 只对「残留」逐个 `rm`，再清空目录
4. 停活 agent 并释放文件句柄
5. `sessionPersistence.locate({cwd, id})` 定位日志文件，`rm -r` 其所在会话目录
6. `storageDomain.get("session_projcache").table("sessions").delete(id)` 清投影缓存行
7. 遍历 `workspaceRegistry.list()`，逐个 `entity.detachSession(id)`
8. `unarchiveSession(id)` + `unpinSession(id)` 清全局集合
9. `ctx.emit("api-session/removed", id)` 通知所有客户端

每一步独立 try/catch，单步失败不影响其余步骤；返回值 `{ok, live, removedFiles, cacheRows, headerFound, workspace:{removed,kept,failed,cwd}}` 便于排查。

文件归属解析在 `lib/transcript.js`：会话日志是**多帧 zstd**（每个追加批次一帧），一次性 `zstdDecompressSync` 只能解出第一帧，所以这里先按 frame header / block header 走一遍结构定位所有完整帧再逐帧解压；然后扫描 `tool/call` 事件，按工具名取路径参数（`path` / `file_path` / `target_file`，`apply_patch` 走 `*** Update File:` 行），用会话 `cwd` 规整并拒绝越界路径。

**Client** — `client.js`，`window.__ModuleLoader__.load` 注册懒工厂，往两个插槽注册：

- `sidebar.workspaces.session.menu.item` → 删除菜单项（order 410）
- `shell.overlay` → 确认弹窗（`Modal` + 清单 + 清理开关 + 取消/删除按钮）

打开弹窗先 `fetch("/dsh-session-delete/inspect")` 取清单，确认时 `fetch("/dsh-session-delete/delete", {body:{sessionId, clean}})`，同源、`credentials: same-origin`。

## 目录结构

```
dsh-session-delete/
├── package.json          # dsh.bundle.patch + dsh.client
├── cordis.patch.yml      # - insert: 宿主插件条目
├── lib/index.js          # Host 半：两条路由 + 删除流水线
├── lib/transcript.js     # Host 半：多帧 zstd 解码 + 会话写文件归属解析
├── lib/classify.js       # Host 半：残留 / 成果判定
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
