const listInvoices = (req, res) => {
  res.render("index", { title: "Listado de Facturas" });
};

const invoiceDetails = (req, res) => {
  res.render("index", { title: "Detalle de Factura" });
};

const addInvoice = (req, res) => {
  res.render("index", { title: "Facturar" });
};

module.exports = {
  listInvoices,
  invoiceDetails,
  addInvoice,
};
