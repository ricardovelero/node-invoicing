import { setupPasswordToggles, setupRegisterForms } from "./auth";
import { setupInlineEditors, setupInvoiceForms } from "./invoice";

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
setupInlineEditors();
setupFlashMessages();
setupPrintButtons();
setupRegisterForms();
setupPasswordToggles();
