import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  decryptVerifactuCertificate,
  encryptVerifactuCertificate,
  inspectVerifactuCertificate,
  loadOrganizationVerifactuSoapConfig,
  saveOrganizationVerifactuCertificate,
  VerifactuCertificateError,
} from './verifactu-certificate';

// Self-signed test certificates with made-up NIFs, valid for 100 years.
const fixture = (name: string) => readFileSync(
  path.join(process.cwd(), 'src', 'modules', 'verifactu', 'fixtures', `${name}.p12`),
);
const passphrase = 'test-password';
const envSource = { VERIFACTU_CERT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
const environment = {
  env: 'test' as const,
  endpoint: 'https://prewww1.aeat.es/verifactu',
  sealEndpoint: 'https://prewww10.aeat.es/verifactu',
};

const assertCertificateError = (fn: () => unknown, reason: string) =>
  assert.throws(
    fn,
    (error) => error instanceof VerifactuCertificateError && error.reason === reason,
  );

test('inspectVerifactuCertificate reads holder details from Spanish certificates', () => {
  const representative = inspectVerifactuCertificate(fixture('representative'), passphrase);
  const seal = inspectVerifactuCertificate(fixture('seal'), passphrase);
  const personal = inspectVerifactuCertificate(fixture('personal'), passphrase);

  assert.deepEqual(
    [representative, seal, personal].map(({ holderName, holderNif, isSeal }) => ({
      holderName,
      holderNif,
      isSeal,
    })),
    [
      { holderName: 'EMPRESA PRUEBA SL', holderNif: 'B12345674', isSeal: false },
      { holderName: 'EMPRESA PRUEBA SL', holderNif: 'B12345674', isSeal: true },
      { holderName: 'ESPAÑOL JUAN - 12345678Z', holderNif: '12345678Z', isSeal: false },
    ],
  );
  assert.ok(representative.validTo > new Date('2100-01-01T00:00:00.000Z'));
});

test('inspectVerifactuCertificate rejects unusable certificates', () => {
  assertCertificateError(
    () => inspectVerifactuCertificate(fixture('personal'), 'wrong-password'),
    'invalidPassword',
  );
  assertCertificateError(
    () => inspectVerifactuCertificate(fixture('legacy-rc2'), passphrase),
    'unsupportedFormat',
  );
  assertCertificateError(
    () => inspectVerifactuCertificate(Buffer.from('not a certificate'), passphrase),
    'invalidFile',
  );
  assertCertificateError(
    () => inspectVerifactuCertificate(
      fixture('personal'),
      passphrase,
      new Date('2200-01-01T00:00:00.000Z'),
    ),
    'expired',
  );
  assertCertificateError(
    () => inspectVerifactuCertificate(
      fixture('personal'),
      passphrase,
      new Date('1900-01-01T00:00:00.000Z'),
    ),
    'notYetValid',
  );
});

test('encryptVerifactuCertificate round-trips only for the same organization', () => {
  const pfx = fixture('seal');
  const encrypted = encryptVerifactuCertificate('org_1', { pfx, passphrase }, envSource);

  assert.equal(encrypted.includes(pfx.subarray(0, 64)), false);
  assert.deepEqual(decryptVerifactuCertificate('org_1', encrypted, envSource), {
    pfx,
    passphrase,
  });
  assert.throws(() => decryptVerifactuCertificate('org_2', encrypted, envSource));
  assert.throws(
    () => encryptVerifactuCertificate('org_1', { pfx, passphrase }, {}),
    /VERIFACTU_CERT_ENCRYPTION_KEY/,
  );
});

const fakeCertificateClient = () => {
  const rows = new Map<string, Record<string, unknown>>();

  return {
    rows,
    client: {
      verifactuCertificate: {
        async upsert(args: {
          where: { organizationId: string };
          create: Record<string, unknown>;
        }) {
          rows.set(args.where.organizationId, args.create);

          return args.create;
        },
        async findUnique(args: { where: { organizationId: string } }) {
          return rows.get(args.where.organizationId) ?? null;
        },
      },
    } as never,
  };
};

test('loadOrganizationVerifactuSoapConfig uses the stored certificate and endpoint', async () => {
  const { client, rows } = fakeCertificateClient();

  await saveOrganizationVerifactuCertificate(
    client,
    'org_seal',
    { pfx: fixture('seal'), passphrase },
    envSource,
  );
  await saveOrganizationVerifactuCertificate(
    client,
    'org_personal',
    { pfx: fixture('personal'), passphrase },
    envSource,
  );

  const sealConfig = await loadOrganizationVerifactuSoapConfig({
    client,
    organizationId: 'org_seal',
    environment,
    envSource,
  });
  const personalConfig = await loadOrganizationVerifactuSoapConfig({
    client,
    organizationId: 'org_personal',
    environment,
    envSource,
  });

  assert.equal(rows.get('org_seal')!.holderNif, 'B12345674');
  assert.equal(sealConfig.endpoint, environment.sealEndpoint);
  assert.deepEqual(sealConfig.certificate, fixture('seal'));
  assert.equal(sealConfig.certPassphrase, passphrase);
  assert.equal(personalConfig.endpoint, environment.endpoint);
  await assert.rejects(
    loadOrganizationVerifactuSoapConfig({
      client,
      organizationId: 'org_missing',
      environment,
      envSource,
    }),
    (error) => error instanceof VerifactuCertificateError && error.reason === 'missing',
  );
  await assert.rejects(
    loadOrganizationVerifactuSoapConfig({
      client,
      organizationId: 'org_seal',
      environment,
      envSource,
      now: new Date('2200-01-01T00:00:00.000Z'),
    }),
    (error) => error instanceof VerifactuCertificateError && error.reason === 'expired',
  );
});
