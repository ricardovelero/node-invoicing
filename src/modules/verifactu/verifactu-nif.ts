const dniLetters = 'TRWAGMYFPDXBNJZSQVHLCKE';
const cifControlLetters = 'JABCDEFGHI';

const dniLetter = (digits: string) => dniLetters[Number(digits) % 23];

const cifControlDigit = (digits: string) => {
  const sum = [...digits].reduce((total, char, index) => {
    const digit = Number(char);

    if (index % 2 === 1) {
      return total + digit;
    }

    const doubled = digit * 2;

    return total + Math.floor(doubled / 10) + (doubled % 10);
  }, 0);

  return (10 - (sum % 10)) % 10;
};

// Checks the format and control character of a Spanish NIF: DNI, NIE, K/L/M
// personal NIFs and entity NIFs (formerly CIF). AEAT also checks the NIF is
// registered, which can only be confirmed by AEAT itself.
export const isValidSpanishNif = (value: string) => {
  const nif = value.toUpperCase();

  if (/^\d{8}[A-Z]$/u.test(nif)) {
    return nif[8] === dniLetter(nif.slice(0, 8));
  }

  if (/^[XYZ]\d{7}[A-Z]$/u.test(nif)) {
    return nif[8] === dniLetter(String('XYZ'.indexOf(nif[0]!)) + nif.slice(1, 8));
  }

  if (/^[KLM]\d{7}[A-Z]$/u.test(nif)) {
    return nif[8] === dniLetter(nif.slice(1, 8));
  }

  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/u.test(nif)) {
    const control = cifControlDigit(nif.slice(1, 8));
    const controlChar = nif[8]!;

    // Some entity types must use a letter, others a digit; the rest accept both.
    if ('PQRSNW'.includes(nif[0]!)) {
      return controlChar === cifControlLetters[control];
    }

    if ('ABEH'.includes(nif[0]!)) {
      return controlChar === String(control);
    }

    return controlChar === String(control) || controlChar === cifControlLetters[control];
  }

  return false;
};
