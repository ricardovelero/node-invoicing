const sectionSelector = "[data-withholding-settings]";

export const setupWithholdingRateControls = () => {
  document.querySelectorAll<HTMLElement>(sectionSelector).forEach((section) => {
    const enabledCheckbox = section.querySelector<HTMLInputElement>(
      "[data-withholding-enabled]",
    );
    const rateFields = section.querySelector<HTMLElement>(
      "[data-withholding-rate-fields]",
    );
    const rateTypeSelect = section.querySelector<HTMLSelectElement>(
      "[data-withholding-rate-type]",
    );
    const customRateField = section.querySelector<HTMLElement>(
      "[data-withholding-custom-rate]",
    );
    const rateInput = section.querySelector<HTMLInputElement>(
      "[data-withholding-rate-input]",
    );

    if (
      !enabledCheckbox ||
      !rateFields ||
      !rateTypeSelect ||
      !customRateField ||
      !rateInput
    ) {
      return;
    }

    const applyControls = () => {
      // The rate only makes sense once withholding is enabled; hide the whole
      // group otherwise so a discarded value can't look like it was saved.
      rateFields.hidden = !enabledCheckbox.checked;

      const isCustom = rateTypeSelect.value === "custom";
      customRateField.hidden = !isCustom;

      // Presets must submit their own rate; a stale custom value fails validation.
      if (!isCustom) {
        rateInput.value = rateTypeSelect.value;
      }
    };

    enabledCheckbox.addEventListener("change", applyControls);
    rateTypeSelect.addEventListener("change", applyControls);
    applyControls();
  });
};
