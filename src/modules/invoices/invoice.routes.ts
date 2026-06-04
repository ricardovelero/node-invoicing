import { Router } from 'express';
import {
  createInvoice,
  editInvoice,
  listInvoices,
  printInvoice,
  recordInvoicePaymentController,
  renderEditInvoice,
  renderNewInvoice,
  showInvoice,
  updateInvoiceMetadataController,
  updateInvoiceStatusController,
} from './invoice.controller';
import {
  renderInvoiceEmailForm,
  sendInvoiceEmailController,
} from './invoice-email.controller';

export const invoiceRouter = Router();

invoiceRouter.get('/', listInvoices);
invoiceRouter.get('/new', renderNewInvoice);
invoiceRouter.post('/', createInvoice);
invoiceRouter.get('/:invoiceId/email', renderInvoiceEmailForm);
invoiceRouter.post('/:invoiceId/email', sendInvoiceEmailController);
invoiceRouter.get('/:invoiceId/print', printInvoice);
invoiceRouter.get('/:invoiceId/edit', renderEditInvoice);
invoiceRouter.post('/:invoiceId/edit', editInvoice);
invoiceRouter.get('/:invoiceId', showInvoice);
invoiceRouter.post('/:invoiceId/metadata', updateInvoiceMetadataController);
invoiceRouter.post('/:invoiceId/status', updateInvoiceStatusController);
invoiceRouter.post('/:invoiceId/payments', recordInvoicePaymentController);
