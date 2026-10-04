import { prisma } from '../db/prisma';
import { loadOrganizationVerifactuSoapConfig } from '../modules/verifactu/verifactu-certificate';
import { reconcileSubmittedVerifactuRecords } from '../modules/verifactu/verifactu-reconciliation';
import { loadVerifactuSoapEnvironment } from '../modules/verifactu/verifactu-soap';

// Asks AEAT for the state of Veri*Factu records left SUBMITTED by the submission
// worker. Meant to run from cron; exits non-zero when any record query fails.
const run = async () => {
  const environment = loadVerifactuSoapEnvironment();
  const result = await reconcileSubmittedVerifactuRecords({
    client: prisma,
    loadConfig: (organizationId) =>
      loadOrganizationVerifactuSoapConfig({ client: prisma, organizationId, environment }),
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
