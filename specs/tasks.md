# Treo Wallet — Plan de implementación trazable

**Archivo:** `/specs/tasks.md`  
**Versión:** 0.1 — APROBADO (2026-10-21); ajuste documental T-00 para incluir el enunciado original  
**Fecha:** 2026-10-21  
**Base:** `requirements.md` v0.3 aprobado, `design.md` v0.1 aprobado y `openapi.json` (OpenAPI 3.1).  
**Estado:** PLANIFICADO; ninguna tarea de código se da por completada, no se han ejecutado pruebas ni se han creado commits mediante AI.

## 1. Reglas de ejecución

1. **Puerta SPEC.** `T-00` debe cerrarse y su commit existir en Git **antes** de escribir código de aplicación. Incluye `AGENTS.md`, `treo-assessment-original.md`, `requirements.md`, `design.md`, `openapi.json`, `tasks.md` y `ai-log.md`. No incluir código fuente en ese commit.
2. Trabajar en orden de dependencias; cuando dos tareas sean independientes pueden desarrollarse en paralelo, pero no se permite omitir verificaciones.
3. Para cada `T-XX`: consultar RF/CA/RNF y diseño, proponer alcance y archivos, obtener aprobación según `AGENTS.md`, implementar únicamente ese alcance, correr checks reales, registrar resultados y proponer un commit.
4. **Cada tarea T-XX corresponde a uno o más commits identificables.** No agrupar varias tareas en un commit ni hacer squash. El desarrollador autoriza los commits; la AI no los ejecuta automáticamente.
5. Formato obligatorio: `type(scope): description [T-XX] [RF-YY]`. Cuando hay varios RF usar varios marcadores `[RF-YY]` si son importantes; los CA y RNF completos se documentan en el cuerpo de commit/PR, pruebas o este archivo.
6. `status` comienza en `TODO`; solo cambiar a `DONE` después de la definición de terminado de `AGENTS.md` y de existir evidencia concreta (comandos, resultados, SHA).
7. **Etiquetas:** `api`, `web`, `mobile`; las tareas transversales llevan varias etiquetas. Documentación, base de datos, pruebas y CI se asignan al cliente o clientes correspondientes.
8. No modificar `requirements.md`, `design.md` ni `openapi.json` aprobados sin documentar el cambio y obtener autorización. Si la implementación descubre un conflicto, detener esa tarea y resolverlo explícitamente.
9. El orden del plan es **prioridad de ejecución**, no garantía de duración. Entregar funcionalidades obligatorias antes que extras (CSV/PDF, biometría, transferencias programadas, IaC de ejemplo).

## 2. Convención de verificación por tarea

Cada tarea especifica una **evidencia verificable**, no pruebas supuestamente ejecutadas. Registrar en `/specs/ai-log.md`:

- Tarea, herramienta, resumen técnico del prompt y archivos afectados.
- Propuesta aceptada, rechazada o corregida y justificación.
- Comandos ejecutados realmente (`lint`, `typecheck`, `test`, `migrate`, etc.), salida relevante y fallos.
- `commit SHA` solamente **después** de que el desarrollador autorice y realice el commit.

**Definition of Done (DoD):** alcance conforme al RF/CA y contrato, casos negativos cubiertos, pruebas pertinentes ejecutadas y pasando, lint/typecheck pertinentes pasando, documentación/bitácora ajustada, commit autorizado y trazable. Los tests pendientes bloquean `DONE`.

## 3. Tareas

### Bloque 0 — Especificaciones y cimientos

#### T-00 — Versionar el baseline SPEC
- **Etiquetas:** `api`, `web`, `mobile` | **Estado:** `TODO`
- **Cobertura:** RF-01…RF-14; RNF-12 (trazabilidad previa a implementación).
- **Dependencias:** ninguna.
- **Alcance:** comprobar coherencia entre requerimientos, diseño y contrato; incluir `AGENTS.md` raíz y los seis archivos de `/specs` (incluyendo el enunciado original); comprobar que no hay código de aplicación antes del primer commit.
- **Archivos previstos:** `AGENTS.md`, `specs/{treo-assessment-original.md,requirements.md,design.md,openapi.json,tasks.md,ai-log.md}`, `.gitignore` mínimo sin secretos (si se necesita).
- **Evidencia:** validar JSON y `$ref` internos; `git status`; `git diff --cached --stat` y `git log -1 --format='%h %s'` después del commit; confirmar que contiene solo especificaciones/instrucciones.
- **Commit propuesto:** `docs(spec): baseline aprobado de Treo Wallet [T-00] [RF-01] [RF-14]`.

#### T-01 — Crear monorepo npm y scripts de desarrollo
- **Etiquetas:** `api`, `web`, `mobile` | **Estado:** `TODO`
- **Cobertura:** RNF-01, RNF-08, RNF-09, RNF-10.
- **Dependencias:** T-00.
- **Alcance:** workspaces `/api`, `/web`, `/mobile`, `/packages/shared`; TS estricto; scripts raíz `dev`, `lint`, `typecheck`, `test`, `db:migrate`, `db:seed`; `.env.example`; `.gitignore`.
- **Archivos previstos:** `package.json`, workspace manifests/tsconfigs, `.gitignore`, `.env.example`.
- **Evidencia:** `npm install`, `npm run typecheck`, `npm run lint` (al menos configuración funcional); evitar scripts falsamente verdes.
- **Commit propuesto:** `chore(repo): configurar workspaces y scripts [T-01] [RF-01]`.

#### T-02 — PostgreSQL local, roles y sistema de migraciones
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-14; RNF-02, RNF-07, RNF-10.
- **Dependencias:** T-01.
- **Alcance:** `docker-compose.yml` con PostgreSQL >=15 y healthcheck; dos roles diferenciados (migraciones/servicio); DataSource TypeORM `synchronize:false`, migraciones, variables de entorno y DB de integración real.
- **Archivos previstos:** `docker-compose.yml`, `api/src/database/*`, scripts DB.
- **Evidencia:** `docker compose up -d`, conexión con rol API y migraciones, `npm run db:migrate` contra DB nueva; comprobar `synchronize:false`.
- **Commit propuesto:** `chore(api): preparar postgres y migraciones [T-02] [RF-14]`.

#### T-03 — Migraciones para usuarios, cuentas y sesiones
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-01, RF-02, RF-03; CA-RF01-03/04/05/06, CA-RF02-04/05; RNF-02.
- **Dependencias:** T-02.
- **Alcance:** entidades y migraciones `users`, `accounts`, `refresh_tokens` con FK, unicidad de correo, CLABE única, moneda MXN y CHECK saldo no negativo; relaciones y expiración/rotación.
- **Archivos previstos:** `api/src/modules/{auth,accounts}/entities/*`, `api/src/database/migrations/*`.
- **Evidencia:** migrar sobre PostgreSQL limpio; tests DB de unicidad, FKs y rechazo de saldo negativo; inspeccionar esquema.
- **Commit propuesto:** `feat(api): modelar usuarios cuentas y sesiones [T-03] [RF-01] [RF-03]`.

#### T-04 — Migraciones de beneficiarios
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-04, RF-05; CA-RF04-01/02/03/04, RNF-02.
- **Dependencias:** T-03.
- **Alcance:** tabla `beneficiaries`, FK propietario, restricción de 18 dígitos y único `(user_id, clabe)`; el checksum se verifica en servicios, no se presupone desde SQL.
- **Archivos previstos:** `api/src/modules/beneficiaries/entities/*`, migración TypeORM.
- **Evidencia:** pruebas DB de dígitos/longitud y duplicados por propietario; dos usuarios pueden registrar una misma CLABE.
- **Commit propuesto:** `feat(api): modelar beneficiarios [T-04] [RF-04]`.

#### T-05 — Modelo de transferencias, ledger, cupos, OTP y auditoría
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-06…RF-14; RNF-02, RNF-05.
- **Dependencias:** T-03, T-04.
- **Alcance:** tablas/entidades `transfers`, `ledger_entries`, `daily_transfer_usage`, `otp_challenges`, `audit_events`; constraints de estado, importe, referencia, idempotencia compuesta `(sender_user_id,idempotency_key)` y FKs.
- **Archivos previstos:** entidades de `transfers` y `audit`, migración TypeORM con SQL avanzado donde aplique.
- **Evidencia:** aplicar migración desde cero; tests de FKs, unicidad, rangos y estado sin crear operaciones financieras válidas artificialmente.
- **Commit propuesto:** `feat(api): crear esquema financiero [T-05] [RF-14]`.

#### T-06 — Restricciones contables y privilegios de auditoría
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-14; CA-RF14-01/02/03/04; RNF-02, RNF-05.
- **Dependencias:** T-05.
- **Alcance:** trigger de constraint diferido para verificar exactamente 2 asientos, signos/cuentas/importes/suma cero al confirmar `COMPLETED`; impedir mutación de asientos consolidados y estados terminales; rol API sin UPDATE/DELETE/TRUNCATE de auditoría.
- **Archivos previstos:** migración con `queryRunner.query`, tests SQL con rol de aplicación.
- **Evidencia:** DB real rechaza 0, 1, 3 asientos, diferencias de signo/importe y cambios al ledger confirmado; rol app recibe `permission denied` en mutaciones de auditoría.
- **Commit propuesto:** `feat(api): proteger ledger y auditoria en postgres [T-06] [RF-14]`.

#### T-07 — Generar tipos compartidos desde OpenAPI
- **Etiquetas:** `api`, `web`, `mobile` | **Estado:** `TODO`
- **Cobertura:** RF-01…RF-13; RNF-03, RNF-10.
- **Dependencias:** T-01, T-00.
- **Alcance:** configurar generación de tipos TypeScript desde `specs/openapi.json`; cliente HTTP tipado o adaptadores compartidos; no duplicar manualmente DTOs incompatibles.
- **Archivos previstos:** `packages/shared/*`, script `generate:types` raíz.
- **Evidencia:** regeneración reproducible y `npm run typecheck`; cambio de prueba temporal en contrato produce cambio de tipos y se revierte.
- **Commit propuesto:** `chore(shared): generar tipos desde openapi [T-07] [RF-06]`.

### Bloque 1 — API y seguridad

#### T-08 — Crear infraestructura HTTP de API
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-02, RF-14; CA-RF14-06; RNF-01, RNF-03, RNF-04.
- **Dependencias:** T-01, T-02, T-07.
- **Alcance:** Express modular, validación Zod, `requestId`, logger JSON con redacción de secretos, RFC 7807 consistente, ruta health y Swagger UI `/api-docs` desde `openapi.json`.
- **Archivos previstos:** `api/src/app.ts`, `api/src/middlewares/*`, `api/src/modules/*/routes*`.
- **Evidencia:** tests supertest de 400/401/500 sanitizado; documentación navegable, logs sin CLABE/tokens y `requestId` en error.
- **Commit propuesto:** `feat(api): configurar express errores y swagger [T-08] [RF-14]`.

#### T-09 — Registro y acceso JWT
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-01, RF-02; CA-RF01-01…06, CA-RF02-01/02/03/06; RNF-04.
- **Dependencias:** T-03, T-08.
- **Alcance:** `/auth/register`, `/auth/login`, email canónico, Argon2id, alta de cuenta 0 centavos, rate limit, access JWT corto, rechazo genérico de credenciales, protección de recursos.
- **Archivos previstos:** `api/src/modules/auth/{controller,service,repository,schemas}*`, pruebas.
- **Evidencia:** tests API/DB de registro concurrente, email duplicado, hash, credenciales inválidas, JWT caducado/ajeno y rate limit.
- **Commit propuesto:** `feat(api): implementar registro y login [T-09] [RF-01] [RF-02]`.

#### T-10 — Refresh rotativo y logout
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-02; CA-RF02-04/05/06; RNF-04.
- **Dependencias:** T-09.
- **Alcance:** `/auth/refresh` y `/auth/logout`, almacenar hashes de refresh, rotar atómicamente, revocar familia al detectar reuse; cookie HttpOnly para web y flujo seguro documentado para móvil, protección CSRF/origen.
- **Archivos previstos:** módulo auth, servicio de tokens, tests y schemas.
- **Evidencia:** tests reales refresh válido → rotado → token anterior rechazado; logout y reutilización/familia revocada; sin tokens en logs.
- **Commit propuesto:** `feat(api): rotar y revocar refresh tokens [T-10] [RF-02]`.

#### T-11 — Consultar cuentas propias
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-03; CA-RF03-01…; RNF-01.
- **Dependencias:** T-09.
- **Alcance:** `GET /accounts`, propietario derivado del JWT, serializar `balanceCents` como string, no exponer cuentas ajenas.
- **Archivos previstos:** `api/src/modules/accounts/*`, tests.
- **Evidencia:** tests para usuario con cero, una y varias cuentas; respuesta conforme a OpenAPI y aislamiento entre usuarios.
- **Commit propuesto:** `feat(api): exponer cuentas y saldos propios [T-11] [RF-03]`.

#### T-12 — CLABE y API de beneficiarios
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-04, RF-05; CA-RF04-01…; CA-RF05-01…; RNF-07.
- **Dependencias:** T-04, T-09.
- **Alcance:** checksum CLABE MX, esquema Zod, `GET/POST /beneficiaries`, unicidad por propietario, CLABE no interna permitida para alta pero no para mover dinero.
- **Archivos previstos:** `api/src/modules/beneficiaries/*`, utilidad CLABE y tests.
- **Evidencia:** unit tests CLABE válida/errónea; API integración de duplicación, propiedad, listado y no enumeración ajena.
- **Commit propuesto:** `feat(api): validar clabe y gestionar beneficiarios [T-12] [RF-04] [RF-05]`.

### Bloque 2 — Núcleo financiero y consultas

#### T-13 — Representar montos exactos y validar instrucciones
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-06, RF-07, RF-08, RF-14; CA-RF06-01…, CA-RF07-01…, RNF-05.
- **Dependencias:** T-08, T-11, T-12.
- **Alcance:** parseo decimal estricto → centavos `bigint`; rechazo de >2 decimales, negativos, cero y exponentes; origen/destino, propiedad, CLABE interna, referencia y concepto; límites de `BIGINT`.
- **Archivos previstos:** `api/src/modules/transfers/{validation,schemas}*`, utilidades + unit tests.
- **Evidencia:** pruebas de formatos y límites, 0.01 exacto, ceros iniciales de referencia, nunca redondear ni usar `float` para negocio.
- **Commit propuesto:** `feat(api): validar montos y destinos sin float [T-13] [RF-06]`.

#### T-14 — Registrar intención e idempotencia persistente
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-13, RF-06; CA-RF13-01/02/03/05/06; RNF-05.
- **Dependencias:** T-05, T-13.
- **Alcance:** canonicalización/hash de payload, llave por usuario, control de colisiones concurrentes, replay de estado y rechazo 409 si cambia contenido; transacciones seguras.
- **Archivos previstos:** `api/src/modules/transfers/{idempotency,service,repository}*`, tests.
- **Evidencia:** solicitudes paralelas con misma llave/payload generan una intención; misma llave/distinto contenido 409; dos usuarios con mismo valor textual no colisionan.
- **Commit propuesto:** `feat(api): incorporar idempotencia transaccional [T-14] [RF-13]`.

#### T-15 — Transferencia atómica sin OTP
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-06, RF-07, RF-09, RF-14; CA-RF06-01…, CA-RF07-01…, CA-RF09-01…, CA-RF14-01/03; RNF-05.
- **Dependencias:** T-06, T-11, T-12, T-13, T-14.
- **Alcance:** `POST /transfers`, bloqueo del remitente y cuentas en orden determinista con `FOR UPDATE`; consumo atómico de límite diario, débito/crédito, ledger, auditoría; rechazo de fondos/cupo insuficientes; commit único.
- **Archivos previstos:** `api/src/modules/transfers/*`, servicios SQL/TypeORM y tests integración.
- **Evidencia:** transferencias internas y entre cuentas propias; saldo/cuota exactos, rollback en falla inducida, referencias ajenas rechazadas y respuesta solo después de COMMIT.
- **Commit propuesto:** `feat(api): ejecutar transferencias atomicas [T-15] [RF-06] [RF-09] [RF-14]`.

#### T-16 — OTP, expiración y contabilización en día correcto
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-09, RF-10, RF-13; CA-RF10-01…, CA-RF09-01…; RNF-05.
- **Dependencias:** T-15.
- **Alcance:** desafío OTP simulado solo local/test; `PENDING_CONFIRMATION`, confirmación en `/transfers/{id}/confirm`, TTL 5 min, 3 fallos, un uso; revalidar saldo y cupo al confirmar y definir día con reloj DB tras bloqueos.
- **Archivos previstos:** módulo transfers/OTP, reloj inyectable en tests, integración.
- **Evidencia:** $5,000.00 sin OTP / $5,000.01 con OTP; expiración, replay, fallos, medianoche y confirmaciones paralelas; nunca comprometer dinero antes del OTP.
- **Commit propuesto:** `feat(api): confirmar transferencias con otp [T-16] [RF-10] [RF-09]`.

#### T-17 — Estado real y comprobantes de transferencia
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-12, RF-13; CA-RF12-01…04, CA-RF13-04.
- **Dependencias:** T-15, T-16.
- **Alcance:** `GET /transfers/{transferId}` autorizado, estados terminales y pendientes, metadatos de comprobante enmascarados; recuperación de resultado incierto.
- **Archivos previstos:** controlador/consulta transfer, tests API.
- **Evidencia:** estado de operación propia, no filtrar información de transferencia ajena, comprobante solo para `COMPLETED`.
- **Commit propuesto:** `feat(api): consultar estados y comprobantes [T-17] [RF-12] [RF-13]`.

#### T-18 — Historial con cursor y filtros
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-11; CA-RF11-01…06; RNF-06.
- **Dependencias:** T-15, T-07.
- **Alcance:** `GET /movements` con rango por días `America/Mexico_City`, tipo, cuenta autorizada, cursor opaco HMAC ligado a usuario y filtros, orden `(created_at DESC,id DESC)`, `limit` validado.
- **Archivos previstos:** `api/src/modules/movements/*`, índice(s) mediante migración nueva y tests.
- **Evidencia:** páginas consecutivas sin OFFSET, caso de movimiento nuevo entre páginas, cursor alterado, filtro inválido y no exposición de datos ajenos.
- **Commit propuesto:** `feat(api): consultar movimientos con cursor [T-18] [RF-11]`.

#### T-19 — Suite financiera y prueba de 100 solicitudes concurrentes
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-06, RF-09, RF-13, RF-14; CA-RF13-01…06, CA-RF14-01…06; RNF-07.
- **Dependencias:** T-06, T-14…T-18.
- **Alcance:** ampliar tests PostgreSQL para idempotencia, reversión de cambios en falla, permisos, ledger, límites y 100+ intentos desde una cuenta; también transferencias cruzadas y saldo final calculado desde operaciones `COMPLETED`.
- **Archivos previstos:** `api/test/integration/*`, utilidades fixtures.
- **Evidencia:** comando de prueba y salida real; saldo final exacto al centavo, ninguno negativo, no duplicados, todos los asientos conciliados; no aprobar si falla.
- **Commit propuesto:** `test(api): validar integridad y concurrencia [T-19] [RF-14] [RF-13]`.

#### T-20 — Seed reproducible y medición de consultas
- **Etiquetas:** `api` | **Estado:** `TODO`
- **Cobertura:** RF-03, RF-11, RF-14; CA-RF11-01…06; RNF-06, RNF-10.
- **Dependencias:** T-03…T-06, T-18.
- **Alcance:** seed seguro de cuentas A/B y saldos de demostración D-02; dataset reproducible con >=100,000 movimientos válidos; ejecutar `EXPLAIN (ANALYZE, BUFFERS)` y pegar salida REAL e interpretación en `design.md` con autorización de actualización documental.
- **Archivos previstos:** `api/src/database/seeds/*`, scripts y sección 5.1 de `specs/design.md`.
- **Evidencia:** `npm run db:seed`, conteo SQL >=100,000, resultado `EXPLAIN ANALYZE` real; verificar consistencia contable de datos sembrados.
- **Commit propuesto:** `perf(api): seed y medicion de historial [T-20] [RF-11]`.

### Bloque 3 — Cliente web

#### T-21 — Aplicación web y flujos de autenticación
- **Etiquetas:** `web` | **Estado:** `TODO`
- **Cobertura:** RF-01, RF-02; CA-RF01-01…06, CA-RF02-01…06; RNF-08.
- **Dependencias:** T-07, T-09, T-10.
- **Alcance:** React + Vite + TS; router y TanStack Query; `register/login/logout`, access en memoria, refresh mediante cookie/CSRF, formularios accesibles y estados.
- **Archivos previstos:** `web/src/{app,pages,features,api}/*`, tests.
- **Evidencia:** Testing Library de formulario, errores y login; `lint`, `typecheck`, `test`; interfaz accesible por teclado.
- **Commit propuesto:** `feat(web): crear autenticacion y base react [T-21] [RF-02]`.

#### T-22 — Resumen de cuentas y beneficiarios
- **Etiquetas:** `web` | **Estado:** `TODO`
- **Cobertura:** RF-03, RF-04, RF-05; CA-RF03-01…, CA-RF04-01…, CA-RF05-01…; RNF-08.
- **Dependencias:** T-21, T-11, T-12.
- **Alcance:** dashboard con saldos es-MX sin cálculo float; lista/alta de beneficiarios con validación compartida; carga, vacío, error y éxito.
- **Archivos previstos:** `web/src/features/{accounts,beneficiaries}/*`, pruebas.
- **Evidencia:** UI en navegador local, errores de CLABE y duplicados, cuentas propias, navegación con teclado; tests de componentes.
- **Commit propuesto:** `feat(web): mostrar cuentas y beneficiarios [T-22] [RF-03] [RF-04]`.

#### T-23 — Transferencia web, revisión, OTP y comprobante
- **Etiquetas:** `web` | **Estado:** `TODO`
- **Cobertura:** RF-06, RF-07, RF-08, RF-09, RF-10, RF-12, RF-13; CA-RF08-01…, CA-RF13-01/02/04; RNF-08.
- **Dependencias:** T-21, T-22, T-15…T-17.
- **Alcance:** formulario de destino propio/beneficiario, resumen de confirmación, llave única por intención, botón bloqueado, validaciones, OTP, pantalla de estado/comprobante y refetch de saldo.
- **Archivos previstos:** `web/src/features/transfers/*`, tests.
- **Evidencia:** doble clic = una intención; saldo insuficiente muestra RFC 7807 sin comprobante; OTP correcto/erróneo; recarga tras éxito.
- **Commit propuesto:** `feat(web): completar flujo de transferencias [T-23] [RF-06] [RF-13]`.

#### T-24 — Historial web con filtros y cursor
- **Etiquetas:** `web` | **Estado:** `TODO`
- **Cobertura:** RF-11; CA-RF11-01…06; RNF-08.
- **Dependencias:** T-21, T-18.
- **Alcance:** listado paginado con cursor, fechas y tipo; indicadores de carga, vacío, error y botón siguiente; montos es-MX.
- **Archivos previstos:** `web/src/features/movements/*`, tests.
- **Evidencia:** renderizar página 1/2, aplicar y resetear filtros sin reutilizar cursor incorrecto, navegación teclado.
- **Commit propuesto:** `feat(web): crear historial con filtros [T-24] [RF-11]`.

#### T-25 — Pruebas integradas y accesibilidad web
- **Etiquetas:** `web` | **Estado:** `TODO`
- **Cobertura:** RF-03, RF-06, RF-08, RF-10, RF-11, RF-12, RF-13; RNF-08.
- **Dependencias:** T-22, T-23, T-24.
- **Alcance:** tests Testing Library del recorrido de transferencia, fondos insuficientes y reintento/OTP; accesibilidad de etiquetas, foco y estados.
- **Archivos previstos:** `web/src/**/*.test.tsx`, mocks de API y ajustes UI pertinentes.
- **Evidencia:** suites web `lint`, `typecheck`, `test` ejecutadas; error insuficiencia probado explícitamente.
- **Commit propuesto:** `test(web): cubrir transferencias y accesibilidad [T-25] [RF-08]`.

### Bloque 4 — Cliente móvil

#### T-26 — Expo, login y almacenamiento seguro
- **Etiquetas:** `mobile` | **Estado:** `TODO`
- **Cobertura:** RF-02; CA-RF02-01…05; RNF-09.
- **Dependencias:** T-07, T-09, T-10.
- **Alcance:** Expo + RN + TS; navegación; cliente API; login, refresh y `expo-secure-store`; nunca guardar tokens en AsyncStorage.
- **Archivos previstos:** `mobile/{app.json,src/**}`, tests.
- **Evidencia:** iniciar Expo en emulador o dispositivo compatible, sesión real, `lint`, `typecheck`, `test` móvil; no exponer tokens.
- **Commit propuesto:** `feat(mobile): preparar expo y autenticacion segura [T-26] [RF-02]`.

#### T-27 — Saldo, últimos 20 y selección de beneficiarios
- **Etiquetas:** `mobile` | **Estado:** `TODO`
- **Cobertura:** RF-03, RF-05, RF-11; CA-RF11-05; RNF-09.
- **Dependencias:** T-26, T-11, T-12, T-18.
- **Alcance:** Home con cuentas/saldo, últimos 20 movimientos y lista de beneficiarios ya dados de alta en web; loading/empty/error.
- **Archivos previstos:** `mobile/src/features/{accounts,movements,beneficiaries}/*`, tests.
- **Evidencia:** máximo 20 movimientos, sin pantallas de alta no requeridas; navegación y datos consistentes con API.
- **Commit propuesto:** `feat(mobile): consultar saldos y movimientos [T-27] [RF-03] [RF-11]`.

#### T-28 — Transferencia móvil, estado incierto y privacidad
- **Etiquetas:** `mobile` | **Estado:** `TODO`
- **Cobertura:** RF-06, RF-08, RF-10, RF-12, RF-13; CA-RF13-01…04, CA-RF12-01…04; RNF-09.
- **Dependencias:** T-27, T-15…T-17.
- **Alcance:** elegir beneficiario, formulario/revisión, una llave idempotente por intención, OTP, resultado/comprobante; timeout → `UNKNOWN_RESULT`, reconsulta/reintento misma llave; cubrir snapshots al segundo plano y documentar limitaciones de Expo Go.
- **Archivos previstos:** `mobile/src/features/transfers/*`, gestión de estado de app y tests.
- **Evidencia:** simular corte de red tras petición, comprobar un solo débito; al volver del fondo no revelar datos sensibles en snapshot de prueba compatible.
- **Commit propuesto:** `feat(mobile): transferir con retry seguro [T-28] [RF-13] [RF-06]`.

#### T-29 — Pruebas de seguridad y flujos móviles
- **Etiquetas:** `mobile` | **Estado:** `TODO`
- **Cobertura:** RF-02, RF-03, RF-06, RF-10, RF-12, RF-13; RNF-09.
- **Dependencias:** T-26…T-28.
- **Alcance:** tests automatizados de login, tokens seguros, OTP, rechazo, red inestable y render de privacidad; verificar los flujos reales en dispositivo o simulador.
- **Archivos previstos:** `mobile/src/**/*.test.tsx`, helpers.
- **Evidencia:** `lint`, `typecheck`, `test` móvil; prueba manual reproducible documentada, señalando cualquier limitación.
- **Commit propuesto:** `test(mobile): cubrir red y privacidad [T-29] [RF-13]`.

### Bloque 5 — AWS, CI y entrega

#### T-30 — Propuesta documentada de despliegue AWS
- **Etiquetas:** `api`, `web`, `mobile` | **Estado:** `TODO`
- **Cobertura:** RNF-11.
- **Dependencias:** T-00 (el documento puede elaborarse en paralelo a la implementación).
- **Alcance:** `/docs/aws-deploy.md` con Mermaid; elección y descarte ECS Fargate/App Runner/EKS/Lambda, RDS/Aurora Multi-AZ + PITR, RPO/RTO objetivo, hosting web, distribución segura móvil, observabilidad/CloudTrail/auditoría y retención, CI OIDC, dev/staging/prod, pooling/RDS Proxy, escala 100x, Terraform/CDK/SAM.
- **Archivos previstos:** `docs/aws-deploy.md`.
- **Evidencia:** checklist de cada fila y pregunta del enunciado; distinguir objetivos propuestos de garantías medidas o requisitos regulatorios verificados.
- **Commit propuesto:** `docs(aws): proponer arquitectura productiva [T-30] [RF-14]`.

#### T-31 — Pipeline CI con checks de los tres clientes
- **Etiquetas:** `api`, `web`, `mobile` | **Estado:** `TODO`
- **Cobertura:** RNF-07, RNF-08, RNF-09, RNF-12.
- **Dependencias:** T-19, T-25, T-29.
- **Alcance:** GitHub Actions con instalación reproducible, PostgreSQL service para tests de API, migraciones, lint/typecheck/pruebas de API/web/móvil; permisos mínimos y sin secretos embebidos.
- **Archivos previstos:** `.github/workflows/ci.yml`, ajustes scripts.
- **Evidencia:** ejecución **verde** visible en rama principal (y log). Si no hay ejecución disponible, estado `BLOCKED`, jamás afirmar verde.
- **Commit propuesto:** `ci(repo): verificar api web y mobile [T-31] [RF-14]`.

#### T-32 — README, demo y auditoría final de entrega
- **Etiquetas:** `api`, `web`, `mobile` | **Estado:** `TODO`
- **Cobertura:** RF-01…RF-14; RNF-03, RNF-06…RNF-12.
- **Dependencias:** T-19, T-20, T-25, T-29, T-30, T-31.
- **Alcance:** README con scripts `db:migrate`, `db:seed`, `dev`, pruebas y «qué haría con más tiempo»; Swagger local, Expo Go/simulador y URL API local; demo en web + móvil <=5 min (incluye saldo insuficiente), revisar CI, trazabilidad, historial sin squash y preparar decisiones para defensa de 60 min.
- **Archivos previstos:** `README.md`, `docs/*` si se necesita; video como entregable externo, sin subir secretos/datos reales.
- **Evidencia:** repetir desde clon limpio instrucciones del README, confirmar tests/migraciones, video real <=5 min, `git log --oneline` y ejecución CI verde.
- **Commit propuesto:** `docs(repo): finalizar instrucciones y evidencia [T-32] [RF-01] [RF-14]`.

## 4. Puertas de calidad y orden recomendado

| Puerta | Después de | Condición para avanzar |
|---|---|---|
| **G0 · SPEC primero** | T-00 | Un commit de especificaciones aprobado, anterior al código. |
| **G1 · Base confiable** | T-01…T-12 | Migraciones ejecutadas, permisos DB probados, JWT y CLABE funcionando, OpenAPI navegable. |
| **G2 · Dinero exacto** | T-13…T-20 | Pruebas integradas PostgreSQL para saldo, ledger, cupos, OTP, idempotencia y 100+ concurrencias; `EXPLAIN ANALYZE` real. |
| **G3 · Clientes** | T-21…T-29 | Web y móvil consumen la misma API y manejan errores/reintentos; pruebas reales. |
| **G4 · Entrega** | T-30…T-32 | AWS documentado, CI verde, README reproducible, demo completa y bitácora actualizada. |

**Camino crítico recomendado:** `T-00 → T-01 → T-02 → T-03/T-04/T-05/T-06 → T-08/T-09/T-10/T-11/T-12 → T-13…T-20 → T-21…T-29 → T-31/T-32`. `T-07` alimenta tipos y clientes y `T-30` puede documentarse después de G0.

## 5. Matriz de trazabilidad

| Requisito | Tareas principales |
|---|---|
| RF-01 | T-03, T-09, T-21 |
| RF-02 | T-03, T-09, T-10, T-21, T-26 |
| RF-03 | T-03, T-11, T-20, T-22, T-27 |
| RF-04 | T-04, T-12, T-22 |
| RF-05 | T-04, T-12, T-22, T-27 |
| RF-06 | T-05, T-13, T-15, T-19, T-23, T-28 |
| RF-07 | T-05, T-13, T-15, T-23 |
| RF-08 | T-13, T-23, T-25, T-28 |
| RF-09 | T-05, T-15, T-16, T-19, T-23 |
| RF-10 | T-05, T-16, T-23, T-28, T-29 |
| RF-11 | T-18, T-20, T-24, T-27 |
| RF-12 | T-17, T-23, T-28, T-29 |
| RF-13 | T-14, T-17, T-19, T-23, T-28, T-29 |
| RF-14 | T-02, T-05, T-06, T-13, T-15, T-19, T-20, T-31 |

Para **todos** los RF también aplica T-00 (documentación) y T-32 (revisión final). Las pruebas y commits deben citar los criterios `CA-RFXX-NN` concretos; usar los rangos abreviados de este plan solo como referencia, no como evidencia de cobertura real.

## 6. Registro de avance (actualizar con hechos)

| Tarea | Estado | Commit SHA | Pruebas realmente ejecutadas |
|---|---|---|---|
| T-00 | TODO | — | Ninguna |
| T-01…T-32 | TODO | — | Ninguna |

El estado inicial es deliberadamente conservador. La aprobación de documentos no significa implementación ejecutada. Un bloqueo se marca `BLOCKED` con causa y acción siguiente; no se oculta.
