import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(databaseDirectory, '../../..');
config({ path: join(repositoryRoot, '.env'), quiet: true });

export type DatabaseRole = 'app' | 'migrator';
export type DatabaseTarget = 'development' | 'test';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function createDataSource(
  role: DatabaseRole,
  target: DatabaseTarget = 'development',
): DataSource {
  const port = Number(process.env.DB_PORT ?? '5433');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be a valid TCP port');
  }

  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port,
    username: role === 'migrator' ? 'treo_migrator' : 'treo_app',
    password: required(role === 'migrator' ? 'TREO_MIGRATOR_PASSWORD' : 'TREO_APP_PASSWORD'),
    database: target === 'test' ? required('DB_TEST_NAME') : required('DB_NAME'),
    entities: [], // T-03 introduces domain entities; T-02 configures only infrastructure.
    migrations: [join(databaseDirectory, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'typeorm_migrations',
    migrationsRun: false,
    migrationsTransactionMode: 'all',
    synchronize: false,
    logging: false,
  });
}
