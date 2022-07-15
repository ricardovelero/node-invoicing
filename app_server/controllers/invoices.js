const listInvoices = (req, res) => {
  res.render("listinvoices", {
    title: "Listado de Facturas - FacturaZen",
    pageHeader: {
      title: "Listado de Facturas",
      strapline: "Pincha una Factura para más detalles",
    },
    sampleInvoices: [
      {
        id: 1,
        invoice_number: "ABC2022",
        invoice_date: "2022-07-09T00:00:00.000Z",
        due_date: "2022-10-10T00:00:00.000Z",
        subtotal: 150,
        discount_percentage: 10,
        discount_amount: 15,
        tax_amount: 0,
        total: 150,
        is_recurrent: false,
        invoice_notes: "Esto es una prueba de la tabla Invoices",
        invoice_status: "Sin pagar",
        tax_id: 1,
        billing_month: "Octubre",
        createdAt: "2022-07-09T20:03:10.579Z",
        updatedAt: "2022-07-11T16:46:43.357Z",
        clientId: 1,
        items: [
          {
            id: 2,
            item_name: "Programación JS",
          },
          {
            id: 1,
            item_name: "Programación HTML",
          },
          {
            id: 3,
            item_name: "Sistema de Seguridad",
          },
        ],
      },
      {
        id: 3,
        invoice_number: "GHI2022",
        invoice_date: "2022-07-11T00:00:00.000Z",
        due_date: "2022-10-11T00:00:00.000Z",
        subtotal: 200,
        discount_percentage: 10,
        discount_amount: 20,
        tax_amount: 0,
        total: 180,
        is_recurrent: false,
        invoice_notes: "Asociación de un Cliente con muchos Invoices",
        invoice_status: "Sin pagar",
        tax_id: 1,
        billing_month: "Agosto",
        createdAt: "2022-07-11T19:11:10.588Z",
        updatedAt: "2022-07-11T19:11:10.588Z",
        clientId: 1,
        items: [
          {
            id: 3,
            item_name: "Sistema de Seguridad",
          },
          {
            id: 4,
            item_name: "Mantenimiento WordPress",
          },
        ],
      },
      {
        id: 2,
        invoice_number: "DEF2022",
        invoice_date: "2022-07-11T00:00:00.000Z",
        due_date: "2022-10-11T00:00:00.000Z",
        subtotal: 200,
        discount_percentage: 10,
        discount_amount: 20,
        tax_amount: 0,
        total: 180,
        is_recurrent: false,
        invoice_notes:
          "Esto es una prueba para la asociación de un Cliente con muchos Invoices",
        invoice_status: "Sin pagar",
        tax_id: 2,
        billing_month: "Agosto",
        createdAt: "2022-07-11T19:06:06.745Z",
        updatedAt: "2022-07-11T19:15:13.447Z",
        clientId: 1,
        items: [
          {
            id: 4,
            item_name: "Mantenimiento WordPress",
          },
        ],
      },
    ],
  });
};

const invoiceDetails = (req, res) => {
  res.render("invoice", { title: "Detalle de Factura" });
};

const addInvoice = (req, res) => {
  res.render("addinvoice", { title: "Facturar" });
};

module.exports = {
  listInvoices,
  invoiceDetails,
  addInvoice,
};
