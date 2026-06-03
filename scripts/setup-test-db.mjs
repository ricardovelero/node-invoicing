import { Client } from "pg";

const defaultDatabaseUrl = "postgresql://test:test@localhost:5432/test";
const targetUrl = new URL(process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl);
const adminUrl =
  process.env.TEST_DATABASE_ADMIN_URL ??
  process.env.DATABASE_ADMIN_URL ??
  "postgresql://localhost:5432/postgres";

const role = decodeURIComponent(targetUrl.username);
const password = decodeURIComponent(targetUrl.password);
const database = decodeURIComponent(targetUrl.pathname.replace(/^\//, ""));

if (!role || !database) {
  console.error(
    "TEST_DATABASE_URL must include a database user and database name.",
  );
  process.exit(1);
}

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = (value) => `'${value.replaceAll("'", "''")}'`;

const adminClient = new Client({
  connectionString: adminUrl,
});

await adminClient.connect();

const roleResult = await adminClient.query(
  "SELECT 1 FROM pg_roles WHERE rolname = $1",
  [role],
);

if (roleResult.rowCount === 0) {
  await adminClient.query(
    `CREATE ROLE ${quoteIdentifier(role)} WITH LOGIN PASSWORD ${quoteLiteral(
      password,
    )}`,
  );
  console.log(`Created PostgreSQL role ${role}.`);
} else if (password) {
  await adminClient.query(
    `ALTER ROLE ${quoteIdentifier(role)} WITH LOGIN PASSWORD ${quoteLiteral(
      password,
    )}`,
  );
  console.log(`Updated password for PostgreSQL role ${role}.`);
}

const databaseResult = await adminClient.query(
  "SELECT 1 FROM pg_database WHERE datname = $1",
  [database],
);

if (databaseResult.rowCount === 0) {
  await adminClient.query(
    `CREATE DATABASE ${quoteIdentifier(database)} OWNER ${quoteIdentifier(
      role,
    )}`,
  );
  console.log(`Created PostgreSQL database ${database}.`);
} else {
  await adminClient.query(
    `ALTER DATABASE ${quoteIdentifier(database)} OWNER TO ${quoteIdentifier(
      role,
    )}`,
  );
  console.log(`Ensured PostgreSQL database ${database} is owned by ${role}.`);
}

await adminClient.query(
  `GRANT ALL PRIVILEGES ON DATABASE ${quoteIdentifier(
    database,
  )} TO ${quoteIdentifier(role)}`,
);
await adminClient.end();

const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${encodeURIComponent(database)}`;

const databaseClient = new Client({
  connectionString: databaseUrl.toString(),
});

await databaseClient.connect();
await databaseClient.query("CREATE SCHEMA IF NOT EXISTS public");
await databaseClient.query(
  `ALTER SCHEMA public OWNER TO ${quoteIdentifier(role)}`,
);
await databaseClient.query(
  `GRANT ALL ON SCHEMA public TO ${quoteIdentifier(role)}`,
);
await databaseClient.end();

console.log(
  `Test database is ready. Run pnpm test:e2e with TEST_DATABASE_URL=${targetUrl.toString()}`,
);
