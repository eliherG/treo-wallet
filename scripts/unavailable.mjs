const pendingCommands = new Map([
  ['dev', 'El arranque de API, web y móvil se implementará en T-08, T-21 y T-26.'],
  ['test', 'Todavía no hay suites automatizadas implementadas. No se han ejecutado pruebas.'],
  ['db:migrate', 'El sistema de migraciones corresponde a T-02. No se ha conectado a la base de datos.'],
  ['db:seed', 'El seed reproducible corresponde a T-20. No se han creado ni modificado datos.'],
]);

const command = process.argv[2];
const reason = pendingCommands.get(command) ?? 'El comando solicitado no tiene implementación.';

console.error(`[T-01] ERROR: ${command ?? 'comando desconocido'} no disponible. ${reason}`);
process.exitCode = 1;
