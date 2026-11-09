window.__ModuleLoader__.load({
  id: "@l1vide/dsh-session-delete",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const jsxRuntime = require("react/jsx-runtime");
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const store = require("@deepseek-ai/dsh-client-store");

    const jsx = jsxRuntime.jsx;
    const jsxs = jsxRuntime.jsxs;
    const Fragment = jsxRuntime.Fragment;
    const createSnapshotStore = store.createSnapshotStore ?? store.default?.createSnapshotStore;

    const name = "dsh-session-delete";
    const NS = "dsh-session-delete";
    const inject = ["slots", "locale", "sessions"];

    const DELETE_URL = "/dsh-session-delete/delete";
    const INSPECT_URL = "/dsh-session-delete/inspect";

    const linkStyle = {
      background: "none",
      border: "none",
      padding: 0,
      cursor: "pointer",
      fontSize: 12,
      textDecoration: "underline"
    };

    const zh = {
      "menu.deleteSession": "删除会话",
      "delete.confirm.title": "删除此会话？",
      "delete.confirm.desc":
        "对话记录会永久删除，它在工作区里留下的过程文件（脚本、下载的工具、临时文件）一并清理；它做出来的成果文件会保留。",
      "delete.confirm.action": "删除",
      "delete.confirm.pending": "正在删除…",
      "delete.scanning": "正在检查工作区…",
      "delete.scanFailed": "工作区检查失败，仍可删除会话。",
      "delete.failed": "删除失败：会话记录还在磁盘上",
      "delete.files.label": "它碰过 {count} 个文件，勾选要一并删除的",
      "delete.files.none": "它没有在工作区留下文件",
      "delete.selectAll": "全选",
      "delete.selectNone": "全不选",
      "delete.kind.created": "新建",
      "delete.kind.modified": "改过",
      "delete.gone": "已不在",
      "delete.confirm.action.count": "删除会话 + {count} 个文件",
      "delete.keep.label": "保留 {count} 个未勾选的文件",
      "cancel": "取消",
      "close": "关闭"
    };

    const en = {
      "menu.deleteSession": "Delete session",
      "delete.confirm.title": "Delete this session?",
      "delete.confirm.desc":
        "The conversation is deleted for good, together with the scaffolding it left in the workspace (scripts, downloaded tools, temp files). Files it produced are kept.",
      "delete.confirm.action": "Delete",
      "delete.confirm.pending": "Deleting…",
      "delete.scanning": "Checking the workspace…",
      "delete.scanFailed": "Workspace check failed; the session can still be deleted.",
      "delete.failed": "Delete failed: the session is still on disk",
      "delete.cleanup.label": "Clean up {count} scaffolding files",
      "delete.cleanup.none": "Nothing to clean up",
      "delete.keep.label": "Keep {count} result files (modified files included)",
      "cancel": "Cancel",
      "close": "Close"
    };

    const listStyle = {
      margin: "8px 0 0",
      padding: "6px 8px",
      maxHeight: 144,
      overflow: "auto",
      listStyle: "none",
      fontFamily: "var(--font-mono, ui-monospace, monospace)",
      fontSize: 12,
      lineHeight: 1.6,
      background: "var(--surface-2, rgba(127,127,127,0.08))",
      borderRadius: 6
    };

    function DeleteSessionMenuItem(props) {
      const { sessionId, displayTitle, useMenuOpenState, requestDelete, t } = props;
      const [, setMenuOpen] = useMenuOpenState();
      return jsx(primitives.MenuItemButton, {
        icon: jsx(primitives.IconTrashOutlineRegular, { size: 14 }),
        onSelect: () => {
          setMenuOpen(false);
          requestDelete(sessionId, displayTitle);
        },
        children: t("menu.deleteSession")
      });
    }

    function DeleteSessionConfirmDialog(props) {
      const { useDeleteRequest, settleSessionDelete, confirmSessionDelete, t } = props;
      const request = useDeleteRequest((pending) => pending);
      if (request === null) return null;
      return jsx(DeleteConfirmForm, {
        request,
        confirmSessionDelete,
        onSettle: settleSessionDelete,
        t
      });
    }

    function DeleteConfirmForm({ request, confirmSessionDelete, onSettle, t }) {
      const [plan, setPlan] = react.useState(null);
      const [scanFailed, setScanFailed] = react.useState(false);
      const [picked, setPicked] = react.useState({});
      const [deleting, setDeleting] = react.useState(false);
      const [error, setError] = react.useState(null);

      react.useEffect(() => {
        let alive = true;
        postJson(INSPECT_URL, { sessionId: request.sessionId })
          .then((payload) => {
            if (!alive) return;
            setPlan(payload);
            const next = {};
            for (const file of payload?.files ?? []) {
              next[file.path] = file.exists && file.kind === "created";
            }
            setPicked(next);
          })
          .catch(() => {
            if (alive) setScanFailed(true);
          });
        return () => {
          alive = false;
        };
      }, [request.sessionId]);

      const close = () => {
        if (deleting) return;
        onSettle();
      };

      const files = plan?.files ?? [];
      const chosen = files.filter((file) => picked[file.path] === true).map((file) => file.path);
      const scanning = plan === null && !scanFailed;

      const setAll = (value) => {
        const next = {};
        for (const file of files) next[file.path] = value && file.exists;
        setPicked(next);
      };

      const toggle = (path) => {
        setPicked((current) => ({ ...current, [path]: current[path] !== true }));
      };

      const confirm = () => {
        setDeleting(true);
        setError(null);
        confirmSessionDelete(request.sessionId, chosen)
          .then((payload) => {
            setDeleting(false);
            if (payload && payload.ok === false) {
              setError(payload.error ?? t("delete.failed"));
              return;
            }
            onSettle();
          })
          .catch((reason) => {
            setDeleting(false);
            setError(reason instanceof Error ? reason.message : String(reason));
          });
      };

      const row = (file) => {
        const exists = file.exists === true;
        return jsxs("li", {
          style: { display: "flex", gap: 8, alignItems: "flex-start", opacity: exists ? 1 : 0.55 },
          children: [
            jsx("input", {
              type: "checkbox",
              checked: picked[file.path] === true,
              disabled: deleting || !exists,
              onChange: () => toggle(file.path)
            }),
            jsxs("span", {
              style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
              children: [
                jsx("span", {
                  style: {
                    display: "inline-block",
                    minWidth: 44,
                    marginRight: 6,
                    padding: "0 4px",
                    borderRadius: 4,
                    fontSize: 11,
                    background: file.kind === "created" ? "rgba(56,139,253,.18)" : "rgba(255,166,0,.18)"
                  },
                  children: file.kind === "created" ? t("delete.kind.created") : t("delete.kind.modified")
                }),
                file.path
              ]
            }),
            jsx("span", {
              style: { marginLeft: "auto", opacity: 0.6, fontSize: 11, whiteSpace: "nowrap" },
              children: exists ? formatSize(file.size) : t("delete.gone")
            })
          ]
        }, file.path);
      };

      return jsxs(primitives.Modal, {
        open: true,
        onClose: close,
        closeLabel: t("close"),
        title: t("delete.confirm.title"),
        description: t("delete.confirm.desc"),
        footer: jsxs(Fragment, {
          children: [
            jsx(primitives.Button, {
              variant: "outline",
              disabled: deleting,
              onClick: close,
              children: t("cancel")
            }),
            jsx(primitives.Button, {
              variant: "primary",
              disabled: deleting,
              onClick: confirm,
              children: deleting
                ? t("delete.confirm.pending")
                : chosen.length > 0
                  ? t("delete.confirm.action.count", { count: chosen.length })
                  : t("delete.confirm.action")
            })
          ]
        }),
        children: [
          scanning ? jsx("div", { role: "status", children: t("delete.scanning") }) : null,
          scanFailed ? jsx("div", { children: t("delete.scanFailed") }) : null,
          plan !== null && files.length === 0
            ? jsx("div", { style: { marginTop: 4 }, children: t("delete.files.none") })
            : null,
          plan !== null && files.length > 0
            ? jsxs("div", {
                children: [
                  jsxs("div", {
                    style: { display: "flex", alignItems: "center", gap: 8, marginTop: 4 },
                    children: [
                      jsx("span", { children: t("delete.files.label", { count: files.length }) }),
                      jsx("button", {
                        type: "button",
                        disabled: deleting,
                        onClick: () => setAll(true),
                        style: linkStyle,
                        children: t("delete.selectAll")
                      }),
                      jsx("button", {
                        type: "button",
                        disabled: deleting,
                        onClick: () => setAll(false),
                        style: linkStyle,
                        children: t("delete.selectNone")
                      })
                    ]
                  }),
                  jsx("ul", { style: listStyle, children: files.map(row) })
                ]
              })
            : null,
          plan !== null && chosen.length > 0
            ? jsx("div", {
                style: { marginTop: 6, opacity: 0.75 },
                children: t("delete.keep.label", { count: files.length - chosen.length })
              })
            : null,
          error !== null ? jsx("div", { role: "alert", children: error }) : null
        ]
      });
    }

    function formatSize(size) {
      if (typeof size !== "number" || size <= 0) return "";
      if (size < 1024) return size + " B";
      if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
      return (size / 1024 / 1024).toFixed(1) + " MB";
    }

    async function postJson(path, body) {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(body)
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {}
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      return payload;
    }

    function apply(ctx) {
      const sessions = ctx.get("sessions", false);
      const deleteRequest = createSnapshotStore(null);

      const deleteMenuItemInjected = () => ({
        requestDelete: (sessionId, displayTitle) => {
          deleteRequest.set({ sessionId, displayTitle });
        }
      });

      const deleteDialogInjected = () => ({
        hooks: { deleteRequest },
        settleSessionDelete: () => {
          deleteRequest.set(null);
        },
        confirmSessionDelete: async (sessionId, files) => {
          const payload = await postJson(DELETE_URL, { sessionId, files });
          if (!payload || payload.ok !== false) {
            try {
              sessions?.handleSessionRemoved?.(sessionId);
              sessions?.refresh?.();
            } catch {}
          }
          return payload;
        }
      });

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-session-delete: dictionaries");

      ctx.slots.inject("sidebar.workspaces.session.menu.item", function* () {
        yield ctx.slots.register(
          {
            name: "sidebar.workspaces.session.menu.item",
            id: "session-delete",
            order: 410,
            locale: NS,
            inject: deleteMenuItemInjected
          },
          DeleteSessionMenuItem
        );
      });

      ctx.slots.inject("shell.overlay", function* () {
        yield ctx.slots.register(
          {
            name: "shell.overlay",
            id: "session-delete",
            locale: NS,
            inject: deleteDialogInjected
          },
          DeleteSessionConfirmDialog
        );
      });
    }

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
