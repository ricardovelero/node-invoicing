const index = (req, res) => {
  res.render("index", { title: "Tablero" });
};

module.exports = {
  index,
};
