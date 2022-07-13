const listTaxes = (req, res) => {
  res.render("index", { title: "Listado de Impuestos" });
};

const taxDetails = (req, res) => {
  res.render("index", { title: "Detalle de Impuesto" });
};

const addTax = (req, res) => {
  res.render("index", { title: "Agregar Impuesto" });
};

module.exports = {
  listTaxes,
  taxDetails,
  addTax,
};
