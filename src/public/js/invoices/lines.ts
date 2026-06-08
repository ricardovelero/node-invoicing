export const getRows = (linesContainer: HTMLElement) =>
  Array.from(
    linesContainer.querySelectorAll<HTMLElement>('[data-invoice-line]'),
  );

export const updateRemoveButtons = (rows: HTMLElement[]) => {
  const canRemove = rows.length > 1;

  rows.forEach((row) => {
    const removeButton = row.querySelector<HTMLButtonElement>(
      '[data-invoice-remove-line]',
    );

    if (removeButton) {
      removeButton.disabled = !canRemove;
    }
  });
};

type AddLineOptions = {
  lineTemplate: HTMLTemplateElement;
  linesContainer: HTMLElement;
  markDirty: () => void;
  updateTotals: () => void;
};

export const addLine = ({
  lineTemplate,
  linesContainer,
  markDirty,
  updateTotals,
}: AddLineOptions) => {
  const line = lineTemplate.content.firstElementChild?.cloneNode(true);

  if (!(line instanceof HTMLElement)) {
    return;
  }

  linesContainer.append(line);
  markDirty();
  updateTotals();
  line
    .querySelector<HTMLInputElement>('[data-invoice-description]')
    ?.focus();
};
