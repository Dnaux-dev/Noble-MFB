import { Pool, types } from 'pg';

types.setTypeParser(1082, (value) => value);

const databaseUrl = process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !databaseUrl) {
  throw new Error(
    'DATABASE_URL environment variable is required in production',
  );
}

export const pool = new Pool(
  databaseUrl
    ? {
        connectionString: databaseUrl,
        ssl:
          process.env.DATABASE_SSL === 'true'
            ? { rejectUnauthorized: false }
            : undefined,
        max: 10,
        connectionTimeoutMillis: 10000,
      }
    : {
        host: 'localhost',
        port: 5432,
        user: 'ajilore',
        database: 'noble',
        password: process.env.DB_PASSWORD,
      },
);

pool.on('connect', () => {
  console.log('Connected to the database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});