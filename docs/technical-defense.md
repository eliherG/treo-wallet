# T-32 · Guía de defensa técnica de 60 minutos

**Objetivo:** explicar decisiones con evidencia del repositorio, sin memorizar afirmaciones que las pruebas no sostienen.

## Agenda sugerida

| Minutos | Contenido |
|---|---|
| 00–05 | Contexto, RF esenciales, alcance ficticio, demo breve. |
| 05–15 | Monorepo, módulos Express, OpenAPI, separación de responsabilidades. |
| 15–28 | Modelo PostgreSQL, migraciones, ledger, auditoría, concurrencia e idempotencia. |
| 28–38 | Autenticación, refresh, cookies WEB frente a SecureStore MOBILE, OTP, CORS. |
| 38–46 | Clientes web/móvil, estados, errores, pérdidas de red, privacidad. |
| 46–53 | Pruebas 100+ concurrencias, seed de 100k movimientos, `EXPLAIN ANALYZE`. |
| 53–58 | GitHub Actions, arquitectura AWS propuesta, límites. |
| 58–60 | Aprendizajes al trabajar con IA y próximos pasos. |

## Preguntas que debes poder responder con el código abierto

### ¿Por qué un monorepo y no microservicios?

Una base común para API, web, móvil, `/specs` y tipos OpenAPI simplifica cambios de contrato y pruebas. Un **monolito modular** concentra una transferencia y sus asientos en la **misma transacción PostgreSQL**; particionar prematuramente en servicios introduciría coordinación distribuida sin ventaja demostrada para este ejercicio. Monorepo y microservicios no son conceptos excluyentes: la primera decisión organiza repositorios y la segunda, despliegues/consistencia.

### ¿Por qué PostgreSQL y no MongoDB para dinero?

Se requieren invariantes relacionales y transaccionales comprobados por el motor: relaciones, `CHECK`, exclusión de saldos negativos, idempotencia única, transacciones, roles SQL, triggers diferidos, auditoría insert-only. Los documentos JSONB se usan donde corresponden sin renunciar a restricciones. `synchronize: false`; TypeORM migra y consulta, y SQL explícito asegura reglas que el ORM no puede garantizar.

### ¿Dónde se asegura que el dinero cuadre?

En una misma transacción se bloquean recursos, se valida origen/destino y cupo, se actualizan saldos, se insertan `DEBIT`/`CREDIT`, se consumen límites y se audita. PostgreSQL impide asientos desbalanceados con constraint triggers diferidos, aun cuando un bug de aplicación intentara marcar una operación `COMPLETED`. Revisar código T-05/T-06 y pruebas T-15/T-19; la lógica del cliente nunca es fuente de verdad.

### ¿Cómo evitas carreras y deadlocks?

Bloqueo determinista de usuario y cuentas con `FOR UPDATE`, antes de escrituras financieras; no dividir el débito y crédito en solicitudes independientes. El caso T-19 detectó conflictos de locks y fue corregido; las pruebas simultáneas validan el saldo y ausencia de duplicaciones, pero no significan que se hayan cubierto todas las intercalaciones posibles.

### ¿Qué significa idempotencia?

Una intención tiene una clave y huella del payload. Misma clave + mismo payload devuelve el estado de la operación existente; misma clave + payload distinto se rechaza. En móvil se persiste la intención en almacenamiento seguro **antes del POST**. Ante timeout no se genera otra llave; con folio se consulta estado y sin folio se reintenta **la misma intención**. Un `UNKNOWN_RESULT` nunca se trata como `COMPLETED`.

### ¿Qué ocurre con OTP y límite diario?

El límite demo es $20 000 MXN por día civil `America/Mexico_City`; sobre $5 000 MXN se exige OTP. Una transferencia pendiente de OTP **todavía no ha debitado**. El backend vuelve a validar fondos y cupo cuando contabiliza la operación; el OTP tiene expiración y número máximo de intentos. Los límites son decisiones de la simulación, no políticas bancarias universales.

### ¿Cómo gestionaste identidad y sesión?

Access JWT corto; refresh rotativo opaco y revocable, hash persistido. En web, refresh mediante cookie HttpOnly con comprobación de Origin para rutas sensibles; en móvil, refresh solo en SecureStore y access en memoria. Un refresh invalidado revoca acceso y el cliente no conserva una sesión falsa.

### ¿Qué significa “saldo insuficiente” para el evaluador?

Se obtiene un rechazo sin débito, sin par de asientos y sin comprobante exitoso. Seleccionar una cuenta sintética cuyo saldo visible sea inferior al importe —dentro de las reglas del formulario— y verificar por API/historial que el dinero permanece igual. Nunca alterar saldos a mano en BD para preparar el ejemplo.

### ¿Qué demuestra el seed de T-20?

50 000 transferencias históricas, 100 000 movimientos (dos asientos por transferencia), ledger balanceado e índices medidos con `EXPLAIN (ANALYZE, BUFFERS)` reales. No es prueba de rendimiento del despliegue AWS ni de 100 000 usuarios concurrentes. Distinguir rendimiento con filtro de cuenta frente a recorrido por usuario sin el mismo filtro.

### ¿Qué garantiza y qué NO garantiza el móvil?

Autenticación, SecureStore, preservación de intención idempotente, reconciliación y rendering `AppPrivacyCover` basado en `AppState` verificados en pruebas. Expo Go y el overlay JS **no** garantizan ocultación nativa de snapshots/capturas; la seguridad productiva exige builds firmadas, pruebas en dispositivos reales y HTTPS.

### ¿Por qué Fargate + RDS y no EKS, Lambda o Aurora?

Preserva el backend existente en contenedores sin administrar un clúster Kubernetes, mantiene la semántica de PostgreSQL y escala con métricas observadas. EKS y Aurora podrían justificarse con necesidades reales; Lambda exige reconsiderar pooling de conexiones; Multi-AZ mejora alta disponibilidad **pero no** convierte el standby en réplica de lectura para operaciones críticas. Los RPO/RTO son objetivos a ensayar, no resultados logrados.

### ¿Qué hace T-31 exactamente?

GitHub Actions en `main`: PostgreSQL 16 efímero, migraciones, 17 suites de API, lint/typecheck/OpenAPI, 43 pruebas web + build, 50 pruebas móviles + check Expo. Node 24/npm 12, `npm ci`, permisos `contents: read`. No despliega a AWS; eso requeriría OIDC, aprobaciones por entorno, secretos reales gestionados y estrategia de migración/rollback.

### ¿En qué ayudó la IA y qué corregiste tú?

Especificaciones primero y revisión humana de cada bloque. Ejemplos verificables: deadlock/orden de locks en T-19; duplicación de React/React Native resuelta con deduplicación del monorepo en T-26; expectativas Jest en T-29; prueba móvil asíncrona y origen CORS en runners T-31. No declarar «la IA lo validó» como sustituto de logs, CI y tests reales.

## Mostrar evidencia sin improvisar

Abre `specs/requirements.md`, `specs/design.md`, `specs/openapi.json`, `specs/ai-log.md`, `docs/aws-deploy.md`, `.github/workflows/ci.yml`, los tests T-19 y el historial Git. Ante una pregunta no cubierta, expón claramente el límite, cómo lo probarías y el siguiente paso.
