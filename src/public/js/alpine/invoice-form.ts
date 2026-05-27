type InvoiceFormState = {
  quantity: number;
  unitPrice: number;
  total: string;
};

export const invoiceForm = (): InvoiceFormState => ({
  quantity: 1,
  unitPrice: 0,
  get total() {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "EUR",
    }).format(this.quantity * this.unitPrice);
  },
});
