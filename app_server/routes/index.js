const express = require("express");
const router = express.Router();
const ctrlDashboard = require("../controllers/dashboard");
const ctrlInvoices = require("../controllers/invoices");
const ctrlClients = require("../controllers/clients");
const ctrlItems = require("../controllers/items");
const ctrlPayments = require("../controllers/payments");
const ctrlTaxes = require("../controllers/taxes");
const ctrlOthers = require("../controllers/others");

router.get("/", ctrlDashboard.dashboard);

router.get("/invoices", ctrlInvoices.listInvoices);
router.get("/invoices/:id", ctrlInvoices.invoiceDetails);
router.get("/invoice/add", ctrlInvoices.addInvoice);

router.get("/clients", ctrlClients.listClients);
router.get("/clients/:id", ctrlClients.clientDetails);
router.get("/clients/add", ctrlClients.addClient);

router.get("/items", ctrlItems.listItems);
router.get("/items/:id", ctrlItems.itemDetails);
router.get("/items/add", ctrlItems.addItem);

router.get("/payments", ctrlPayments.listPayments);
router.get("/payments/:id", ctrlPayments.paymentDetails);
router.get("/payments/add", ctrlPayments.addPayment);

router.get("/taxes", ctrlTaxes.listTaxes);
router.get("/taxes/:id", ctrlTaxes.taxDetails);
router.get("/taxes/add", ctrlTaxes.addTax);

/* Other pages */
router.get("/about", ctrlOthers.about);

module.exports = router;
