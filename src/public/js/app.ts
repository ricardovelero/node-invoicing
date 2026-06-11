import { setupPasswordToggles, setupValidatedForms } from "./auth";
import { setupConfirmDialogs } from "./confirm-dialogs";
import { setupInlineEditors } from "./inline-editors";
import { setupInvoiceForms } from "./invoices";
import { setupWithholdingRateControls } from "./settings";
import { setupUnsavedChangesGuards } from "./unsaved-changes";

const setupFlashMessages = () => {
  document.querySelectorAll<HTMLElement>("[data-auto-dismiss]").forEach((element) => {
    const delay = Number(element.dataset.autoDismiss);
    const timeout = Number.isFinite(delay) ? delay : 4000;

    window.setTimeout(() => {
      element.remove();
    }, timeout);
  });
};

const setupPrintButtons = () => {
  document.querySelectorAll<HTMLButtonElement>("[data-print-button]").forEach((button) => {
    button.addEventListener("click", () => {
      window.print();
    });
  });
};

setupInvoiceForms();
setupConfirmDialogs();
setupInlineEditors();
setupUnsavedChangesGuards();
setupFlashMessages();
setupPrintButtons();
setupValidatedForms();
setupPasswordToggles();
setupWithholdingRateControls();
