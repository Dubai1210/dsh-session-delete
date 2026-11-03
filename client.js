window.__ModuleLoader__.load({
  id: "dsh-session-delete",
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

    const zh = {
      "menu.deleteSession": "删除会话",
      "delete.confirm.title": "删除此会话？",
      "delete.confirm.desc":
        "对话记录会永久删除，它在工作区里留下的过程文件（脚本、下载的工具、临时文件）一并清理；它做出来的成果文件会保留。",
      "delete.confirm.action": "删除",
      "delete.confirm.pending": "正在删除…",
      "delete.scanning": "正在检查工作区…",
      "delete.scanFailed": "工作区检查失败，仍可删除会话。",
      "delete.cleanup.label": "清理 {count} 个过程文件",
      "delete.cleanup.none": "没有需要清理的过程文件",
      "delete.keep.label": "保留 {count} 个成果文件（含被修改的文件）",
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
      const [clean, setClean] = react.useState(true);
      const [deleting, setDeleting] = react.useState(false);
      const [error, setError] = react.useState(null);

      react.useEffect(() => {
        let alive = true;
        postJson(INSPECT_URL, { sessionId: request.sessionId })
          .then((payload) => {
            if (alive) setPlan(payload);
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

      const confirm = () => {
        setDeleting(true);
        setError(null);
        confirmSessionDelete(request.sessionId, clean)
          .then(() => {
            setDeleting(false);
            onSettle();
          })
          .catch((reason) => {
            setDeleting(false);
            setError(reason instanceof Error ? reason.message : String(reason));
          });
      };

      const residue = plan?.residue ?? [];
      const kept = plan?.keep?.length ?? 0;
      const scanning = plan === null && !scanFailed;

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
              children: deleting ? t("delete.confirm.pending") : t("delete.confirm.action")
            })
          ]
        }),
        children: [
          scanning ? jsx("div", { role: "status", children: t("delete.scanning") }) : null,
          scanFailed ? jsx("div", { children: t("delete.scanFailed") }) : null,
          plan !== null && residue.length > 0
            ? jsxs(Fragment, {
                children: [
                  jsx("label", {
                    style: { display: "flex", gap: 8, alignItems: "center", marginTop: 4 },
                    children: [
                      jsx("input", {
                        type: "checkbox",
                        checked: clean,
                        disabled: deleting,
                        onChange: (event) => setClean(event.target.checked)
                      }),
                      jsx("span", { children: t("delete.cleanup.label", { count: residue.length }) })
                    ]
                  }),
                  jsx("ul", {
                    style: listStyle,
                    children: residue.map((entry) =>
                      jsx("li", { children: entry.path }, entry.path)
                    )
                  })
                ]
              })
            : null,
          plan !== null && residue.length === 0
            ? jsx("div", { style: { marginTop: 4 }, children: t("delete.cleanup.none") })
            : null,
          plan !== null && kept > 0
            ? jsx("div", {
                style: { marginTop: 6, opacity: 0.75 },
                children: t("delete.keep.label", { count: kept })
              })
            : null,
          error !== null ? jsx("div", { role: "alert", children: error }) : null
        ]
      });
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
        confirmSessionDelete: async (sessionId, clean) => {
          const payload = await postJson(DELETE_URL, { sessionId, clean });
          try {
            sessions?.handleSessionRemoved?.(sessionId);
          } catch {}
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
