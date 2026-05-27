export const formatMoney = (amountCents: number, currency = "EUR") =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(amountCents / 100);

export const lineTotalCents = (quantity: number, unitPriceCents: number) =>
  Math.round(quantity * unitPriceCents);
