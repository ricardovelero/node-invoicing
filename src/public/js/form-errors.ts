export const setFieldError = (
  input: HTMLInputElement,
  errorElement: HTMLElement,
  message: string,
) => {
  input.setCustomValidity(message);
  errorElement.textContent = message;
  errorElement.classList.toggle("hidden", !message);
  input.classList.toggle("border-red-500", Boolean(message));
  input.classList.toggle("border-line", !message);
};
