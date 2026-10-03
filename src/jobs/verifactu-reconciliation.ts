import { prisma } from '../db/prisma';
import { reconcileSubmittedVerifactuRecords } from '../modules/verifactu/verifactu-reconciliation';
import { loadVerifactuSoapConfig } from '../modules/verifactu/verifactu-soap';

// Asks AEAT for the state of Veri*Factu records left SUBMITTED by the submission
// worker. Meant to run from cron; exits non-zero when any record query fails.
const run = async () => {
  const result = await reconcileSubmittedVerifactuRecords({
    client: prisma,
    config: loadVerifactuSoapConfig(),
  });

  console.log('[VERIFACTU_RECONCILE]', JSON.stringify(result));

  if (result.errorCount > 0) {
    throw new Error(`${result.errorCount} Veri*Factu record(s) could not be reconciled.`);
  }
};

run()
  .catch((error) => {
    console.error('[VERIFACTU_RECONCILE_FATAL]', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
