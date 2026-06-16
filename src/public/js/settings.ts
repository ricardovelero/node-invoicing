const sectionSelector = '[data-withholding-settings]';

export const setupWithholdingRateControls = () => {
  document.querySelectorAll<HTMLElement>(sectionSelector).forEach((section) => {
    const form = section.closest('form');
    const countrySelect = form?.querySelector<HTMLSelectElement>(
      '[name="countryCode"]',
    );
    const legalFormSelect = form?.querySelector<HTMLSelectElement>(
      '[data-withholding-legal-form]',
    );
    const enableRow = section.querySelector<HTMLElement>(
      '[data-withholding-enable-row]',
    );
    const enabledCheckbox = section.querySelector<HTMLInputElement>(
      '[data-withholding-enabled]',
    );
    const rateFields = section.querySelector<HTMLElement>(
      '[data-withholding-rate-fields]',
    );
    const rateTypeSelect = section.querySelector<HTMLSelectElement>(
      '[data-withholding-rate-type]',
    );
    const customRateField = section.querySelector<HTMLElement>(
      '[data-withholding-custom-rate]',
    );
    const rateInput = section.querySelector<HTMLInputElement>(
      '[data-withholding-rate-input]',
    );

    if (
      !countrySelect ||
      !legalFormSelect ||
      !enableRow ||
      !enabledCheckbox ||
      !rateFields ||
      !rateTypeSelect ||
      !customRateField ||
      !rateInput
    ) {
      return;
    }

    const applyControls = () => {
      const isSpain = countrySelect.value === 'ES';
      const isCompany = legalFormSelect.value === 'company';
      const canUseWithholding = isSpain && !isCompany;
      const shouldShowRateFields = canUseWithholding && enabledCheckbox.checked;
      const isCustomRate = rateTypeSelect.value === 'custom';

      section.hidden = !canUseWithholding;
      enableRow.hidden = !canUseWithholding;
      rateFields.hidden = !shouldShowRateFields;
      customRateField.hidden = !shouldShowRateFields || !isCustomRate;
      rateInput.required = shouldShowRateFields && isCustomRate;

      if (!isCustomRate) {
        rateInput.value = rateTypeSelect.value;
      }
    };

    countrySelect.addEventListener('change', applyControls);
    legalFormSelect.addEventListener('change', applyControls);
    enabledCheckbox.addEventListener('change', applyControls);
    rateTypeSelect.addEventListener('change', applyControls);
    applyControls();
  });
};
