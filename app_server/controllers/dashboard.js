const dashboard = (req, res) => {
  res.render("dashboard", { title: "Tablero" });
};

module.exports = {
  dashboard,
};
