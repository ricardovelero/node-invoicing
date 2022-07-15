const { response } = require("express");
const request = require("request");
const apiOptions = {
  server: "http://localhost:8080",
};
if (process.env.NODE_ENV === "production") {
  apiOptions.server = "https://pure-temple-67771.herokuapp.com";
}

const renderInvoices = (req, res, responseBody) => {
  let message = null;
  if (!(responseBody instanceof Array)) {
    message = "Error en el API";
    responseBody = [];
  } else {
    if (!responseBody.length) {
      message = "No hay Facturas";
    }
  }
  res.render("listinvoices", {
    title: "Listado de Facturas - FacturaZen",
    pageHeader: {
      title: "Listado de Facturas",
      strapline: "Pincha una Factura para más detalles",
    },
    invoices: responseBody,
    message,
  });
};

const listInvoices = (req, res) => {
  const path = "/api/invoices";
  const requestOptions = {
    url: `${apiOptions.server}${path}`,
    method: "GET",
    json: {},
  };
  request(requestOptions, (err, response, body) => {
    renderInvoices(req, res, body);
  });
};

const renderInvoiceDetails = (req, res, responseBody) => {
  res.render("invoice", {
    title: `Detalle de Factura ${responseBody.invoice_number} - FacturaZen`,
    invoice: responseBody,
  });
};

const invoiceDetails = (req, res) => {
  const path = `/api/invoices/${req.params.id}`;
  const requestOptions = {
    url: `${apiOptions.server}${path}`,
    method: "GET",
    json: {},
  };
  request(requestOptions, (err, response, body) => {
    renderInvoiceDetails(req, res, body);
  });
};

const addInvoice = (req, res) => {
  console.log("Hello");
  res.render("addinvoice", { title: "Facturar" });
};

module.exports = {
  listInvoices,
  invoiceDetails,
  addInvoice,
};
