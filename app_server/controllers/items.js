const listItems = (req, res) => {
  res.render("index", { title: "Listado de Ítems" });
};

const itemDetails = (req, res) => {
  res.render("index", { title: "Detalle de Item" });
};

const addItem = (req, res) => {
  res.render("index", { title: "Agregar Item" });
};

module.exports = {
  listItems,
  itemDetails,
  addItem,
};
