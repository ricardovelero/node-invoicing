import { prisma } from '../db/prisma';
import { verifyOrganizationFiscalRecordChain } from '../modules/invoices/invoice.service';

// Recomputes and validates each organization's append-only fiscal record chain.
// Pass one or more organization ids to scope the check; with no arguments every
// organization is verified. Exits non-zero when any chain fails verification.
const run = async () => {
  const requestedIds = process.argv.slice(2);
  const organizations = requestedIds.length
    ? requestedIds.map((id) => ({ id, name: id }))
    : await prisma.organization.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });

  if (!organizations.length) {
    console.log('No organizations to verify.');
    return;
  }

  let brokenCount = 0;

  for (const organization of organizations) {
    const result = await verifyOrganizationFiscalRecordChain(organization.id);

    if (result.ok) {
      console.log(
        `OK   ${organization.name} (${organization.id}): ${result.recordCount} record(s) verified.`,
      );
      continue;
    }

    brokenCount += 1;
    console.error(
      `FAIL ${organization.name} (${organization.id}): ${result.issues.length} issue(s) across ${result.recordCount} record(s).`,
    );
    for (const issue of result.issues) {
      console.error(
        `       seq ${issue.sequenceNumber} record ${issue.recordId}: ${issue.reason}`,
      );
    }
  }

  if (brokenCount > 0) {
    throw new Error(`${brokenCount} organization chain(s) failed verification.`);
  }

  console.log(`Verified ${organizations.length} organization chain(s).`);
};

run()
  .catch((error) => {
    console.error('Fiscal record chain verification failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
