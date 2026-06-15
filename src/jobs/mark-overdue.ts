import { prisma } from '../db/prisma';
import { markOverdueInvoices } from '../modules/invoices/invoice.service';

// Standalone entrypoint for the daily overdue reconciliation.
// Run with `pnpm job:mark-overdue` (after `pnpm build`). Wire it to an
// external scheduler (platform cron, system crontab, CI schedule, etc.).
const run = async () => {
  const count = await markOverdueInvoices();
  console.log(`Marked ${count} invoice(s) as overdue.`);
};

run()
  .catch((error) => {
    console.error('Failed to mark overdue invoices:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
