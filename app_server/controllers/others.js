const about = (req, res) => {
  res.render("index", { title: "Sobre Nosotros" });
};

module.exports = {
  about,
};
