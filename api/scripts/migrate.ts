import { createDataSource } from '../src/database/data-source.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--test')) {
    throw new Error('Unknown argument. Use --test for treo_test.');
  }
  const target = args.includes('--test') ? 'test' : 'development';
  const dataSource = createDataSource('migrator', target);

  try {
    await dataSource.initialize();
    const applied = await dataSource.runMigrations();
    console.log(`Migration run succeeded (${target}); applied: ${applied.length}.`);
    if (applied.length === 0) {
      console.log('No pending migrations.');
    }
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
