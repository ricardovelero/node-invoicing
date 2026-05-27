import { setupPasswordToggles, setupRegisterForms } from "./auth";
import { setupInvoiceForms } from "./invoice";

const setupFlashMessages = () => {
  document.querySelectorAll<HTMLElement>("[data-auto-dismiss]").forEach((element) => {
    const delay = Number(element.dataset.autoDismiss);
    const timeout = Number.isFinite(delay) ? delay : 4000;

    window.setTimeout(() => {
      element.remove();
    }, timeout);
  });
};

setupInvoiceForms();
setupFlashMessages();
setupRegisterForms();
setupPasswordToggles();
