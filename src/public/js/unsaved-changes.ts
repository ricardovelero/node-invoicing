const guardedFormSelector = '[data-unsaved-changes-guard]';

export const markUnsavedChangesDirty = (form: HTMLFormElement | null) => {
  if (!form?.matches(guardedFormSelector)) {
    return;
  }

  form.dataset.unsavedChangesDirty = 'true';
};

export const clearUnsavedChangesDirty = (form: HTMLFormElement | null) => {
  if (!form?.matches(guardedFormSelector)) {
    return;
  }

  delete form.dataset.unsavedChangesDirty;
  delete form.dataset.unsavedChangesSubmitting;
};

const clearSubmittingState = (form: HTMLFormElement) => {
  delete form.dataset.unsavedChangesSubmitting;
};

const hasDirtyGuardedForm = () =>
  Array.from(document.querySelectorAll<HTMLFormElement>(guardedFormSelector)).some(
    (form) =>
      form.dataset.unsavedChangesDirty === 'true' &&
      form.dataset.unsavedChangesSubmitting !== 'true',
  );

export const setupUnsavedChangesGuards = () => {
  document.querySelectorAll<HTMLFormElement>(guardedFormSelector).forEach((form) => {
    form.addEventListener('input', () => {
      markUnsavedChangesDirty(form);
    });

    form.addEventListener('change', () => {
      markUnsavedChangesDirty(form);
    });

    form.addEventListener('submit', (event) => {
      if (event.defaultPrevented) {
        clearSubmittingState(form);
        return;
      }

      form.dataset.unsavedChangesSubmitting = 'true';

      window.setTimeout(() => {
        if (event.defaultPrevented) {
          clearSubmittingState(form);
        }
      }, 0);
    });
  });

  window.addEventListener('beforeunload', (event) => {
    if (!hasDirtyGuardedForm()) {
      return;
    }

    event.preventDefault();
    event.returnValue = '';
  });
};
