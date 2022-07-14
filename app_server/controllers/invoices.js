const listInvoices = (req, res) => {
  res.render("listinvoices", { title: "Listado de Facturas" });
};

const invoiceDetails = (req, res) => {
  res.render("invoice", { title: "Detalle de Factura" });
};

const addInvoice = (req, res) => {
  res.render("addinvoice", { title: "Facturar" });
};

module.exports = {
  listInvoices,
  invoiceDetails,
  addInvoice,
};
