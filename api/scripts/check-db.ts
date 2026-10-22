import { createDataSource, type DatabaseRole, type DatabaseTarget } from '../src/database/data-source.js';

async function check(target: DatabaseTarget, role: DatabaseRole): Promise<void> {
  const dataSource = createDataSource(role, target);
  try {
    await dataSource.initialize();
    const rows: Array<{
      database_name: string;
      role_name: string;
      can_create_tables: boolean;
    }> = await dataSource.query(`
      SELECT current_database() AS database_name,
             current_user AS role_name,
             has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_tables
    `);
    const result = rows[0];
    if (!result) throw new Error('No database identity returned');
    const expectCreate = role === 'migrator';
    if (result.can_create_tables !== expectCreate) {
      throw new Error(`Incorrect schema permissions for ${result.role_name}`);
    }
    console.log(`OK ${result.database_name} / ${result.role_name} / DDL: ${result.can_create_tables}`);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

async function main(): Promise<void> {
  for (const target of ['development', 'test'] as const) {
    for (const role of ['app', 'migrator'] as const) {
      await check(target, role);
    }
  }
}

main().catch((error: unknown) => {
  console.error('Database check failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
