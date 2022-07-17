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

const getClientList = (req, res, callback) => {
  const path = "/api/clients/";
  const requestOptions = {
    url: `${apiOptions.server}${path}`,
    method: "GET",
    json: {},
  };
  request(requestOptions, (err, { statusCode }, body) => {
    let data = body;
    if (statusCode === 200) {
      callback(req, res, data);
    } else {
      showError(req, res, statusCode);
    }
  });
};

const addInvoice = (req, res) => {
  getClientList(req, res, (req, res, responseData) =>
    renderAddInvoiceForm(req, res, responseData)
  );
};

const renderAddInvoiceForm = function (req, res, data) {
  res.render("addinvoice", {
    title: "Facturar - FacturaZen",
    pageHeader: { title: "Facturar" },
    clients: data,
  });
};

const doAddInvoice = (req, res) => {
  const path = "/api/invoices";
  const postdata = {
    clientId: req.body.clientId,
    invoice_date: req.body.invoice_date,
    due_date: req.body.due_date,
    invoice_notes: req.body.invoice_notes,
  };
  const requestOptions = {
    url: `${apiOptions.server}${path}`,
    method: "POST",
    json: postdata,
  };
  request(requestOptions, (err, { statusCode }, body) => {
    if (statusCode === 201) {
      res.redirect(`/invoices/${id}`);
    } else {
      showError(req, res, statusCode);
    }
  });
};

const showError = (req, res, status) => {
  let title = "";
  let content = "";
  if (status === 404) {
    title = "404, page not found";
    content = "Oh dear. Looks like you can't find this page. Sorry.";
  } else {
    title = `${status}, something's gone wrong`;
    content = "Something, somewhere, has gone just a little bit wrong.";
  }
  res.status(status);
  res.render("index", {
    title,
    content,
  });
};

module.exports = {
  listInvoices,
  invoiceDetails,
  addInvoice,
  doAddInvoice,
};
