import { createCipheriv, createDecipheriv, randomBytes, X509Certificate } from 'node:crypto';
import { createSecureContext } from 'node:tls';
import type { Prisma } from '@prisma/client';
import type {
  VerifactuSoapConfig,
  VerifactuSoapEnvironmentConfig,
} from './verifactu-soap';

export type VerifactuCertificateErrorReason =
  | 'invalidPassword'
  | 'unsupportedFormat'
  | 'missingPrivateKey'
  | 'invalidFile'
  | 'expired'
  | 'notYetValid'
  | 'missing';

export class VerifactuCertificateError extends Error {
  constructor(readonly reason: VerifactuCertificateErrorReason, message: string) {
    super(message);
    this.name = 'VerifactuCertificateError';
  }
}

export type VerifactuCertificateDetails = {
  holderName: string;
  holderNif: string | null;
  isSeal: boolean;
  validFrom: Date;
  validTo: Date;
};

type VerifactuCertificateClient = Pick<Prisma.TransactionClient, 'verifactuCertificate'>;

// Node's TLS layer opens the PKCS#12 file, which also checks the password and
// that the private key matches the certificate.
const readCertificateDer = (pfx: Buffer, passphrase: string) => {
  try {
    const { context } = createSecureContext({ pfx, passphrase }) as unknown as {
      context: { getCertificate?: () => Buffer | null };
    };
    const der = context.getCertificate?.();

    if (!der) {
      throw new Error('PKCS#12 file has no certificate.');
    }

    return der;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/mac verify failure|bad decrypt/iu.test(message)) {
      throw new VerifactuCertificateError('invalidPassword', message);
    }

    if (/unsupported pkcs12/iu.test(message)) {
      throw new VerifactuCertificateError('unsupportedFormat', message);
    }

    if (/private key/iu.test(message)) {
      throw new VerifactuCertificateError('missingPrivateKey', message);
    }

    throw new VerifactuCertificateError('invalidFile', message);
  }
};

const parseSubject = (subject: string) => new Map(
  subject.split('\n').flatMap((line) => {
    const separator = line.indexOf('=');

    return separator > 0 ? [[line.slice(0, separator), line.slice(separator + 1)] as const] : [];
  }),
);

// Spanish certificates carry the entity NIF as organizationIdentifier
// (VATES-B12345678) and a person's NIF as serialNumber (IDCES-12345678Z).
// Seal certificates identify an entity with no natural person.
export const inspectVerifactuCertificate = (
  pfx: Buffer,
  passphrase: string,
  now = new Date(),
): VerifactuCertificateDetails => {
  const certificate = new X509Certificate(readCertificateDer(pfx, passphrase));
  const subject = parseSubject(certificate.subject);
  const organizationIdentifier = subject.get('organizationIdentifier');
  const serialNumber = subject.get('serialNumber');
  const validFrom = new Date(certificate.validFrom);
  const validTo = new Date(certificate.validTo);

  // Rejected rather than stored, so it can't replace a certificate that works today.
  if (validFrom > now) {
    throw new VerifactuCertificateError(
      'notYetValid',
      `Certificate is not valid until ${certificate.validFrom}.`,
    );
  }

  if (validTo <= now) {
    throw new VerifactuCertificateError(
      'expired',
      `Certificate expired on ${certificate.validTo}.`,
    );
  }

  return {
    holderName: subject.get('O') ?? subject.get('CN') ?? certificate.subject,
    holderNif: organizationIdentifier?.replace(/^VAT[A-Z]{2}-/u, '') ??
      serialNumber?.replace(/^IDC[A-Z]{2}-/u, '') ??
      null,
    isSeal: !!organizationIdentifier && !subject.has('GN') && !subject.has('SN'),
    validFrom,
    validTo,
  };
};

const encryptionKey = (envSource: NodeJS.ProcessEnv) => {
  const key = Buffer.from(envSource.VERIFACTU_CERT_ENCRYPTION_KEY ?? '', 'base64');

  if (key.length !== 32) {
    throw new Error('VERIFACTU_CERT_ENCRYPTION_KEY must be 32 bytes, base64 encoded.');
  }

  return key;
};

const ivLength = 12;
const authTagLength = 16;

// AES-256-GCM, bound to the organization so a payload can't be moved to another.
export const encryptVerifactuCertificate = (
  organizationId: string,
  { pfx, passphrase }: { pfx: Buffer; passphrase: string },
  envSource: NodeJS.ProcessEnv = process.env,
) => {
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(envSource), iv);

  cipher.setAAD(Buffer.from(organizationId));

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ pfx: pfx.toString('base64'), passphrase })),
    cipher.final(),
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
};

export const decryptVerifactuCertificate = (
  organizationId: string,
  payload: Uint8Array,
  envSource: NodeJS.ProcessEnv = process.env,
) => {
  const data = Buffer.from(payload);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(envSource),
    data.subarray(0, ivLength),
  );

  decipher.setAAD(Buffer.from(organizationId));
  decipher.setAuthTag(data.subarray(ivLength, ivLength + authTagLength));

  const plaintext = Buffer.concat([
    decipher.update(data.subarray(ivLength + authTagLength)),
    decipher.final(),
  ]);
  const parsed = JSON.parse(plaintext.toString('utf8')) as { pfx: string; passphrase: string };

  return { pfx: Buffer.from(parsed.pfx, 'base64'), passphrase: parsed.passphrase };
};

export const verifactuCertificateSummarySelect = {
  holderName: true,
  holderNif: true,
  isSeal: true,
  validFrom: true,
  validTo: true,
  updatedAt: true,
} satisfies Prisma.VerifactuCertificateSelect;

export const getOrganizationVerifactuCertificate = (
  client: VerifactuCertificateClient,
  organizationId: string,
) => client.verifactuCertificate.findUnique({
  where: { organizationId },
  select: verifactuCertificateSummarySelect,
});

export const saveOrganizationVerifactuCertificate = (
  client: VerifactuCertificateClient,
  organizationId: string,
  upload: { pfx: Buffer; passphrase: string },
  envSource: NodeJS.ProcessEnv = process.env,
) => {
  const details = inspectVerifactuCertificate(upload.pfx, upload.passphrase);
  const data = {
    ...details,
    encryptedPayload: encryptVerifactuCertificate(organizationId, upload, envSource),
  };

  return client.verifactuCertificate.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
    select: verifactuCertificateSummarySelect,
  });
};

export const deleteOrganizationVerifactuCertificate = (
  client: VerifactuCertificateClient,
  organizationId: string,
) => client.verifactuCertificate.deleteMany({ where: { organizationId } });

// Builds the SOAP config that submits as the organization, with its own
// certificate and the endpoint for its certificate type.
export const loadOrganizationVerifactuSoapConfig = async ({
  client,
  organizationId,
  environment,
  envSource = process.env,
  now = new Date(),
}: {
  client: VerifactuCertificateClient;
  organizationId: string;
  environment: VerifactuSoapEnvironmentConfig;
  envSource?: NodeJS.ProcessEnv;
  now?: Date;
}): Promise<VerifactuSoapConfig> => {
  const certificate = await client.verifactuCertificate.findUnique({
    where: { organizationId },
    select: { encryptedPayload: true, isSeal: true, validTo: true },
  });

  if (!certificate) {
    throw new VerifactuCertificateError(
      'missing',
      `Organization ${organizationId} has no Veri*Factu certificate.`,
    );
  }

  if (certificate.validTo <= now) {
    throw new VerifactuCertificateError(
      'expired',
      `Organization ${organizationId} Veri*Factu certificate has expired.`,
    );
  }

  const { pfx, passphrase } = decryptVerifactuCertificate(
    organizationId,
    certificate.encryptedPayload,
    envSource,
  );

  return {
    env: environment.env,
    endpoint: certificate.isSeal ? environment.sealEndpoint : environment.endpoint,
    certificate: pfx,
    certPassphrase: passphrase,
  };
};
