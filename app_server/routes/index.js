const express = require("express");
const router = express.Router();
const ctrlDashboard = require("../controllers/dashboard");
const ctrlInvoices = require("../controllers/invoices");
const ctrlClients = require("../controllers/clients");
const ctrlItems = require("../controllers/items");
const ctrlPayments = require("../controllers/payments");
const ctrlTaxes = require("../controllers/taxes");

router.get("/", ctrlDashboard.homelist);

router.get("/invoices", ctrlInvoices.listInvoices);
router.get("/invoice", ctrlInvoices.invoiceDetails);
router.get("/invoice/add", ctrlInvoices.addInvoice);

router.get("/clients", ctrlClients.listClients);
router.get("/client", ctrlClients.clientDetails);
router.get("/client/add", ctrlClients.addClient);

router.get("/items", ctrlItems.listItems);
router.get("/item", ctrlItems.itemDetails);
router.get("/item/add", ctrlItems.addItem);

router.get("/payments", ctrlPayments.listPayments);
router.get("/payment", ctrlPayments.paymentDetails);
router.get("/payment/add", ctrlPayments.addPayment);

router.get("/taxes", ctrlTaxes.listTaxes);
router.get("/tax", ctrlTaxes.taxDetails);
router.get("/tax/add", ctrlTaxes.addTax);

/* Other pages */
router.get("/about", ctrlOthers.about);

module.exports = router;
