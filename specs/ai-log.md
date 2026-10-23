# Treo Wallet — Bitácora de uso de inteligencia artificial

**Objetivo:** documentar de forma verificable la contribución de herramientas de IA, decisiones de ingeniería, revisión humana y evidencia de ejecución. Los prompts se **resumen técnicamente**: no se transcriben intervenciones informales ni conversaciones completas. No se atribuyen pruebas o commits que no consten como ejecutados.

## 2026-10-21 — Planificación del proceso y reglas de asistencia

- **Herramienta:** ChatGPT (GPT-6).
- **Ámbito:** planificación inicial, estructura del monorepositorio y definición de instrucciones para el agente de codificación.
- **Solicitud técnica (síntesis):** establecer un flujo de desarrollo guiado por especificaciones, con verificación de resultados, controles financieros, revisión humana y commits trazables.
- **Contribuciones de IA:** recomendación de `AGENTS.md` en la raíz para establecer instrucciones globales; ampliación del documento con precedencia de especificaciones, contrato OpenAPI, reglas de idempotencia/concurrencia, definición de terminado y permisos de ejecución.
- **Revisión y decisión humana:** se aceptó el enfoque de desarrollo basado en especificaciones, con aprobación de cambios significativos antes de implementar y sin commits automáticos.
- **Alternativas descartadas:** generar la aplicación completa directamente a partir del enunciado, sin requisitos ni criterios verificables; introducir servicios bancarios reales o funcionalidades fuera de alcance.
- **Riesgos técnicos identificados:** doble aplicación de transferencias, carrera de saldos, consumo concurrente del límite diario, exposición de secretos y auditoría mutable.
- **Evidencia:** archivos de especificación preparados; no hubo ejecución de código de aplicación, pruebas, migraciones, despliegue ni commits mediante IA.

## 2026-10-21 — Catálogo de requisitos y criterios de aceptación

- **Herramienta:** ChatGPT (GPT-6).
- **Ámbito:** `specs/requirements.md`, RF-01 a RF-14, criterios `CA-RFXX-NN` y decisiones D-01 a D-08.
- **Solicitud técnica (síntesis):** descomponer el alcance funcional de la prueba en requisitos identificables, reglas de negocio y escenarios Given/When/Then que permitan derivar pruebas automatizadas.
- **Contribuciones de IA:** catálogo de 14 requisitos, criterios de aceptación verificables para los flujos web/API/móvil, reglas explícitas de límites, OTP simulado, cuentas de demostración, importes exactos y casos de concurrencia; matriz de requisitos no funcionales y cobertura de pruebas.
- **Decisión humana:** se aprobó el catálogo funcional inicial y, posteriormente, la versión 0.3 completa de `requirements.md`, incluidos los criterios de aceptación y las decisiones D-01 a D-08.
- **Método de revisión:** se consolidaron las definiciones en un único entregable para favorecer consistencia entre requisitos y reducir iteraciones fragmentadas. La aprobación permaneció separada de la implementación.
- **Alternativas descartadas:** validación de dinero con aritmética flotante; ausencia de reglas explícitas para medianoche y reintentos; ampliación no solicitada hacia KYC, SPEI, depósitos o pagos reales.
- **Limitación deliberada:** el OTP de demostración es admisible solo en entorno local/test y no constituye un mecanismo apto para producción.
- **Correcciones de contenido registradas:** ninguna corrección financiera comprobada durante esta fase. Se refinó el formato de documentación para mantener un registro técnico conciso, sin reproducir comentarios del proceso de revisión.
- **Estado:** `requirements.md` v0.3 aprobado el 2026-10-21; diseño y tareas de implementación aún pendientes de aprobación.
- **Evidencia:** se prepararon documentos; no se ejecutaron pruebas de software, `EXPLAIN ANALYZE`, CI, migraciones o commits mediante IA.

## 2026-10-21 — Inicio de diseño técnico

- **Herramienta:** ChatGPT (GPT-6).
- **Ámbito:** borrador de `specs/design.md` y contrato `specs/openapi.yaml` (versión inicial) para revisión técnica.
- **Solicitud técnica (síntesis):** derivar arquitectura, modelo de datos y contrato HTTP de la especificación funcional aprobada, preservando seguridad financiera y trazabilidad.
- **Propuesta de IA:** arquitectura modular Express/TypeORM; saldos en centavos `BIGINT`; bloqueo determinista de cuentas; contador diario transaccional; idempotencia persistente; ledger de doble entrada validado con trigger diferido; auditoría de solo inserción; flujos web y móvil con recuperación de solicitudes inciertas.
- **Revisión humana:** pendiente para `design.md` y `openapi.yaml`; no se consideran aprobados hasta la revisión del desarrollador.
- **Riesgos pendientes de verificar:** orden efectivo de bloqueos en SQL, comportamiento de triggers diferidos, compatibilidad del contrato OpenAPI con generadores de tipos, diseño de revocación de tokens y límites de protección de pantalla con Expo.
- **Evidencia:** se validó sintácticamente el YAML OpenAPI y se verificó que sus referencias internas declaradas existieran. No se ejecutaron migraciones, API, pruebas funcionales, CI ni commits.

> **Regla de mantenimiento:** a partir de `tasks.md`, registrar `T-XX`, herramienta, resumen del prompt, propuesta significativa, decisión humana, cambios realizados, comandos realmente ejecutados, resultados y hash de commit solo cuando exista. Si una prueba falla, registrar el fallo y la corrección, no declararla aprobada.

## 2026-10-21 — Aprobación del diseño y cambio de representación OpenAPI

- **Herramienta:** ChatGPT (GPT-6); conversión determinista con Python y PyYAML.
- **Ámbito:** `specs/design.md`, `specs/openapi.json` y actualización de referencias documentales.
- **Solicitud técnica (síntesis):** incorporar la aprobación del diseño técnico y distribuir el contrato OpenAPI 3.1 en formato JSON en lugar de YAML.
- **Decisión humana:** `design.md` aprobado; preferencia por `openapi.json` como formato fuente del contrato.
- **Cambios realizados:** serialización del contrato de YAML a JSON, actualización de enlaces del diseño y estado de aprobación. Se actualizó únicamente la descripción de estado en la metadata del contrato; no cambiaron rutas, operaciones, esquemas ni validaciones.
- **Verificaciones ejecutadas:** parseo de origen YAML, parseo del JSON resultante, versión `openapi: 3.1.0` y resolución de todas las referencias internas `$ref`. Estas verificaciones no equivalen a una validación completa del estándar OpenAPI ni a pruebas funcionales.
- **Limitaciones:** sin ejecución de API, migraciones, pruebas de integración, CI ni commits en el repositorio local. `tasks.md` aún no elaborado.

## 2026-10-21 — Descomposición del diseño aprobado en tareas verificables

- **Herramienta:** ChatGPT (GPT-6).
- **Ámbito:** elaboración de `specs/tasks.md` v0.1 a partir de `requirements.md` v0.3, `design.md` v0.1 y `openapi.json`.
- **Solicitud técnica (síntesis):** transformar el diseño aprobado en un plan de implementación incremental con responsables por componente (`api`, `web`, `mobile`), dependencias, criterios de aceptación, pruebas y commits trazables.
- **Contribuciones de IA:** 33 tareas `T-00` a `T-32`, ordenadas por dependencias y puertas de calidad, incluyendo integridad SQL, idempotencia, concurrencia, generación de tipos OpenAPI, interfaz web/móvil, performance, AWS, CI y documentación de entrega.
- **Revisión humana:** pendientes la revisión y aprobación de `tasks.md`; no se realizaron cambios a los contenidos aprobados de `requirements.md` o `design.md`.
- **Riesgos controlados:** se exige primer commit documental previo a código, pruebas PostgreSQL real de invariantes monetarios, reintentos con la misma llave y CI ejecutado antes de afirmar éxito.
- **Alternativas descartadas:** implementación completa sin tareas verificables, asignar pruebas a una fase opcional y commits automáticos sin aprobación.
- **Verificaciones efectuadas:** revisión automatizada de identificadores de tareas y cobertura de RF en el plan (no equivale a ejecución de pruebas).
- **Evidencia y limitaciones:** se generó un borrador documental. No se instalaron dependencias, ni ejecutaron pruebas, migraciones, benchmarks, Git commits o CI.

## 2026-10-21 — Aprobación de tareas y preparación del baseline documental (T-00)

- **Herramienta:** ChatGPT (GPT-6).
- **Actividad:** consolidación del paquete SPEC inicial y revisión de las instrucciones de codificación.
- **Decisión humana:** aprobada la versión 0.1 de `specs/tasks.md`; previamente aprobados `specs/requirements.md` v0.3 y `specs/design.md` v0.1; se definió JSON como formato para el contrato OpenAPI 3.1.
- **Insumos:** enunciado de Treo compartido por el desarrollador, especificaciones aprobadas y revisión de `AGENTS.md` proporcionada para este proyecto.
- **Cambios relevantes en `AGENTS.md`:** corrección de ejemplos de commits conforme a los IDs reales T/RF; prohibición de reescribir migraciones ya aplicadas; preservación del enunciado original; límites claros de aprobación por tarea; manejo de resultados inciertos e idempotencia; conciliación de saldos almacenados con asientos contables.
- **Coherencia documental:** se ajustó exclusivamente la referencia de `T-00` en `tasks.md` para incorporar `specs/treo-assessment-original.md` al primer commit; el resto de las tareas y requisitos aprobados no se modificaron.
- **Origen del enunciado:** `treo-assessment-original.md` recoge el texto de la prueba compartido en la conversación. Antes del commit se recomienda contrastarlo con el archivo recibido de Treo para confirmar la fidelidad de la transcripción. No se han añadido requisitos del asistente dentro de ese enunciado.
- **Alternativas descartadas:** ejemplos de commit con identificadores de tareas incorrectos; reescritura de migraciones aplicadas; creación automática de una nueva operación tras una desconexión incierta.
- **Revisión y verificación:** comprobaciones documentales locales de JSON, referencias y enumeración de tareas; no equivalen a pruebas de la aplicación.
- **Estado:** paquete documental preparado para revisión final y commit **pendiente de ejecución** por el desarrollador. No se han creado commits, instalado dependencias ni ejecutado migraciones, pruebas de API, pruebas de concurrencia o CI durante esta actividad.

## 2026-10-21 — T-01: aprobación del alcance y diagnóstico del entorno

- **Herramienta:** Codex (GPT-6), con revisión paralela de alcance y configuración en modo de solo lectura.
- **Cobertura prevista:** RNF-01, RNF-08, RNF-09 y RNF-10; infraestructura de monorepo, sin acreditar funcionalidades de negocio.
- **Solicitud técnica (síntesis):** configurar npm workspaces y TypeScript estricto; diagnosticar primero el acceso a Git, Node.js y npm; instalar únicamente las dependencias mínimas aprobadas después de verificar las herramientas; mantener los comandos pendientes con error explícito.
- **Decisión humana:** implementación autorizada con Node.js 24 y npm 12, condicionada al funcionamiento de las tres herramientas. Autorizada únicamente la actualización de esta bitácora dentro de SPEC. No se autorizaron commits, cambios globales del sistema ni trabajo de T-02.
- **Corrección de la propuesta:** el desarrollador indicó conservar npm 12, ya instalado en su equipo, en lugar de npm 11 propuesto inicialmente. No se comprobó una incompatibilidad que justifique cambiar de versión.
- **Comprobaciones ejecutadas:** `echo "$PATH"`, `command -v node`, `command -v npm`, `command -v git`, `xcode-select -p`, inspección del repositorio y ejecución de las herramientas mediante rutas absolutas. El PATH contiene la instalación NVM de Node.js `v24.19.0`; las búsquedas de Node/npm no devolvieron ruta, aunque la ejecución directa de Node confirmó `v24.19.0`. `xcode-select -p` devolvió `/Library/Developer/CommandLineTools`.
- **Diagnóstico de Git:** `/usr/bin/git` falla al localizar las Command Line Tools en el entorno restringido. El ejecutable directo de esas herramientas funciona al aplicar `GIT_CONFIG_NOSYSTEM=1` únicamente al proceso, evitando la configuración de sistema inaccesible; se utilizó también `GIT_ATTR_NOSYSTEM=1` para las comprobaciones posteriores. Versión observada: `2.54.0 (Apple Git-157)`. No se modificó configuración global.
- **Baseline verificado:** `HEAD` es `4cae008d158a95a4361ce45d3cc468bd7e749ea9`, sin padres, con mensaje `docs(spec): establish approved baseline [T-00] [RF-01] [RF-14]`. Su árbol contiene exclusivamente `AGENTS.md` y los seis documentos SPEC. Antes de esta entrada, los diffs tracked y staged estaban vacíos; los diez manifests/tsconfigs de raíz y workspaces eran archivos preexistentes, vacíos y sin seguimiento.
- **Bloqueo de npm:** la invocación directa devuelve `operation not permitted`; al invocar su CLI mediante Node, el proceso aborta por acceso denegado a `/System/Library/OpenSSL/openssl.cnf`. Los intentos con ejecución ampliada mantuvieron la restricción. No se pudo confirmar la versión ni el funcionamiento de npm. Estos resultados no demuestran una instalación dañada ni justifican reinstalar herramientas.
- **Resultado:** implementación e instalación pendientes por la condición previa de autorización. No se ejecutaron `npm install`, lint, typecheck, pruebas ni operaciones de base de datos. Los archivos de configuración siguen vacíos; el único cambio realizado es esta entrada. No se alteraron los demás documentos SPEC ni se creó un commit.
- **Acción pendiente:** habilitar el acceso necesario a las herramientas instaladas y a la configuración OpenSSL en el entorno de ejecución; verificar npm 12 y continuar T-01 bajo la autorización existente.

## 2026-10-21 — T-01: configuración del monorepo y verificación delegada al desarrollador

- **Herramienta:** Codex (GPT-6), con colaboración paralela para el README y revisión estática de la configuración.
- **Solicitud técnica (síntesis):** implementar los archivos del monorepo conforme al plan aprobado, conservando Node.js 24 y npm 12. El desarrollador ejecutará la instalación y las verificaciones desde su terminal normal de VS Code y compartirá sus resultados para revisión.
- **Decisión humana:** sustituida la condición previa de resolver los permisos del agente por un flujo de edición asistida y ejecución local del desarrollador. No se realizaron nuevos intentos de diagnosticar permisos ni cambios de configuración global. Se mantuvieron las restricciones de no instalar dependencias desde el agente, no crear commits y no iniciar T-02.
- **Cobertura:** T-01; preparación de infraestructura para RNF-01, RNF-08, RNF-09 y RNF-10. No se acredita cumplimiento de requisitos funcionales ni de pruebas financieras.
- **Archivos modificados:** los diez manifests/tsconfigs preexistentes de raíz, API, web, móvil y shared; esta bitácora. Se conservaron los demás documentos SPEC.
- **Archivos creados:** `.nvmrc`, `.gitignore`, `.env.example`, `eslint.config.mjs`, `scripts/unavailable.mjs`, `README.md` y un `src/index.ts` técnico por workspace.
- **Configuración implementada:** paquetes privados con npm workspaces explícitos; engines Node.js 24/npm 12; TypeScript estricto con objetivo ES2022 y `noEmit`; resolución NodeNext en API/shared y Bundler en clientes; tipos Node limitados a API y bibliotecas DOM limitadas a web. Las entradas técnicas contienen únicamente `export {}` y no implementan servidores ni comportamiento de negocio.
- **Lint y scripts:** configuración plana de ESLint con reglas recomendadas JS/TS y warnings tratados como fallo. `typecheck` recorre los cuatro workspaces sin omitir scripts ausentes. `dev`, `test`, `db:migrate` y `db:seed` escriben un motivo explícito y establecen código de salida 1 mientras su funcionalidad está pendiente; no simulan ejecución satisfactoria.
- **Dependencias declaradas, no instaladas:** `typescript` `~5.9.3`, `eslint` y `@eslint/js` `^9.39.0`, `typescript-eslint` `^8.46.2`, `@types/node` `^24.0.0`. Se consultaron los [rangos de compatibilidad de typescript-eslint](https://typescript-eslint.io/users/dependency-versions/) y la [documentación de configuración de ESLint](https://eslint.org/docs/latest/use/configure/configuration-files). Esta consulta documental no sustituye la instalación ni la ejecución de verificaciones. El lockfile raíz será generado por `npm install` en la terminal del desarrollador; no se fabricó un lockfile.
- **Revisión efectuada:** inspección estática de los archivos, rutas relativas, herencia de TypeScript, ámbitos de lint, scripts y correspondencia con el README. No se identificaron defectos bloqueantes en esa revisión; no equivale a haber ejecutado lint o typecheck. No se identificaron nuevos problemas de integridad financiera; esta tarea no implementa operaciones monetarias.
- **Verificación pendiente:** versiones locales de Node/npm, instalación, árbol de dependencias/workspaces, lint, typecheck, configuración efectiva de TypeScript, códigos de salida de los comandos pendientes y estado/diff de Git. No se ejecutaron esos comandos en esta etapa ni se recibieron todavía resultados del desarrollador.
- **Resultado:** archivos de T-01 preparados para verificación manual. La tarea no se marca como terminada; quedan pendientes la evidencia de instalación/verificación, la revisión del lockfile y un commit autorizado. Mensaje propuesto: `chore(repo): configurar monorepo npm y TypeScript estricto [T-01]`.

## 2026-10-21 — T-01: resultados locales, revisión de aceptación y soporte de ESLint

- **Herramienta:** Codex (GPT-6), con revisión estática paralela del alcance de T-01.
- **Solicitud técnica (síntesis):** registrar los resultados reales de instalación y verificación comunicados por el desarrollador, revisar los criterios de aceptación y evaluar la advertencia de obsolescencia de ESLint sin actualizar dependencias ni comenzar T-02.
- **Origen de la evidencia:** comandos ejecutados por el desarrollador desde la terminal local de VS Code y resultados comunicados en la conversación. El agente no volvió a ejecutarlos; realizó lectura de los archivos de configuración y del lockfile, y consulta de documentación oficial. No se adjuntaron salidas completas de terminal.

| Comprobación local | Resultado comunicado por el desarrollador |
|---|---|
| `node --version` | `v24.19.0` |
| `npm --version` | `12.0.2` |
| `npm install` | Exitoso; 114 paquetes instalados |
| `npm audit` | 0 vulnerabilidades reportadas |
| `npm ls --workspaces --depth=0` | Cuatro workspaces |
| `npm run lint` | Exitoso |
| `npm run typecheck` | Exitoso |
| `npm run dev` | Código 1 esperado |
| `npm run test` | Código 1 esperado |
| `npm run db:migrate` | Código 1 esperado |
| `npm run db:seed` | Código 1 esperado |
| `git diff --check` | Sin errores reportados |

- **Lockfile revisado:** [package-lock.json](../package-lock.json) raíz, formato 3, con los cuatro enlaces locales `@treo/api`, `@treo/web`, `@treo/mobile` y `@treo/shared`; rangos de dependencias y engines coherentes con el manifiesto. Versiones resueltas observadas: TypeScript `5.9.3`, ESLint y `@eslint/js` `9.39.5`, `typescript-eslint` `8.72.0` y `@types/node` `24.19.2`. Esta lectura no equivale a ejecutar una instalación limpia mediante `npm ci`, que no fue reportada.
- **Aceptación técnica de T-01:** satisfecha dentro del alcance aprobado: cuatro workspaces privados, TypeScript estricto heredado, lint funcional, scripts raíz requeridos, `.env.example`, `.gitignore`, `.nvmrc` y documentación inicial. Las evidencias de instalación, lint y typecheck exigidas por T-01 fueron comunicadas como exitosas; los cuatro comandos pendientes devolvieron el error previsto y no simularon una operación satisfactoria. La cobertura de RNF-01, RNF-08, RNF-09 y RNF-10 se limita a esta infraestructura.
- **Límites de la validación:** no existen todavía suites funcionales, servidores, clientes React/Expo operativos ni configuración de base de datos; corresponden a tareas posteriores. El código 1 de `test` no constituye una suite aprobada. Las comprobaciones de tipos se realizaron sobre módulos técnicos mínimos, sin acreditar comportamiento financiero ni integración de las aplicaciones.
- **Advertencia comprobada:** el lockfile marca `eslint@9.39.5` como obsoleto por falta de soporte. La [política oficial de versiones de ESLint](https://eslint.org/version-support/) indica que la rama 9 llegó a fin de vida el **2026-08-06** y ya no recibe actualizaciones del proyecto. La advertencia corresponde al ciclo de mantenimiento; por sí misma no demuestra una vulnerabilidad ni un fallo del lint. El resultado de audit refleja las vulnerabilidades reportadas en aquella ejecución, no la vigencia del soporte.
- **Corrección de la revisión inicial:** la selección de ESLint 9 comprobó compatibilidad de herramientas, pero no identificó su fin de soporte. Se registra esta omisión y se distingue compatibilidad técnica de mantenimiento vigente.
- **Evaluación y recomendación de IA:** no se requiere una actualización inmediata para aceptar la evidencia técnica de T-01, dado el lint exitoso y la ausencia de vulnerabilidades reportadas. Se recomienda una próxima tarea de mantenimiento, antes de incorporar CI, para migrar conjuntamente `eslint` y `@eslint/js` a la rama 10. No se propone conservar indefinidamente una versión sin soporte. Node.js 24 cumple los requisitos de la [guía oficial de migración](https://eslint.org/docs/latest/use/migrate-to-10.0.0), y `typescript-eslint@8.72.0` declara compatibilidad con ESLint 10 en el lockfile; la migración concreta sigue pendiente de autorización y verificación.
- **Validación de una futura migración:** revisar cambios en reglas recomendadas y búsqueda de configuración, regenerar el lockfile desde la terminal del desarrollador y repetir instalación/auditoría, lint raíz y por workspace, y typecheck. No se cambiaron manifiestos, configuración ESLint ni lockfile en esta revisión.
- **Pendientes de cierre:** el commit de T-01 y la inclusión del lockfile requieren autorización; no se dispone de un nuevo `git status` comunicado. [README.md](../README.md) conserva el estado anterior de instalación/verificación pendiente, que deberá sincronizarse en una actualización documental posterior. [tasks.md](./tasks.md) conserva `TODO`; no se modificó el plan aprobado ni se marcó `DONE`. La aceptación técnica registrada aquí no equivale al cierre formal con commit trazable.
- **Cambios de esta interacción:** exclusivamente esta entrada en la bitácora. No se instalaron ni actualizaron dependencias, no se ejecutaron commits y no se inició T-02. Se mantiene el mensaje propuesto: `chore(repo): configurar monorepo npm y TypeScript estricto [T-01]`.

## T-02 — Infraestructura PostgreSQL y TypeORM

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** configurar la infraestructura de persistencia para desarrollo e integración.
- **Implementación:** PostgreSQL 16 mediante Docker Compose, bases de datos independientes, roles diferenciados y sistema de migraciones TypeORM.
- **Decisiones técnicas:** separación de privilegios entre aplicación y migraciones; uso de `synchronize: false`; configuración reproducible mediante variables de entorno.
- **Verificaciones ejecutadas:**
  - Contenedor PostgreSQL en estado healthy.
  - Conexiones satisfactorias a `treo_dev` y `treo_test`.
  - Privilegios DDL comprobados para ambos roles.
  - Migraciones ejecutadas en desarrollo y pruebas; cero migraciones pendientes.
  - ESLint y TypeScript sin errores.
- **Limitaciones:** las entidades, restricciones financieras y pruebas de integración del dominio se implementarán en tareas posteriores.
- **Estado:** implementación verificada.

## T-03 — Modelo de usuarios, cuentas y sesiones

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** implementar la estructura inicial de identidad, cuentas financieras y sesiones conforme a las especificaciones aprobadas.
- **Implementación:** entidades TypeORM para users, accounts y refresh_tokens; migración versionada con restricciones de integridad y relaciones.
- **Decisiones técnicas:** identificadores UUID, saldos BIGINT en centavos, moneda MXN, unicidad de correo y CLABE, integridad referencial y referencias para rotación de refresh tokens.
- **Verificación:** migración aplicada correctamente en desarrollo y pruebas; segunda ejecución sin migraciones pendientes.
- **Pruebas de integración:** 4 ejecutadas, 4 aprobadas, 0 fallidas.
- **Validaciones adicionales:** ESLint y TypeScript sin errores.
- **Alcance pendiente:** registro, autenticación JWT y rotación efectiva de tokens corresponden a tareas posteriores.
- **Estado:** implementación verificada.

## T-04 — Modelo de beneficiarios

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** implementar el modelo de persistencia de beneficiarios conforme a RF-04 y RF-05.
- **Implementación:** entidad TypeORM, migración PostgreSQL y pruebas de integración.
- **Decisiones técnicas:** unicidad compuesta `(user_id, clabe)`, validación de 18 dígitos mediante CHECK y asociación del beneficiario con su propietario mediante clave foránea.
- **Verificaciones:** migración aplicada en desarrollo y pruebas; ejecuciones posteriores sin migraciones pendientes.
- **Pruebas:** 8 ejecutadas, 8 aprobadas, 0 fallidas (T-03 y T-04).
- **Validaciones:** ESLint y TypeScript sin errores.
- **Alcance pendiente:** validación de checksum CLABE y endpoints de beneficiarios en T-12.
- **Estado:** implementación verificada.

## T-05 — Esquema financiero

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** implementar el esquema de persistencia financiera de Treo Wallet conforme a RF-06 a RF-14.
- **Implementación:** entidades TypeORM y migración PostgreSQL para `transfers`, `ledger_entries`, `daily_transfer_usage`, `otp_challenges` y `audit_events`.
- **Decisiones técnicas:** importes exactos con `BIGINT`, unicidad de idempotencia por usuario, restricciones de integridad referencial, control de estados y validaciones de importes, límites diarios e intentos OTP.
- **Verificación:** ESLint y TypeScript sin errores; 15 pruebas de integración ejecutadas y aprobadas, incluyendo las suites anteriores de T-03 y T-04.
- **Migraciones:** las ejecuciones observadas finalizaron correctamente sin migraciones pendientes; historial pendiente de confirmación.
- **Limitaciones:** los triggers de integridad contable, la protección de estados terminales y los controles avanzados de auditoría corresponden a T-06.
- **Estado:** pruebas aprobadas; revisión final y commit pendientes.

## T-06 — Restricciones contables y auditoría

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** reforzar la integridad contable mediante restricciones ejecutadas por PostgreSQL.
- **Implementación:** migración TypeORM con triggers diferidos para verificar transferencias completadas, protección de asientos y estados terminales, y controles de inmutabilidad de auditoría.
- **Decisiones técnicas:** validación de exactamente dos asientos por transferencia completada; conciliación de importes, signos y cuentas; prohibición de modificaciones de registros protegidos; restricciones de permisos para el rol de aplicación.
- **Verificaciones:** PostgreSQL 16 operativo; migración aplicada correctamente en desarrollo y pruebas; ejecuciones posteriores sin migraciones pendientes.
- **Pruebas:** 23 pruebas de integración aprobadas, 0 fallidas, incluidas 8 pruebas nuevas de T-06.
- **Validaciones:** ESLint y TypeScript sin errores.
- **Alcance pendiente:** servicios de transferencias, concurrencia, idempotencia y reglas operativas en tareas posteriores.
- **Estado:** implementación y pruebas verificadas.

## T-07 — Contratos TypeScript compartidos desde OpenAPI

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** establecer contratos TypeScript compartidos entre API, web y móvil a partir del OpenAPI 3.1 aprobado.
- **Implementación:** generación automatizada mediante `openapi-typescript`, integración de `openapi-fetch`, exportaciones desde `@treo/shared` y verificaciones de sincronización del contrato.
- **Decisiones técnicas:** mantener `specs/openapi.json` como fuente única de verdad; versionar los tipos generados y evitar definiciones manuales duplicadas.
- **Problema detectado:** la configuración de TypeScript de los workspaces móvil y compartido no incluía los tipos estándar de Fetch requeridos por `openapi-fetch`.
- **Corrección:** incorporación de las bibliotecas `ES2022`, `DOM` y `DOM.Iterable` en los respectivos archivos `tsconfig.json`, sin modificar la configuración global del backend.
- **Verificaciones:** `check:types`, `test:types`, ESLint y TypeScript satisfactorios en los cuatro workspaces.
- **Regresión:** 23 pruebas de integración de PostgreSQL aprobadas, 0 fallidas.
- **Estado:** implementación validada.

## T-08 — Infraestructura HTTP de API

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** implementar la infraestructura HTTP modular de Treo Wallet mediante Express y TypeScript.
- **Implementación:** aplicación Express, middleware de identificación de solicitudes, validación Zod, respuestas RFC 7807, logger JSON, configuración CORS, health check y documentación Swagger UI desde OpenAPI.
- **Seguridad:** sanitización de errores internos y prevención de exposición de secretos, tokens, CLABE y cuerpos sensibles en los logs verificados.
- **Problemas detectados:** dos errores de ESLint por parámetros e importaciones no utilizados.
- **Corrección:** delegación de errores mediante `next(error)` cuando los headers ya fueron enviados y eliminación de una importación innecesaria en las pruebas.
- **Verificaciones:** ESLint y TypeScript correctos; 10 pruebas HTTP y 23 pruebas de integración PostgreSQL aprobadas; contrato OpenAPI sincronizado.
- **Alcance pendiente:** registro, autenticación JWT y protección efectiva de recursos en T-09.
- **Estado:** pruebas automatizadas aprobadas.

## T-09 — Registro y autenticación JWT

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** implementar registro de usuarios y autenticación con JWT conforme a RF-01 y RF-02.
- **Implementación:** endpoints de registro y login, validación Zod, servicio de autenticación, persistencia mediante TypeORM y PostgreSQL, contraseñas Argon2id y emisión de JWT.
- **Decisiones técnicas:** correo canónico único, creación transaccional de usuario y cuenta demo con saldo cero, JWT de acceso de 15 minutos, refresh inicial almacenado únicamente como hash, cookie HttpOnly para web y respuesta diferenciada para móvil.
- **Seguridad:** respuestas genéricas ante credenciales incorrectas, control de intentos de login, validación de firma y expiración JWT, y exclusión de credenciales de las respuestas.
- **Verificaciones:** ESLint, TypeScript y sincronización OpenAPI satisfactorios.
- **Pruebas:** 9 pruebas nuevas de autenticación aprobadas, además de 10 pruebas HTTP y 23 pruebas PostgreSQL anteriores; 42 pruebas aprobadas en total, sin fallos.
- **Alcance pendiente:** rotación, revocación y detección de reutilización de refresh tokens en T-10; consulta de cuentas en T-11.
- **Estado:** implementación y pruebas verificadas.

## T-10 — Refresh rotativo y logout

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** implementar renovación segura de sesiones, revocación de refresh tokens y cierre de sesión conforme a RF-02.
- **Implementación:** endpoints `/auth/refresh` y `/auth/logout`, rotación transaccional de tokens, detección de reutilización, revocación por familia y controles de origen para clientes web.
- **Decisiones técnicas:** bloqueos de filas en PostgreSQL para serializar renovaciones concurrentes; persistencia exclusiva de hashes de refresh; separación de sesiones independientes; cookies HttpOnly para web y tokens opacos para móvil.
- **Problema detectado:** la implementación inicial interpretaba incorrectamente la estructura devuelta por `QueryRunner.query()` al ejecutar un `UPDATE ... RETURNING`. Esto provocaba un conflicto de rotación y respuestas HTTP 500.
- **Corrección:** interpretación explícita de las filas actualizadas y validación del identificador esperado, conservando el bloqueo y la transacción.
- **Validación:** se ejecutó un diagnóstico temporal para aislar el error, se corrigió la implementación y se eliminaron los archivos de diagnóstico.
- **Pruebas:** 19 pruebas de autenticación, 10 HTTP y 23 de PostgreSQL aprobadas; 52 en total, sin fallos.
- **Verificaciones adicionales:** ESLint, TypeScript y sincronización OpenAPI satisfactorios.
- **Estado:** implementación verificada.

## T-11 — Consulta de cuentas propias

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** implementar la consulta autenticada de cuentas y saldos conforme a RF-03.
- **Implementación:** endpoint `GET /api/v1/accounts`, rutas Express protegidas mediante JWT y servicio de consulta con TypeORM y PostgreSQL.
- **Decisiones técnicas:** obtener el propietario exclusivamente del JWT verificado, filtrar las cuentas por `user_id`, enmascarar la CLABE y serializar saldos `BIGINT` como cadenas para evitar pérdida de precisión.
- **Casos verificados:** usuario con una cuenta, usuario sin cuentas, múltiples cuentas, saldos elevados, cuentas bloqueadas, aislamiento entre propietarios, saldos actualizados y rechazo de credenciales inválidas.
- **Verificaciones:** ESLint y TypeScript sin errores; contrato OpenAPI sincronizado.
- **Pruebas:** 6 pruebas nuevas de T-11, 19 de autenticación, 10 HTTP y 23 de PostgreSQL aprobadas; 58 pruebas en total, 0 fallidas.
- **Alcance pendiente:** gestión de beneficiarios en T-12 y operaciones financieras en tareas posteriores.
- **Estado:** implementación verificada.

## T-12 — Validación CLABE y gestión de beneficiarios

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** implementar el registro y consulta de beneficiarios conforme a RF-04 y RF-05.
- **Implementación:** endpoints `GET /api/v1/beneficiaries` y `POST /api/v1/beneficiaries`, validación mediante Zod, cálculo del dígito verificador CLABE y persistencia mediante TypeORM.
- **Decisiones técnicas:** validación de 18 dígitos y checksum, unicidad de CLABE por propietario, obtención del usuario desde JWT, enmascaramiento de CLABE y determinación del atributo `isInternal` mediante consulta de cuentas internas.
- **Seguridad:** aislamiento entre usuarios, validación de credenciales y rechazo de entradas inválidas sin exposición de información sensible.
- **Verificaciones:** ESLint, TypeScript y sincronización OpenAPI satisfactorios.
- **Pruebas:** 12 pruebas nuevas de T-12 aprobadas, incluidas 5 unitarias y 7 de integración. Las 58 pruebas anteriores también pasaron; 70 en total, sin fallos.
- **Alcance pendiente:** validación del destino y ejecución de transferencias dentro del núcleo financiero.
- **Estado:** implementación verificada.

## 2026-10-22 — T-13: dinero exacto y validación de instrucciones

- **Herramienta:** Codex.
- **Objetivo y autorización:** completar exclusivamente T-13 (RF-06, RF-07, RF-08 y RF-14; preparación para RNF-05), respetando el contrato aprobado y la prohibición de ejecutar Git, npm, compilación, lint, typecheck, migraciones o pruebas. No avanzar a T-14.
- **Estado encontrado:** ya existían el parser decimal a centavos `bigint`, serialización exacta, esquema Zod estricto, resolución de cuentas/beneficiarios con TypeORM y suites de dinero, esquemas e integración. Se revisaron contra las especificaciones y se conservaron. El script unitario existente referenciaba una suite de validación que faltaba.
- **Archivos y cambios:** [money.ts](../api/src/modules/transfers/money.ts) incorpora conversión inversa exacta a MXN; [validation.ts](../api/src/modules/transfers/validation.ts) extrae la comprobación pura y reutilizable de cuentas activas, MXN e identidad distinta; [money.test.ts](../api/src/modules/transfers/tests/money.test.ts) agrega casos de conversión inversa; se crea [validation.test.ts](../api/src/modules/transfers/tests/validation.test.ts); [t13.integration.test.ts](../api/src/modules/transfers/tests/t13.integration.test.ts) exige explícitamente `treo_test` antes de conectarse. Sin dependencias, migraciones ni cambios al contrato.
- **Decisiones financieras y de seguridad:** importes positivos hasta `9223372036854775807` centavos, sin redondeo; formato inverso mediante división y módulo `bigint`, conservando JSON monetario en cadenas de centavos. Propiedad filtrada por identidad autenticada, rechazo indistinguible de recursos ajenos/inexistentes y resolución interna por CLABE. Validar no mueve dinero ni garantiza fondos/cupo: T-15 debe repetir las comprobaciones bajo bloqueo dentro de su transacción. No se atribuye cobertura completa de RF-08 o RNF-05 a esta tarea.
- **Alternativas inseguras descartadas como criterio de implementación:** convertir dinero a `number`/`parseFloat` pierde precisión; confiar en `userId` o `isInternal` del cliente permite eludir autorización; desactivar el CHECK de moneda para probar divisas inválidas debilita integridad. Ese caso se cubre unitariamente sin alterar PostgreSQL. No hubo propuestas inseguras adicionales ni correcciones del desarrollador durante esta interacción.
- **Pruebas agregadas:** ocho casos unitarios para conversión inversa y límites signed BIGINT, misma cuenta con UUID en mayúsculas, estado/moneda de ambos extremos, contexto autenticado inválido, entrada inválida sin acceso a repositorios y propagación de fallos técnicos sin convertirlos en rechazo de negocio. Se preservan las pruebas existentes de formatos, Zod y propiedad/existencia en PostgreSQL, con fixtures temporales a saldo cero, rollback y comprobación de ausencia de escrituras financieras durante la validación.
- **Corrección concreta:** creada la suite ausente que ya invocaba `test:transfers:unit`. La revisión inicial de Codex fue estática, sin resultados de ejecución disponibles en ese momento ni fallos de pruebas fabricados.
- **Origen de la evidencia:** comandos ejecutados manualmente por el desarrollador y resultados confirmados por él; Codex no los ejecutó.
- **Verificaciones confirmadas:** `npm run lint -w @treo/api`, `npm run typecheck -w @treo/api`, `npm run check:types`, `npm run lint` y `npm run typecheck`: correctos. `npm run test:transfers:unit -w @treo/api`: **26/26**; `npm run test:transfers:integration -w @treo/api`: **10/10**.
- **Regresiones confirmadas:** beneficiarios **12/12**, cuentas **6/6**, autenticación **19/19**, HTTP **10/10** y PostgreSQL **23/23**. Total acumulado: **106 pruebas aprobadas, 0 fallidas**.
- **Cierre:** verificaciones satisfactorias según la evidencia comunicada por el desarrollador.

## 2026-10-22 — T-14: intención e idempotencia persistente

- **Herramienta:** ChatGPT (GPT-6); implementación asistida mediante revisión humana y ejecución manual de comandos.
- **Objetivo:** evitar que los reintentos de una instrucción financiera creen intenciones duplicadas (RF-13 y RF-06).
- **Implementación:** canonicalización de instrucciones, huella SHA-256, persistencia en PostgreSQL mediante `INSERT ... ON CONFLICT DO NOTHING`, unicidad por `(sender_user_id, idempotency_key)` y recuperación del estado registrado. Una misma llave con otro contenido se rechaza con `409 IDEMPOTENCY_CONFLICT`.
- **Decisiones:** importes exactos y referencias preservadas en el hash; aislamiento por usuario, control de concurrencia y rollback ante error. No se realizan movimientos de dinero en esta tarea.
- **Evidencia manual:** ESLint, TypeScript y `check:types` aprobados; 9 pruebas unitarias y 7 de integración de T-14 aprobadas; 106 pruebas anteriores de regresión aprobadas; **122/122 pruebas acumuladas**, sin fallos.
- **Trazabilidad Git:** `3a39e7d` (implementación); `fd01362` (integración en `main`).

## 2026-10-22 — T-15: transferencias atómicas sin OTP

- **Herramienta:** ChatGPT (GPT-6), con incorporación, correcciones y verificaciones manuales por el desarrollador.
- **Objetivo:** ejecutar transferencias internas exactas y atómicas, reutilizando las validaciones de T-13 y la idempotencia de T-14 (RF-06, RF-07, RF-09 y RF-14).
- **Implementación:** `POST /api/v1/transfers`; transacción PostgreSQL única con bloqueo `FOR UPDATE` de remitente y cuentas en orden determinista, revalidación bajo bloqueo, débito/crédito en centavos `BIGINT`, dos entradas de ledger, límite diario según calendario `America/Mexico_City` y auditoría sanitizada. Replays no vuelven a contabilizar.
- **Decisiones:** saldo o cupo insuficiente generan rechazo sin efectos contables; fallos técnicos revierten la transacción. Antes de T-16, importes superiores a $5,000 MXN no se debitaban sin OTP.
- **Correcciones verificadas:** adaptación de imports y firmas a la versión efectiva de T-13; conversión monetaria mediante `parseMxnToCents`; tipado explícito `::text` de parámetros en `jsonb_build_object` para resolver un error SQL `42P18`.
- **Evidencia manual:** 9 pruebas de integración T-15 aprobadas; ESLint, TypeScript y `check:types` aprobados. Las regresiones completas anteriores no cuentan con salida adjunta en esta entrada, por lo que no se certifica aquí el total acumulado.
- **Trazabilidad Git:** `d82d52b` (implementación); `aa9334c` (integración en `main`).

## 2026-10-22 — T-16: confirmación de transferencias mediante OTP

- **Herramienta:** ChatGPT (GPT-6), con ejecución y revisión manual del desarrollador.
- **Objetivo:** confirmar transferencias superiores a $5,000 MXN mediante desafío OTP simulado y aplicar la contabilidad únicamente tras una confirmación válida (RF-09, RF-10 y RF-13).
- **Implementación:** estado `PENDING_CONFIRMATION` sin afectar saldos ni cupo; desafío vinculado a la transferencia mediante HMAC; vencimiento de cinco minutos y máximo tres errores; confirmación autorizada, rechazo por expiración y reutilización del motor atómico de T-15. OTP fijo limitado a entorno local/pruebas, expresamente deshabilitado en producción.
- **Decisión:** contabilizar después de validar OTP y revalidar condiciones financieras; conservar estados e idempotencia para evitar repeticiones del débito.
- **Corrección verificada:** eliminación de tres comprobaciones de rama `outcome === 'ERROR'` redundantes en pruebas de integración, responsables de cuatro errores `TS2367`; no se modificó el comportamiento del servicio.
- **Evidencia manual:** 2 pruebas unitarias T-16, 6 pruebas de integración T-16 y 9 pruebas de regresión T-15 aprobadas, sin fallos; ESLint, TypeScript y `check:types` aprobados.
- **Cobertura pendiente:** no consta evidencia específica de confirmaciones paralelas ni de contabilización cerca de medianoche en Ciudad de México; ampliar en T-19 antes de declarar cobertura financiera completa.
- **Trazabilidad Git:** `208691d` (implementación); `3f46275` (integración en `main`).

## T-18 — Historial de movimientos con cursor

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** implementar la consulta autenticada del historial financiero conforme a RF-11 y RNF-06.
- **Implementación:** endpoint `GET /api/v1/movements`, consulta de asientos contables con filtros por cuenta, tipo y fechas del calendario `America/Mexico_City`.
- **Decisiones técnicas:** paginación basada en `(created_at DESC, id DESC)`, sin `OFFSET`; cursor opaco protegido mediante HMAC y vinculado al usuario y filtros. Se preserva la precisión temporal de PostgreSQL.
- **Seguridad:** validación de propiedad de cuentas, rechazo de cursores manipulados y prevención de acceso a movimientos ajenos. Operaciones exclusivamente de lectura.
- **Pruebas:** 3 unitarias y 5 de integración aprobadas. Se verificaron paginación sin duplicados, aplicación de filtros, incorporación de movimientos entre páginas y controles de autorización.
- **Verificaciones:** ESLint, TypeScript y sincronización OpenAPI aprobados mediante ejecución manual.
- **Regresión completa:** pendiente de registrar el resultado final.
- **Limitaciones:** medición de rendimiento con 100,000 movimientos y análisis de índices pendientes de T-20.
- **Estado:** pruebas específicas aprobadas.

## T-17 — Estado de transferencias y comprobantes

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** implementar la consulta autenticada de estados y comprobantes conforme a RF-12 y RF-13.
- **Implementación:** endpoint `GET /api/v1/transfers/:transferId` con recuperación del estado persistido, fecha de contabilización, importe exacto, referencia y destino enmascarado.
- **Decisiones técnicas:** respuesta conforme a OpenAPI, sin campos adicionales; comprobante final exclusivamente para operaciones `COMPLETED`. Los estados `PENDING_CONFIRMATION` y `REJECTED` no generan comprobantes de éxito.
- **Seguridad:** consultas restringidas al usuario autenticado. Las transferencias inexistentes y ajenas devuelven 404 sin revelar información.
- **Pruebas:** 5 pruebas de integración aprobadas, 0 fallidas. Se verificaron estados, enmascaramiento, autorización y errores HTTP RFC 7807.
- **Verificaciones:** ESLint, TypeScript en todos los workspaces y comprobación OpenAPI aprobados manualmente.
- **Regresión acumulada:** pendiente de incorporar el resultado verificado.
- **Revisión humana:** ejecución de pruebas y control de commits por el desarrollador.
- **Estado:** implementación verificada en pruebas específicas; regresión y cierre de Git pendientes.

## T-19 — Integridad financiera y concurrencia

- **Herramienta:** ChatGPT (GPT-6).
- **Objetivo:** verificar la integridad financiera bajo concurrencia real conforme a RF-06, RF-09, RF-13, RF-14 y RNF-07.
- **Implementación:** suite de integración PostgreSQL con escenarios de concurrencia, idempotencia, saldo insuficiente, límite diario, transferencias cruzadas, OTP, auditoría y rollback.
- **Problema detectado:** el escenario de transferencias cruzadas falló inicialmente con 59 operaciones rechazadas. Se identificó como causa probable una interacción entre bloqueos de claves foráneas y bloqueos explícitos `FOR UPDATE`.
- **Corrección:** reorganización de la adquisición de bloqueos en el servicio financiero, antes de insertar la intención de transferencia. Se conservaron las restricciones de integridad existentes.
- **Validación de la corrección:** repetición de la suite de estrés con cinco escenarios aprobados y ninguna prueba fallida.
- **Evidencia de concurrencia:** 452 solicitudes distribuidas entre competición por saldo, idempotencia, límite diario, transferencias cruzadas y confirmación OTP.
- **Resultados:** 60 transferencias completadas y 60 rechazadas por saldo; un único movimiento para 120 reintentos; 100 operaciones completadas y 20 rechazadas por límite; 60 transferencias cruzadas completadas; una sola contabilización para 32 confirmaciones OTP.
- **Pruebas:** 6 pruebas de integridad y 5 pruebas de estrés aprobadas, 0 fallidas.
- **Verificaciones:** ESLint, TypeScript y sincronización OpenAPI satisfactorios.
- **Seguridad de pruebas:** las operaciones de estrés generaron movimientos sintéticos persistentes en `treo_test`; se conservaron las protecciones de inmutabilidad del ledger.
- **Limitación:** el escenario inicial es compatible con un problema de bloqueos, pero no se conservó el código SQLSTATE individual para certificar la causa exacta. Tampoco se simuló una confirmación OTP atravesando medianoche con el reloj de PostgreSQL.
- **Regresión general:** pendiente de incorporar el resultado final.
- **Revisión humana:** pruebas ejecutadas y cambios controlados manualmente por el desarrollador.

## T-21 — Aplicación React y autenticación web

- **Herramienta:** ChatGPT (GPT-6).
- **Alcance:** RF-01, RF-02 y RNF-08.
- **Implementación:** aplicación React, Vite, TypeScript, React Router y TanStack Query; registro, login, logout, rutas protegidas y recuperación de sesión.
- **Seguridad:** access token en memoria, refresh mediante cookie HttpOnly, cliente API centralizado y validación con Zod.
- **Verificaciones:** `npm run lint`, `npm run typecheck`, `npm run check:types` y `npm run build -w @treo/web` completados correctamente.
- **Pruebas:** Vitest y Testing Library, 5 pruebas aprobadas, 0 fallidas.
- **Compilación:** Vite 8.3.5, 168 módulos transformados.
- **Validación manual con API real:** registrar resultado después de probar registro, login, recarga y logout en navegador.
- **Revisión humana:** ejecución manual de verificaciones y revisión de cambios antes del commit.

## T-22 — Dashboard de cuentas y beneficiarios

- **Herramienta:** ChatGPT (GPT-6).
- **Cobertura:** RF-03, RF-04, RF-05 y RNF-08.
- **Implementación:** dashboard de cuentas propias, visualización de saldos MXN, consulta y registro de beneficiarios, validación de CLABE y manejo de errores de API.
- **Integración:** reutilización de la sesión autenticada y TanStack Query; actualización de datos tras operaciones exitosas.
- **Corrección durante pruebas:** se actualizó el test de login de T-21 para contemplar la carga del dashboard introducida en T-22, incluyendo una respuesta simulada de cuentas y verificación del bearer token.
- **Incidencia de integración:** se identificó un HTTP 403 en logout causado por la discrepancia entre `localhost:5173` y `127.0.0.1:5173`. Se corrigió alineando la variable `WEB_ORIGIN`, sin deshabilitar la validación de origen.
- **Pruebas automatizadas:** 11 aprobadas, 0 fallidas, distribuidas en 5 archivos.
- **Verificaciones:** ESLint, TypeScript y `git diff --check` correctos.
- **Pendiente para cierre:** documentar resultado de OpenAPI, build de producción y validación manual de cuentas y beneficiarios.

## T-23 — Transferencias web: revisión, confirmación OTP y comprobante

- **Herramienta:** ChatGPT (GPT-6).
- **Cobertura:** RF-06/07/08/09/10/12/13 y RNF-08.
- **Fuentes:** contratos OpenAPI y código del backend T-15/16/17; frontend base T-21/T-22. Sin cambios al backend ni a migraciones.
- **Implementación:** rutas autenticadas para captura, revisión, OTP y estado; formulario de cuentas propias y beneficiario interno; importe decimal exacto, concepto y referencia con ceros iniciales; manejo de errores Problem Details.
- **Idempotencia:** UUID único por intención creada en el formulario; bloqueo inmediato de doble clic y conservación de la llave durante reintentos tras resultado incierto.
- **Integridad de UI:** comprobante únicamente para estado `COMPLETED` reportado por backend; `PENDING_CONFIRMATION`, `PROCESSING` y `REJECTED` sin comprobante; saldos invalidados tras éxito, sin cálculo optimista.
- **Privacidad y sesión:** la intención no se persiste en almacenamiento local y se descarta al cambiar de identidad; los tokens permanecen administrados por T-21.
- **Pruebas preparadas:** cuatro casos unitarios para dinero/validación y ocho de componentes para doble clic, errores, recuperación, beneficiarios y OTP. Las pruebas y verificaciones de esta entrada deben completarse con resultados reales antes del commit.
- **Validación de sintaxis:** transpilación TS/TSX satisfactoria. **Pendiente:** lint, typecheck, check:types, Vite build, Vitest, recorrido manual con API real y confirmación Git.
- **Limitaciones:** entorno OTP local de demostración, no segundo factor productivo. Ante una intención sin ID y respuesta de red incierta, solo puede recuperarse mediante replay de la misma llave; el backend no expone consulta por llave.

## T-24 — Historial web, filtros y paginación por cursor

- **Herramienta:** ChatGPT (GPT-6).
- **Cobertura:** RF-11, CA-RF11-01…06, RNF-08.
- **Implementación:** ruta protegida `/movements`; consulta autenticada `GET /api/v1/movements` con filtros `accountId`, `type`, `from`, `to` y paginación por `nextCursor`, `limit=20`; acceso al detalle de transferencia desde cada movimiento.
- **Integridad:** cursor proporcionado por el servidor sin manipular; los cambios de filtro reinician la paginación; se impide aplicar rangos de fechas invertidos o inválidos. Las fechas se presentan en `America/Mexico_City`.
- **Precisión:** importe firmado mostrado desde centavos enteros usando `BigInt`, sin float en operaciones monetarias.
- **Estados de interfaz:** carga, lista vacía, error recuperable, página anterior y siguiente; filtros y navegación por teclado.
- **Seguridad:** consulta ligada a la sesión autenticada; cuentas y CLABEs solo enmascaradas; el backend mantiene el control de propiedad y el cursor HMAC.
- **Pruebas automatizadas previstas:** 11 pruebas nuevas aprobadas; regresión web completa de 34/34.
- **Validación manual de navegador y API:** Build Vite 8.3.5 exitoso, 180 módulos transformados.
- **Verificaciones de lint, TypeScript, OpenAPI y build:** ESLint, TypeScript y OpenAPI correctos.
- **Revisión humana:** Validación manual: registra únicamente los escenarios que efectivamente comprobe.

## T-25 — Pruebas integradas y accesibilidad web

- **Herramienta:** ChatGPT (GPT-6).
- **Cobertura:** RF-03, RF-06, RF-08, RF-10, RF-11, RF-12, RF-13 y RNF-08.
- **Implementación:** suite de integración React Testing Library y mejoras de accesibilidad en los formularios de transferencia, revisión y confirmación OTP.
- **Escenarios:** saldo insuficiente HTTP 422, revisión previa, doble clic, idempotencia, recuperación de errores de red, OTP, transferencia rechazada, comprobante, actualización de saldos e historial y navegación por teclado.
- **Accesibilidad:** mejoras de foco, asociación de errores con sus campos y estados accesibles. Cobertura automatizada sin sustituir una auditoría completa de accesibilidad.
- **Incidencia corregida:** eliminación de una importación no utilizada (`waitFor`) detectada por ESLint.
- **Resultados:** 9 pruebas nuevas aprobadas; regresión completa de 43 pruebas aprobadas en 10 archivos, sin fallos.
- **Verificaciones:** ESLint, TypeScript, OpenAPI y build Vite 8.3.5 satisfactorios; 180 módulos transformados.
- **Revisión humana:** pruebas y verificaciones ejecutadas manualmente antes de integrar los cambios.

## T-26 — Configuración de Expo y autenticación móvil segura

**Fecha:** 23 de octubre de 2026  
**Herramienta de IA:** ChatGPT (GPT-6)  
**Cobertura:** RF-02, RNF-09  
**Estado:** Implementación y verificaciones automatizadas completadas.

### Objetivo

Incorporar una aplicación móvil con Expo, React Native y TypeScript al monorepositorio existente, reutilizando la API de autenticación y estableciendo un mecanismo de almacenamiento seguro de credenciales.

### Implementación

- Se configuró Expo SDK 57 dentro del workspace `@treo/mobile`, conservando la estructura del monorepositorio.
- Se incorporó navegación nativa entre las pantallas de autenticación y la pantalla principal.
- Se implementó un cliente HTTP para consumir los endpoints existentes de autenticación.
- Se integraron las operaciones de inicio de sesión, renovación de sesión y cierre de sesión mediante el cliente `MOBILE`.
- Se utilizó `expo-secure-store` para almacenar el refresh token; el access token permanece exclusivamente en memoria.
- Se implementó la renovación rotativa del refresh token, la recuperación de sesión, el manejo de credenciales revocadas y el tratamiento de errores de red.
- Se incorporaron pruebas automatizadas para los principales escenarios del controlador de autenticación.

### Incidencias y resolución

**Configuración del simulador iOS:** se utilizó Xcode y el simulador iPhone 17 para ejecutar la aplicación. Durante la configuración inicial se presentó un error de tiempo de espera al intentar abrir Expo en otro simulador. Posteriormente, la aplicación pudo ejecutarse correctamente en iPhone 17.

**Duplicación de dependencias:** Expo Doctor identificó versiones duplicadas de React (19.2.3 y 19.3.1) y React Native (0.86.3 y 0.88.0) debido a la resolución de dependencias del monorepositorio.

Se corrigió la configuración de dependencias, unificando React 19.2.3 y React Native 0.86.3, ajustando las declaraciones de los workspaces y utilizando una configuración de `overrides` en el paquete raíz. Tras reinstalar y deduplicar dependencias, Expo Doctor aprobó sus 21 verificaciones.

### Validación y resultados

- **Aplicación móvil:** ejecución funcional en el simulador iPhone 17.
- **Pruebas manuales:** inicio y cierre de sesión correctos contra la API existente.
- **Pruebas móviles:** 7/7 aprobadas.
- **Pruebas web de regresión:** 43/43 aprobadas.
- **Expo Doctor:** 21/21 verificaciones aprobadas.
- **Expo Install Check:** dependencias compatibles con SDK 57.
- **ESLint:** aprobado sin advertencias.
- **TypeScript:** verificación satisfactoria en todos los workspaces.
- **Contratos OpenAPI:** generación y comprobación de tipos correctas.
- **Compilación web:** Vite ejecutado correctamente, con 180 módulos transformados.

### Uso y revisión de IA

La IA se utilizó para estructurar la implementación móvil, definir los flujos de autenticación, proponer pruebas y diagnosticar problemas de dependencias. Las propuestas se contrastaron mediante comandos ejecutados localmente y resultados verificables.

La revisión humana incluyó la ejecución de pruebas automatizadas, verificación de tipos, análisis de dependencias y validación funcional en el simulador iOS.

### Observaciones y pendientes

- La recuperación automática de sesión tras reiniciar completamente la aplicación cuenta con prueba automatizada; su verificación manual independiente no se ha documentado.
- La ejecución se realizó en un entorno local de desarrollo mediante Expo Go; no se generó una compilación de distribución.
- El análisis de npm reportó seis vulnerabilidades en dependencias (dos moderadas y cuatro altas), pendientes de evaluación.
- Se observaron advertencias sobre scripts de instalación bloqueados por npm, pendientes de revisión.
- Queda pendiente el cierre del entregable mediante commit y merge a la rama principal.

**Resultado:** autenticación móvil funcional, dependencias compatibles con Expo SDK 57 y pruebas automatizadas aprobadas, sin regresiones detectadas en el cliente web.

## T-27 — Cuentas, movimientos y beneficiarios móviles

**Fecha:** 23 de octubre de 2026  
**Herramienta:** ChatGPT (GPT-6)  
**Cobertura:** RF-03, RF-04, RF-05 y RF-11  
**Estado:** Implementación funcional y validación móvil completadas.

### Objetivo

Incorporar las primeras funcionalidades financieras de consulta a la aplicación React Native, reutilizando los servicios backend y la autenticación segura implementados anteriormente.

### Implementación

- Consulta de cuentas propias y visualización de saldos en MXN.
- Representación monetaria exacta a partir de cantidades expresadas en centavos, evitando errores de precisión de punto flotante.
- Consulta y presentación de los últimos 20 movimientos financieros.
- Consulta y selección de beneficiarios previamente registrados.
- Protección de información financiera mediante CLABE enmascarada.
- Estados de carga, listas vacías, errores y reintentos.
- Reutilización de la sesión móvil y renovación del access token ante respuestas HTTP 401.

### Uso de inteligencia artificial

Se utilizó IA para estructurar los componentes móviles, integrar los contratos OpenAPI existentes, implementar la lógica de consulta y diseñar pruebas unitarias de los escenarios funcionales y de error.

Las propuestas generadas fueron sometidas a revisión y ejecución local. La IA no sustituyó la comprobación manual de la aplicación.

### Validación

- 19/19 pruebas móviles aprobadas, incluyendo las 7 pruebas previas de T-26 y 12 nuevas de T-27.
- ESLint sin errores ni advertencias.
- TypeScript aprobado en todos los workspaces.
- Contratos OpenAPI verificados.
- Ejecución funcional en simulador iPhone 17.
- Comprobación manual satisfactoria de cuentas, saldos, movimientos, beneficiarios y funcionamiento general de la aplicación.

### Resultado

T-27 implementado y validado funcionalmente. La aplicación móvil incorpora consultas financieras autenticadas sobre los endpoints existentes, sin introducir modificaciones en la lógica transaccional del backend.

**Pendiente al momento de esta entrada:** completar la regresión web, ejecutar Expo Doctor y confirmar la integración en la rama principal.

## T-28 — Transferencias móviles, idempotencia y privacidad

**Fecha:** 23 de octubre de 2026

**Herramienta:** ChatGPT (GPT-6)

**Cobertura:** RF-06, RF-08, RF-10, RF-12, RF-13, RNF-09

**Estado:** Implementación y validación funcional completadas.

### Objetivo

Implementar el flujo de transferencias financieras en React Native, reutilizando la API transaccional, la autenticación móvil y los contratos OpenAPI existentes. Garantizar el tratamiento seguro de operaciones pendientes, confirmadas e inciertas, evitando duplicaciones ante fallos de red.

### Implementación

- Incorporación de una pantalla nativa para seleccionar cuenta de origen, destinatario, importe, concepto y referencia.
- Soporte para transferencias entre cuentas propias y hacia beneficiarios internos autorizados.
- Validación monetaria exacta mediante `bigint`, sin redondeos de punto flotante.
- Revisión explícita de los datos antes de confirmar una transferencia.
- Generación de UUIDv4 mediante `expo-crypto` para identificar cada intención de transferencia.
- Persistencia de la intención y su llave idempotente en `expo-secure-store` antes de transmitir la solicitud.
- Recuperación ante respuestas inciertas y errores de red mediante reutilización de la misma intención o consulta del folio existente.
- Integración del flujo OTP para operaciones que requieren confirmación adicional.
- Presentación de comprobantes únicamente cuando el backend confirma el estado `COMPLETED`.
- Incorporación de una cobertura visual al pasar la aplicación a segundo plano como mitigación de privacidad.

### Incidencias y correcciones

Durante la integración se identificaron dos incompatibilidades menores:

- Una referencia a la regla `react-hooks/exhaustive-deps` no disponible en la configuración actual de ESLint.
- Uso de `StyleSheet.absoluteFillObject`, propiedad no reconocida por los tipos instalados de React Native.

Se corrigieron ambas referencias sin modificar el comportamiento del motor de transferencias. Posteriormente se ejecutaron nuevamente las verificaciones automatizadas, sin detectar regresiones.

### Uso de inteligencia artificial

Se utilizó IA para revisar los contratos API, diseñar el flujo de transferencias, implementar la gestión de estados transaccionales, definir la persistencia idempotente y desarrollar pruebas automatizadas.

La revisión humana incluyó ejecución de pruebas, diagnóstico de errores de integración y validación funcional mediante Xcode y el simulador iPhone 17.

### Validaciones y resultados

- **Pruebas móviles:** 35/35 aprobadas, incluyendo 16 nuevas pruebas de T-28.
- **ESLint:** aprobado sin errores ni advertencias.
- **TypeScript:** comprobación correcta en todos los workspaces.
- **OpenAPI:** contratos y tipos generados verificados.
- **Regresión web y Expo Doctor:** verificaciones finales reportadas como completadas durante la integración.
- **Simulador iPhone 17:** validación funcional reportada como satisfactoria.

La cobertura automatizada incluye doble envío, recuperación tras pérdida de respuesta, persistencia de operaciones durante reinicios, confirmación OTP, recuperación por folio y tratamiento de estados no terminales.

### Consideraciones y limitaciones

La aplicación conserva una intención de transferencia incierta para evitar generar inadvertidamente una operación distinta. Las pérdidas de respuesta posteriores a un commit se verificaron mediante pruebas automatizadas; una desconexión manual no garantiza reproducir exactamente ese escenario.

La cobertura de privacidad mediante `AppState` constituye una mitigación visual y no garantiza la protección nativa frente a capturas o snapshots de iOS.

Las vulnerabilidades de dependencias identificadas previamente mediante npm continúan pendientes de evaluación independiente.

### Resultado

T-28 implementado y validado. La aplicación móvil permite realizar transferencias autenticadas, gestionar confirmaciones OTP y recuperar operaciones inciertas utilizando el motor financiero existente, sin modificaciones en PostgreSQL ni en la API.

El entregable queda preparado para su integración en la rama principal.

## T-29 — Pruebas de seguridad y flujos móviles

**Fecha:** 23 de octubre de 2026

**Herramienta:** ChatGPT (GPT-6)

**Cobertura:** RF-02, RF-03, RF-06, RF-10, RF-12, RF-13 y RNF-09

**Estado:** Implementación y validación completadas.

### Objetivo

Completar la cobertura automatizada y manual de los flujos financieros móviles implementados durante T-26, T-27 y T-28, verificando autenticación, almacenamiento seguro de tokens, confirmación OTP, manejo de rechazos, recuperación ante fallos de red, idempotencia y privacidad de la interfaz.

### Implementación

- Incorporación de seis pruebas adicionales de lógica y seguridad.
- Integración de Jest, `jest-expo` y React Native Testing Library para pruebas de componentes.
- Incorporación de nueve pruebas de interfaz React Native.
- Separación del componente `AppPrivacyCover` para verificar su comportamiento mediante eventos `AppState`.
- Validación del aislamiento de intenciones financieras entre usuarios.
- Comprobación del manejo de sesiones revocadas y credenciales inválidas.
- Verificación de que un OTP rechazado no genere un comprobante exitoso.
- Validación de recuperación ante errores de red sin duplicar solicitudes financieras.
- Incorporación de una matriz manual de doce escenarios en `docs/t29-mobile-manual.md`.
- Conservación de las suites existentes de `node:test`, separadas de las nuevas pruebas Jest.

### Incidencias y resolución

Durante la primera ejecución de las pruebas visuales se identificaron dos fallos en las expectativas de prueba:

1. La validación del botón de revisión de transferencias consultaba `accessibilityState.disabled` desde un elemento incorrecto. Se corrigió utilizando el rol accesible del botón.
2. La prueba de privacidad asumía un estado inicial `active`, mientras que el entorno Jest podía iniciar con `AppState.currentState` desconocido. Se estableció explícitamente el estado inicial para garantizar una ejecución determinista.

Ambas correcciones se realizaron en los archivos de prueba, sin modificar la lógica financiera ni las reglas de seguridad implementadas.

### Uso de inteligencia artificial

Se utilizó IA para analizar los módulos existentes, identificar escenarios críticos, diseñar pruebas automatizadas, configurar la infraestructura Jest y diagnosticar fallos de integración.

Las propuestas fueron verificadas mediante ejecución local. La revisión humana incluyó pruebas de regresión, comprobaciones estáticas y validación funcional en el simulador iPhone 17.

### Validaciones y resultados

- **Pruebas móviles de lógica:** 41/41 aprobadas.
- **Pruebas visuales React Native:** 9/9 aprobadas.
- **Total de pruebas móviles:** 50/50 aprobadas.
- **Regresión web:** reportada satisfactoria, sin regresiones.
- **ESLint:** sin errores ni advertencias.
- **TypeScript:** comprobación correcta en todos los workspaces.
- **OpenAPI:** contratos verificados correctamente.
- **Compilación web:** reportada satisfactoria.
- **Expo Doctor y compatibilidad:** verificaciones reportadas satisfactorias.
- **Validación manual:** funcionamiento reportado correcto en el simulador iPhone 17.

### Consideraciones de seguridad y limitaciones

Las pruebas automatizadas verifican la conservación de llaves idempotentes, el aislamiento de usuarios, la protección de credenciales y la recuperación de operaciones inciertas.

La pérdida de respuesta después de una operación financiera confirmada se comprobó mediante simulación automatizada; no se declara reproducida físicamente sin evidencia específica.

La cobertura de privacidad mediante `AppState` es una mitigación visual. No constituye una garantía de bloqueo de capturas ni snapshots nativos de iOS.

Las vulnerabilidades previamente reportadas por npm requieren una revisión independiente antes de considerar el sistema apto para producción.

### Resultado

T-29 completado y validado. Se incorporó cobertura automatizada adicional para los principales riesgos de autenticación, transferencia y privacidad móvil.

Las tareas T-26 a T-29 proporcionan la implementación funcional y la evidencia de pruebas necesarias para cerrar el Bloque 4 — Clientes web y móvil.

**Hito G3:** validación funcional completada; integración definitiva pendiente de confirmar mediante commit y merge a `main`.

## T-30 — Propuesta de arquitectura y despliegue en AWS

**Fecha:** 23 de octubre de 2026

**Herramienta de IA:** ChatGPT (GPT-6)

**Cobertura:** RNF-11, RF-14

**Estado:** Documento técnico elaborado, revisado y aprobado.

### Objetivo

Diseñar y documentar una arquitectura de despliegue para Treo Wallet en AWS, considerando disponibilidad, integridad financiera, seguridad, observabilidad, escalabilidad, recuperación ante desastres y costos, sin aprovisionar infraestructura real.

### Propuesta arquitectónica

- **Backend:** implementación del monolito modular Node.js/Express en Amazon ECS Fargate, detrás de Application Load Balancer y AWS WAF.
- **Base de datos:** Amazon RDS PostgreSQL Multi-AZ, con respaldos automatizados, recuperación a un punto en el tiempo y acceso restringido mediante red privada.
- **Aplicación web:** distribución de los archivos estáticos de React/Vite mediante Amazon S3 privado y CloudFront con Origin Access Control.
- **Aplicación móvil:** distribución de compilaciones firmadas para iOS y Android, utilizando HTTPS para el consumo de la API.
- **Seguridad:** aislamiento de redes, IAM de privilegio mínimo, gestión centralizada de secretos, cifrado y controles para los componentes financieros.
- **Observabilidad:** métricas, logs, alertas, trazabilidad y separación entre auditoría de negocio y eventos de infraestructura.
- **CI/CD:** propuesta de GitHub Actions con autenticación OIDC y separación de ambientes `dev`, `staging` y `prod`.
- **Escalabilidad:** estrategia de crecimiento gradual, control de conexiones PostgreSQL, evaluación de RDS Proxy y escalamiento horizontal del backend.
- **Infraestructura como código:** selección de Terraform para una futura implementación reproducible.

### Evaluación de alternativas

Se analizaron Amazon App Runner, EKS, Lambda/API Gateway y Aurora PostgreSQL.

Se seleccionó ECS Fargate con RDS PostgreSQL como propuesta inicial para mantener la arquitectura modular existente, reducir complejidad operativa innecesaria y conservar las garantías transaccionales del sistema.

Se documentaron los criterios bajo los cuales otras alternativas podrían evaluarse posteriormente, considerando crecimiento, necesidades operativas y resultados de pruebas de rendimiento.

### Uso de inteligencia artificial

La IA se utilizó para analizar los requisitos originales, contrastar alternativas de infraestructura, estructurar las decisiones técnicas, identificar riesgos y elaborar el documento de arquitectura.

La revisión humana comprendió el análisis de la propuesta, su coherencia con el sistema implementado y la aprobación de las decisiones arquitectónicas.

### Evidencia y validación

- Documento generado: `docs/aws-deploy.md`.
- Diagrama de arquitectura definido mediante Mermaid.
- Justificación de servicios, alternativas y decisiones tecnológicas.
- Estrategias documentadas de seguridad, disponibilidad, respaldos, recuperación, observabilidad y crecimiento.
- Propuesta revisada y aprobada conceptualmente.
- No se realizaron despliegues, pruebas de carga ni simulacros de recuperación en AWS.

### Limitaciones

Los objetivos RPO/RTO, políticas de retención y estrategias de recuperación constituyen propuestas sujetas a validación posterior, no garantías operativas demostradas.

El documento no constituye una certificación de cumplimiento regulatorio ni acredita una infraestructura productiva implementada.

### Resultado

T-30 completado a nivel documental. Se estableció una propuesta de despliegue AWS alineada con el monolito modular, la integridad financiera de PostgreSQL y los clientes web y móvil existentes.

La implementación de integración continua corresponde a T-31 y la preparación de la entrega final a T-32.

## T-31 — Integración continua en GitHub Actions

**Fecha:** 23 de octubre de 2026

**Herramienta de IA:** ChatGPT (GPT-6)

**Cobertura:** RNF-07, RNF-08, RNF-09 y RNF-12; trazabilidad con RF-14.

**Estado:** Workflow implementado y validado en la rama `ci/t-31-github-actions`; verificación posterior al merge en `main` pendiente.

### Objetivo

Automatizar la validación reproducible de API, web y móvil, con una base PostgreSQL 16 efímera para las pruebas de integración y sin credenciales o despliegues de AWS.

### Implementación

- Se incorporó `.github/workflows/ci.yml` con tres jobs independientes para API, web y móvil, activados por `push`, `pull_request` hacia `main` y ejecución manual.
- Se utilizaron runners Ubuntu 24.04, Node.js 24.19.0, npm 12.0.2 y `npm ci`, con permisos mínimos `contents: read` y checkout sin credenciales persistentes.
- El job API inicializa roles y bases PostgreSQL 16, aplica migraciones TypeORM sobre `treo_test` y ejecuta lint, TypeScript, OpenAPI y 17 suites API.
- El job web ejecuta Vitest y la compilación Vite.
- El job móvil ejecuta pruebas de lógica y componentes React Native/Jest, además de verificar la compatibilidad del SDK de Expo.
- Se añadieron `scripts/ci-run-api-tests.mjs`, `scripts/configure-t31.mjs` y `docs/ci.md`; la política npm 12 autoriza de manera específica los scripts requeridos por `argon2` y `esbuild`.
- El estrés persistente de T-19 y el seed masivo de T-20 se excluyeron deliberadamente del CI ordinario.

### Incidencias y resolución

- Una prueba visual móvil permanecía en el estado de recuperación de transferencias en el runner. Se ajustó su espera asíncrona para aguardar el formulario, sin modificar el flujo financiero de producción.
- La prueba CORS T-08 esperaba `http://localhost:5173`, mientras el workflow utilizaba `http://127.0.0.1:5173`. Se alineó `WEB_ORIGIN` en CI con la expectativa del test, sin relajar la validación CORS.

### Uso de inteligencia artificial y revisión

Se utilizó IA para diseñar el workflow, comparar los scripts existentes, configurar el aislamiento de pruebas, revisar el principio de privilegio mínimo y diagnosticar las fallas de integración.

El desarrollador ejecutó las validaciones locales, revisó los resultados del runner y confirmó los tres jobs verdes en GitHub Actions.

### Evidencia y validación

- **API:** 17/17 suites aprobadas localmente, incluyendo pruebas con PostgreSQL, ledger, atomicidad, auditoría, OTP e idempotencia.
- **Web:** 43/43 pruebas y compilación Vite aprobadas localmente.
- **Móvil:** 41/41 pruebas de lógica y 9/9 de interfaz aprobadas localmente.
- **Controles estáticos:** ESLint, TypeScript y contratos OpenAPI aprobados localmente.
- **GitHub Actions:** tres jobs reportados en verde en `ci/t-31-github-actions`, tras aplicar las correcciones anteriores.
- **AWS:** no se crearon recursos, no se configuró OIDC hacia AWS y no se ejecutó despliegue continuo.

### Limitaciones y pendientes

La aprobación del workflow en la rama de trabajo no sustituye una ejecución verde en `main`. Se deberá registrar el SHA y enlace del run definitivo una vez efectuado el merge.

La revisión de vulnerabilidades npm y el despliegue productivo permanecen fuera del alcance de T-31.

**Resultado:** integración continua funcional y validada en rama; pendiente cierre formal tras merge y verificación exitosa sobre `main`.

## T-32 — Documentación, reproducibilidad y preparación de entrega

**Fecha:** 23 de octubre de 2026

**Herramienta de IA:** ChatGPT (GPT-6)

**Estado:** Desarrollo y validaciones completados; cierre de entrega sujeto a evidencia de demostración.

### Objetivo

Preparar la entrega técnica de Treo Wallet mediante documentación reproducible, guía de demostración, trazabilidad de requisitos y verificación final del repositorio.

### Implementación

- Actualización del `README.md` con instrucciones de instalación, configuración, migraciones, ejecución, pruebas y documentación de API.
- Elaboración de `docs/demo-5min.md` para la demostración de funcionalidades web y móvil.
- Incorporación de `docs/delivery-checklist.md` para controlar los requisitos de entrega.
- Elaboración de `docs/technical-defense.md` para justificar las decisiones arquitectónicas y financieras.
- Incorporación de `scripts/t32-delivery-audit.mjs` para verificar estructura documental, trazabilidad Git y archivos sensibles.

### Validación

- Auditoría documental: 0 errores y una advertencia esperada por cambios pendientes de commit.
- Repositorio clonado desde GitHub en una carpeta independiente, commit `d5b144d`.
- Instalación reproducible mediante `npm ci`: 1,138 paquetes instalados correctamente.
- ESLint, TypeScript y contratos OpenAPI: aprobados.
- Web: 43/43 pruebas aprobadas y compilación Vite exitosa.
- Móvil: 41/41 pruebas de lógica y 9/9 pruebas de interfaz aprobadas.
- Integración continua T-31: tres trabajos de GitHub Actions reportados como aprobados.
- Funcionamiento de la aplicación: comprobado manualmente por el desarrollador.

### Uso de inteligencia artificial

La IA participó en la estructuración de la documentación, elaboración del guion de demostración, revisión de los criterios de entrega y preparación de la auditoría.

El desarrollador verificó la instalación independiente, ejecutó los comandos de validación y revisó los resultados obtenidos.

### Limitaciones identificadas

- `npm ci` reportó siete vulnerabilidades en dependencias: dos moderadas y cinco altas, pendientes de clasificación y remediación.
- Se registraron advertencias por dependencias obsoletas y un script opcional de `fsevents` bloqueado.
- El despliegue AWS es una propuesta arquitectónica y no fue ejecutado.
- La demostración grabada debe verificarse antes de declarar la entrega completa.

### Resultado

Documentación y validaciones técnicas preparadas para la entrega de Treo Wallet. El cierre formal requiere incorporar la evidencia de demostración, integrar T-32 en `main` y confirmar el resultado final de CI.