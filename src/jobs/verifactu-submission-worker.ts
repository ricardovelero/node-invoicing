import { setTimeout as sleep } from 'node:timers/promises';
import { prisma } from '../db/prisma';
import { runVerifactuSubmissionPass } from '../modules/verifactu/verifactu-submission';
import { loadVerifactuSoapConfig } from '../modules/verifactu/verifactu-soap';

// Submits pending Veri*Factu records to AEAT. Runs continuously, polling every
// VERIFACTU_WORKER_POLL_SECONDS (default 10). Pass --once to run a single pass,
// e.g. from cron. Run one worker at a time: AEAT wait windows are kept in memory.
const run = async () => {
  const config = loadVerifactuSoapConfig();
  const once = process.argv.includes('--once');
  const pollSeconds = Number(process.env.VERIFACTU_WORKER_POLL_SECONDS) || 10;
  const nextSubmissionAt = new Map<string, number>();
  const stop = new AbortController();

  process.once('SIGINT', () => stop.abort());
  process.once('SIGTERM', () => stop.abort());

  do {
    await runVerifactuSubmissionPass({ client: prisma, config, nextSubmissionAt });

    if (!once) {
      await sleep(pollSeconds * 1000, undefined, { signal: stop.signal }).catch(() => {});
    }
  } while (!once && !stop.signal.aborted);
};

run()
  .catch((error) => {
    console.error('[VERIFACTU_WORKER_FATAL]', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
