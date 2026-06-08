import { clearUnsavedChangesDirty } from './unsaved-changes';

export const setupInlineEditors = () => {
  document
    .querySelectorAll<HTMLElement>('[data-inline-editor]')
    .forEach((editor) => {
      const openButton = editor.querySelector<HTMLButtonElement>(
        '[data-inline-editor-open]',
      );
      const cancelButton = editor.querySelector<HTMLButtonElement>(
        '[data-inline-editor-cancel]',
      );
      const display = editor.querySelector<HTMLElement>(
        '[data-inline-editor-display]',
      );
      const panel = editor.querySelector<HTMLElement>(
        '[data-inline-editor-panel]',
      );
      const input = editor.querySelector<HTMLTextAreaElement>(
        '[data-inline-editor-input]',
      );

      if (!openButton || !cancelButton || !display || !panel || !input) {
        return;
      }

      const setOpen = (isOpen: boolean) => {
        display.classList.toggle('hidden', isOpen);
        panel.classList.toggle('hidden', !isOpen);
        openButton.setAttribute('aria-expanded', String(isOpen));

        if (isOpen) {
          input.focus();
        }
      };

      openButton.addEventListener('click', () => {
        setOpen(true);
      });

      cancelButton.addEventListener('click', () => {
        input.value = input.defaultValue;
        clearUnsavedChangesDirty(panel.closest('form'));
        setOpen(false);
      });
    });
};
