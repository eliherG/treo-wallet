# Treo Wallet

Billetera simulada en pesos mexicanos (MXN), desarrollada para la evaluación técnica fullstack de Treo. El alcance aprobado contempla una API, un cliente web y una aplicación móvil. Las operaciones utilizarán exclusivamente cuentas internas y fondos de demostración.

## Estado actual

**T-01: configuración inicial preparada, pendiente de instalación y verificación.** La cobertura corresponde a RNF-01, RNF-08, RNF-09 y RNF-10 del [plan de tareas](./specs/tasks.md). Este estado no acredita el cumplimiento de funcionalidades financieras.

El repositorio contiene npm workspaces, configuración TypeScript estricta y ESLint. Los módulos iniciales de cada workspace son entradas mínimas para comprobar la configuración. Los servidores, la base de datos, las pantallas y las suites de pruebas aún están pendientes.

Las instrucciones siguientes se ejecutan desde la terminal normal de VS Code. Los resultados de instalación, lint y typecheck deben revisarse antes de dar T-01 por verificada.

## Requisitos de desarrollo

- Node.js **24.x**.
- npm **12.x**.
- Git para revisar cambios y mantener la trazabilidad.

[.nvmrc](./.nvmrc) declara Node.js 24; los campos `engines` de [package.json](./package.json) documentan las versiones de Node.js y npm acordadas. Esta configuración no instala ni cambia las herramientas del sistema.

## Estructura

| Ruta | Propósito |
|---|---|
| [api/](./api/) | Workspace `@treo/api`; preparación para la API Node.js. |
| [web/](./web/) | Workspace `@treo/web`; preparación para el cliente React. |
| [mobile/](./mobile/) | Workspace `@treo/mobile`; preparación para React Native con Expo. |
| [packages/shared/](./packages/shared/) | Workspace `@treo/shared`; base neutral para contratos compartidos. La generación OpenAPI corresponde a T-07. |
| [scripts/](./scripts/) | Mensajes de error para comandos cuya funcionalidad está pendiente. |
| [specs/](./specs/) | Enunciado, requisitos, diseño, contrato, tareas y bitácora. |
| [tsconfig.base.json](./tsconfig.base.json) | Opciones TypeScript comunes. |
| [eslint.config.mjs](./eslint.config.mjs) | Configuración plana de ESLint. |

Todos los paquetes son privados. Las herramientas de desarrollo se declaran en la raíz y se comparten entre los cuatro workspaces.

## Instalación

Desde la raíz del repositorio:

```bash
node --version
npm --version
npm install
npm ls --workspaces --depth=0
```

Comprueba que las versiones pertenezcan a las líneas 24.x y 12.x, respectivamente. Si la instalación falla, conserva la salida para revisar la causa antes de continuar con las verificaciones.

La primera instalación generará un único `package-lock.json` en la raíz. Ese archivo deberá revisarse y versionarse junto con T-01, previa autorización del commit. Una vez exista el lockfile, las instalaciones reproducibles podrán utilizar `npm ci`. Ejecuta la instalación desde la raíz, sin crear lockfiles independientes en cada workspace.

Las dependencias de desarrollo declaradas son `typescript`, `eslint`, `@eslint/js`, `typescript-eslint` y `@types/node`. Los rangos de versiones están en [package.json](./package.json); la instalación registrará las versiones resueltas en el lockfile. No se incorporan todavía dependencias de las aplicaciones.

## TypeScript y lint

La configuración base habilita `strict`, `noUncheckedIndexedAccess`, consistencia de mayúsculas y `noEmit`, con objetivo ES2022. Cada workspace ejecuta su propia comprobación de tipos:

- [API](./api/tsconfig.json): resolución `NodeNext` y tipos de Node.js.
- [Web](./web/tsconfig.json): resolución `Bundler` y bibliotecas DOM.
- [Móvil](./mobile/tsconfig.json): resolución `Bundler`; la integración con la configuración de Expo queda para T-26.
- [Shared](./packages/shared/tsconfig.json): configuración neutral sin tipos globales de Node.js ni DOM.

ESLint aplica reglas recomendadas de JavaScript y TypeScript, con ámbitos de configuración y exclusiones para dependencias y archivos generados. Los warnings también hacen fallar el comando de lint.

## Scripts disponibles

| Comando desde la raíz | Comportamiento en T-01 |
|---|---|
| `npm run lint` | Ejecuta `eslint . --max-warnings=0` sobre archivos reales. |
| `npm run typecheck` | Ejecuta `tsc --noEmit` en cada workspace y propaga errores. |
| `npm run dev` | Devuelve un error explícito: servidores pendientes de T-08, T-21 y T-26. |
| `npm run test` | Devuelve un error explícito: suites de pruebas pendientes. |
| `npm run db:migrate` | Devuelve un error explícito: sistema de migraciones pendiente de T-02. |
| `npm run db:seed` | Devuelve un error explícito: seed pendiente de T-20. |

Los comandos pendientes escriben su motivo en la salida de error y terminan con código **1**. El código 1 confirma únicamente que el comando informa de su indisponibilidad; no acredita una prueba, un servidor ni una operación de base de datos.

## Verificación de T-01

Después de completar la instalación:

```bash
npm run lint
npm run typecheck
git diff --check
git status --short
```

Lint y typecheck deben terminar con código 0. Conserva sus salidas completas para revisar los resultados. `git diff --check` revisa errores de whitespace en el diff; la revisión debe incluir también los archivos nuevos que muestre `git status`.

Para inspeccionar las opciones efectivas de TypeScript por workspace, sin descargar herramientas adicionales:

```bash
npm run typecheck --workspace @treo/api -- --showConfig
npm run typecheck --workspace @treo/web -- --showConfig
npm run typecheck --workspace @treo/mobile -- --showConfig
npm run typecheck --workspace @treo/shared -- --showConfig
```

Para verificar las salidas explícitas de los comandos pendientes en zsh o bash, ejecuta cada comando y consulta inmediatamente su código de salida. Se espera **1** en los cuatro casos:

```bash
npm run dev
echo $?
npm run test
echo $?
npm run db:migrate
echo $?
npm run db:seed
echo $?
```

Estas verificaciones no ejecutan operaciones de base de datos. Todavía no hay suites funcionales: comprobar las entradas mínimas de TypeScript verifica la configuración, no los requisitos financieros.

## Variables de entorno

[.env.example](./.env.example) contiene únicamente `NODE_ENV=development` como referencia inicial. Ningún servidor consume todavía esta plantilla y no es necesario copiarla para instalar dependencias, ejecutar lint o comprobar tipos. Las variables de conexión y los secretos se incorporarán en sus tareas correspondientes.

[.gitignore](./.gitignore) excluye dependencias, resultados generados y archivos de entorno locales; conserva la plantilla de ejemplo. No deben versionarse secretos.

## Especificaciones y trazabilidad

- [Instrucciones del repositorio](./AGENTS.md).
- [Enunciado original de Treo](./specs/treo-assessment-original.md).
- [Requisitos aprobados](./specs/requirements.md).
- [Diseño técnico aprobado](./specs/design.md).
- [Contrato OpenAPI 3.1](./specs/openapi.json).
- [Plan de tareas](./specs/tasks.md).
- [Bitácora de uso de AI](./specs/ai-log.md).

El baseline SPEC corresponde al commit `4cae008d158a95a4361ce45d3cc468bd7e749ea9`, verificado en la etapa previa a la implementación. Los cambios de T-01 permanecen pendientes de validación y de un commit autorizado.

## Trabajo pendiente

El [plan aprobado](./specs/tasks.md) define las siguientes etapas: PostgreSQL y migraciones, contratos compartidos, API, pruebas financieras, clientes web y móvil, CI y documentación de arquitectura AWS. Los comandos de arranque local, migración, seed y Expo se documentarán cuando existan implementaciones verificables. T-02 no forma parte de este cambio.

También permanecen pendientes los entregables de evaluación, incluidas las pruebas de concurrencia, el análisis de rendimiento con 100,000 movimientos y el video de demostración. El proyecto aún no está listo para entrega.

## Mejoras con tiempo adicional

Una vez completados y verificados los requisitos obligatorios, se podrán evaluar mejoras de experiencia y accesibilidad a partir de la demostración. Las funcionalidades opcionales, como exportación de estados de cuenta o autenticación biométrica, requerirán priorización y aprobación separadas.
