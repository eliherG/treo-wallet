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
