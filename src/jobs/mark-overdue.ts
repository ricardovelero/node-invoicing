import { prisma } from '../db/prisma';

// Overdue is derived from invoice status, payment status, and due date.
// This entrypoint is kept as a no-op for existing deploy scripts.
const run = async () => {
  console.log('Overdue invoices are derived at read time. No rows updated.');
};

run()
  .catch((error) => {
    console.error('Failed to mark overdue invoices:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
