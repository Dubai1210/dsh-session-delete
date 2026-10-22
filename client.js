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

    const zh = {
      "menu.deleteSession": "删除会话",
      "delete.confirm.title": "删除此会话？",
      "delete.confirm.desc": "将永久删除「{title}」的全部数据，无法恢复。",
      "delete.confirm.action": "删除",
      "delete.confirm.pending": "正在删除…",
      "cancel": "取消",
      "close": "关闭"
    };

    const en = {
      "menu.deleteSession": "Delete session",
      "delete.confirm.title": "Delete this session?",
      "delete.confirm.desc": "Permanently deletes all data of \"{title}\". This cannot be undone.",
      "delete.confirm.action": "Delete",
      "delete.confirm.pending": "Deleting…",
      "cancel": "Cancel",
      "close": "Close"
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
      return jsx(
        DeleteConfirmForm,
        { request, confirmSessionDelete, onSettle: settleSessionDelete, t },
        request.sessionId
      );
    }

    function DeleteConfirmForm({ request, confirmSessionDelete, onSettle, t }) {
      const [deleting, setDeleting] = react.useState(false);
      const [error, setError] = react.useState(null);
      const close = () => {
        if (deleting) return;
        onSettle();
      };
      const confirm = () => {
        setDeleting(true);
        setError(null);
        confirmSessionDelete(request.sessionId)
          .then(() => {
            setDeleting(false);
            onSettle();
          })
          .catch((reason) => {
            setDeleting(false);
            setError(reason instanceof Error ? reason.message : String(reason));
          });
      };
      return jsxs(primitives.Modal, {
        open: true,
        onClose: close,
        closeLabel: t("close"),
        title: t("delete.confirm.title"),
        description: t("delete.confirm.desc", { title: request.displayTitle }),
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
              children: t("delete.confirm.action")
            })
          ]
        }),
        children: [
          deleting ? jsx("div", { role: "status", children: t("delete.confirm.pending") }) : null,
          error !== null ? jsx("div", { role: "alert", children: error }) : null
        ]
      });
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
        confirmSessionDelete: async (sessionId) => {
          const response = await fetch("/dsh-session-delete/delete", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
            cache: "no-store",
            body: JSON.stringify({ sessionId })
          });
          let payload = null;
          try {
            payload = await response.json();
          } catch {}
          if (!response.ok || payload?.ok === false) {
            throw new Error(payload?.error || `HTTP ${response.status}`);
          }
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
