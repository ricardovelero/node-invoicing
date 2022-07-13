const listClients = (req, res) => {
  res.render("index", { title: "Listado de Clientes" });
};

const clientDetails = (req, res) => {
  res.render("index", { title: "Detalle de Cliente" });
};

const addClient = (req, res) => {
  res.render("index", { title: "Agregar Nuevo Cliente" });
};

module.exports = {
  listClients,
  clientDetails,
  addClient,
};
