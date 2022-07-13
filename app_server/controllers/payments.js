const listPayments = (req, res) => {
  res.render("index", { title: "Listado de Pagos" });
};

const paymentDetails = (req, res) => {
  res.render("index", { title: "Detalle de Pago" });
};

const addPayment = (req, res) => {
  res.render("index", { title: "Agregar Pago" });
};

module.exports = {
  listPayments,
  paymentDetails,
  addPayment,
};
