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
      "menu.deleteSession": "鍒犻櫎浼氳瘽",
      "delete.confirm.title": "鍒犻櫎姝や細璇濓紵",
      "delete.confirm.desc":
        "灏嗘案涔呭垹闄ゃ€寋title}銆嶇殑鍏ㄩ儴鏁版嵁锛屽苟鍒犻櫎瀹冨湪宸ヤ綔鍖洪噷鎿嶄綔杩囩殑鏂囦欢锛屾棤娉曟仮澶嶃€?,
      "delete.confirm.action": "鍒犻櫎",
      "delete.confirm.pending": "姝ｅ湪鍒犻櫎鈥?,
      "cancel": "鍙栨秷",
      "close": "鍏抽棴"
    };

    const en = {
      "menu.deleteSession": "Delete session",
      "delete.confirm.title": "Delete this session?",
      "delete.confirm.desc":
        "Permanently deletes all data of \"{title}\" and removes the workspace files it touched. This cannot be undone.",
      "delete.confirm.action": "Delete",
      "delete.confirm.pending": "Deleting鈥?,
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
      return jsx(DeleteConfirmForm, {
        request,
        confirmSessionDelete,
        onSettle: settleSessionDelete,
        t
      });
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
        confirmSessionDelete: async (sessionId) => {
          const payload = await postJson("/dsh-session-delete/delete", { sessionId });
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
