const supportsDialog = (dialog: HTMLDialogElement) =>
  typeof HTMLDialogElement !== "undefined" &&
  typeof dialog.showModal === "function" && typeof dialog.close === "function";

const dialogForId = (id: string) => {
  const dialog = document.getElementById(id);

  return typeof HTMLDialogElement !== "undefined" &&
    dialog instanceof HTMLDialogElement &&
    supportsDialog(dialog)
    ? dialog
    : null;
};

export const setupConfirmDialogs = () => {
  document.querySelectorAll<HTMLElement>("[data-dialog-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialogId = button.dataset.dialogOpen;

      if (!dialogId) {
        return;
      }

      dialogForId(dialogId)?.showModal();
    });
  });

  document.querySelectorAll<HTMLDialogElement>("dialog").forEach((dialog) => {
    if (!supportsDialog(dialog)) {
      return;
    }

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        dialog.close();
      }
    });

    dialog.querySelectorAll<HTMLElement>("[data-dialog-close]").forEach((button) => {
      button.addEventListener("click", () => {
        dialog.close();
      });
    });
  });
};
