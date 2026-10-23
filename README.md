# Treo Wallet — billetera digital MXN

**Prueba técnica Fullstack Fintech · Node.js/Express · PostgreSQL · React · React Native/Expo · AWS (propuesta).**

Treo Wallet es una **simulación financiera** de cuentas en MXN y transferencias **internas**. Incluye una API modular, panel web, aplicación móvil y un motor transaccional sobre PostgreSQL. **No mueve dinero real ni se integra con SPEI**. La arquitectura de AWS está documentada, pero **no se desplegó**.

> **Regla de la demo:** solo credenciales y datos sintéticos. Nunca incluyas contraseñas, JWT, refresh tokens, OTP, `.env` o claves de infraestructura en commits, capturas, video o logs públicos.

## 1. Contenido y arquitectura

| Ruta | Responsabilidad |
|---|---|
| `api/` | Express + TypeScript + TypeORM: autenticación, cuentas, beneficiarios, transferencias, ledger, OTP, auditoría e historial. |
| `web/` | React + Vite + TypeScript: registro/login, cuentas, beneficiarios, transferencias, comprobantes e historial filtrable. |
| `mobile/` | React Native + Expo: login, saldos, 20 movimientos recientes, beneficiarios y transferencias seguras. |
| `packages/shared/` | Tipos generados a partir del contrato OpenAPI aprobado. |
| `db/init/` y `docker-compose.yml` | PostgreSQL 16 local, roles separados y bases `treo_dev`/`treo_test`. |
| `specs/` | Requisitos y criterios de aceptación, diseño, contrato OpenAPI, tareas y bitácora de IA; conservar historial sin squash. |
| `docs/` | Propuesta AWS, CI, recorrido de pruebas móviles, guion de demostración y checklist de entrega. |
| `.github/workflows/ci.yml` | CI real: API/PostgreSQL, web y móvil; **no** hace despliegue AWS. |

La operación financiera **no** se distribuyó entre microservicios. La API es un monolito modular y los controles principales de consistencia están en PostgreSQL: transacciones con bloqueos, saldo no negativo, llave idempotente, ledger con asientos balanceados mediante triggers diferidos y auditoría append-only. El saldo se representa en centavos enteros; el historial usa paginación por cursor.

Documentación de decisiones: [`specs/design.md`](specs/design.md). Propuesta de arquitectura productiva (sin infraestructura desplegada): [`docs/aws-deploy.md`](docs/aws-deploy.md).

## 2. Requisitos locales

- Node.js **24.19.0** y npm **12.0.2** (versiones verificadas para este proyecto); Git y Docker Desktop con Docker Compose.
- PostgreSQL **16** se ejecuta en Docker. Puerto local predeterminado: **5433**; no reutilizar una base de datos real.
- Para web, navegador moderno. Para móvil, Expo Go compatible con **SDK 57** y simulador iOS (Xcode), o un teléfono en la misma red local.
- La instalación desde cero necesita conexión a Internet para dependencias npm y Expo.

Comprueba versiones:

```bash
node -v
npm -v
docker compose version
```

## 3. Primera instalación en una copia limpia

```bash
git clone <URL-DEL-REPOSITORIO>
cd treo-wallet
npm ci
```

La etiqueta `<URL-DEL-REPOSITORIO>` debe sustituirse por el enlace real que acompañará la entrega. No se incluye una URL de repositorio inventada.

### 3.1 Variables locales y seguridad

El repositorio incluye `.env.example`. Crea `.env` **solo si no existe**:

```bash
cp -n .env.example .env
```

Configura los valores de desarrollo en `.env` (no deben subirse a Git):

| Variable | Uso |
|---|---|
| `POSTGRES_SUPERUSER_PASSWORD` | Arranque inicial del contenedor PostgreSQL. |
| `TREO_APP_PASSWORD`, `TREO_MIGRATOR_PASSWORD` | Roles diferenciados de app y migraciones. |
| `DB_HOST`, `DB_PORT` | Conexión local; usualmente `127.0.0.1` y `5433`. |
| `DB_NAME`, `DB_TEST_NAME` | **Deben ser distintas**; habitualmente `treo_dev` y `treo_test`. |
| `JWT_ACCESS_SECRET` | Firma de access JWT; generar un valor aleatorio largo exclusivo del entorno. |
| `TREO_OTP_HMAC_SECRET`, `TREO_DEMO_OTP` | Configuración **solo local** del OTP simulado. |
| `TREO_SEED_DEMO_PASSWORD` | Contraseña sintética de al menos 12 caracteres, usada al crear las cuentas demo; **no incluirla en el README**. |
| `WEB_ORIGIN` | Utiliza `http://localhost:5173` si se abre Vite con ese host; la coincidencia CORS debe ser exacta. |

Consulta `.env.example` y la implementación si el listado de variables cambia; no reemplaces variables reales por las credenciales públicas y desechables del CI. **No ejecutes el seed en `treo_test` ni en bases con información real.**

### 3.2 PostgreSQL y migraciones

```bash
docker compose up -d postgres
docker compose ps
npm run db:migrate -w @treo/api
```

El servicio Compose se llama **`postgres`**, no `db`. El contenedor ejecuta `db/init/01-bootstrap.sh` al inicializar un **volumen nuevo**, creando roles y bases. Si cambias contraseñas de roles después del primer arranque, editar `.env` **no** modifica automáticamente los roles existentes. No borres volúmenes de Docker para «arreglar» una instancia que contenga movimientos o auditoría inmutables.

Opcionalmente prepara la **base exclusiva de pruebas**:

```bash
npm run db:migrate -w @treo/api -- --test
```

`synchronize` permanece desactivado; el esquema se modifica exclusivamente mediante migraciones.

### 3.3 Seed de demostración — ejecutar solo una vez en desarrollo nuevo

```bash
npm run db:seed
```

El seed T-20 exige confirmación explícita en el script, `TREO_SEED_DEMO_PASSWORD` y que el destino sea **`DB_NAME` de desarrollo**, nunca `DB_TEST_NAME`. Antes de ejecutarlo comprueba que sea una base nueva y desechable: escribe **50 000 transferencias históricas y 100 000 movimientos/ledger**, persistentes e inmutables. **No se necesita repetir en cada arranque**, no se borra con los tests y puede negarse a reejecutarse si las cuentas demo ya recibieron operaciones manuales.

Al finalizar correctamente deben existir los usuarios sintéticos `treo-demo-a@seed.invalid` y `treo-demo-b@seed.invalid`. Sus credenciales son las que fijaste **localmente** en el seed; nunca publiques la contraseña. Estado inicial esperado **solo antes de otras operaciones**: Demo A, dos cuentas ($10 000 y $2 000 MXN); Demo B, una cuenta ($5 000 MXN). La prueba de rendimiento y su evidencia están documentadas en las tareas T-20 y `specs/ai-log.md`.

## 4. Levantar la API, la web y el móvil

Usa **tres terminales** (además de Docker). Con `.env` configurado y PostgreSQL saludable:

**Terminal A — API (puerto 3000):**

```bash
npm run dev -w @treo/api
```

Abre <http://127.0.0.1:3000/health> y **Swagger UI** en <http://127.0.0.1:3000/api-docs>. Contrato JSON servido en <http://127.0.0.1:3000/api-docs/openapi.json>. La API real se encuentra bajo `/api/v1`.

**Terminal B — Web (puerto 5173):**

```bash
npm run dev -w @treo/web
```

Abre <http://localhost:5173>. Vite redirige `/api/v1` a la API local. Mantén `WEB_ORIGIN=http://localhost:5173` para que CORS, refresh y logout web coincidan; `localhost` y `127.0.0.1` **son distintos orígenes**.

**Terminal C — Móvil (simulador iPhone):**

```bash
cd mobile
EXPO_PUBLIC_API_URL=http://127.0.0.1:3000/api/v1 npx expo start --go --clear
```

Presiona `i` para abrir el simulador iOS; con `Shift+i` puedes elegir el dispositivo (la validación manual usó iPhone 17). Desde `mobile/`, regresa a la raíz con `cd ..` antes de ejecutar los scripts del monorepo.

**iPhone físico:** usa la IP local de la Mac, no `127.0.0.1`. Solo en Wi-Fi privado de confianza:

```bash
# Terminal API, en la raíz
API_HOST=0.0.0.0 npm run dev -w @treo/api

# Otra terminal en la raíz
MAC_IP="$(ipconfig getifaddr en0)"
EXPO_PUBLIC_API_URL="http://${MAC_IP}:3000/api/v1" npm run dev -w @treo/mobile
```

Mac e iPhone deben estar en la misma red. HTTP sin TLS es **exclusivo de la demo local con datos ficticios**; no es configuración productiva. Desactiva exposiciones públicas de puertos y utiliza HTTPS en producción.

## 5. Pruebas y validaciones

Desde la raíz:

```bash
npm run lint
npm run typecheck
npm run check:types
npm run test -w @treo/web
npm run build -w @treo/web
npm run test -w @treo/mobile
```

Para pruebas API que utilizan PostgreSQL 16 **real y `treo_test` migrada**, ejecutar:

```bash
npm run db:migrate -w @treo/api -- --test
node scripts/ci-run-api-tests.mjs
```

El runner ejecuta **17 suites API secuenciales**, excluyendo intencionalmente el estrés persistente T-19 y la carga masiva T-20; revisar [`docs/ci.md`](docs/ci.md). No usar `treo_dev` para esas pruebas. Ejecutar `npm run db:explain` solo cuando se necesite medir el dataset T-20 de desarrollo.

Compatibilidad Expo:

```bash
cd mobile
npx expo install --check
npx expo-doctor@latest
cd ..
```

**Evidencia histórica previa a T-32:** 17 suites API locales, 43 pruebas web, 50 móviles (41 lógica + 9 UI) y GitHub Actions con tres jobs reportados en verde. **Estas cifras no sustituyen repetir el procedimiento desde un clon limpio en T-32.** Los resultados definitivos deben registrarse en [`docs/delivery-checklist.md`](docs/delivery-checklist.md), junto con el SHA y URL reales del run de `main`.

No usar `npm audit fix --force` para ocultar incompatibilidades o alertas; las vulnerabilidades de dependencias deben analizarse por separado.

## 6. Demostración de máximo cinco minutos

Consulta el guion cronológico [`docs/demo-5min.md`](docs/demo-5min.md). Muestra en una sola grabación, con datos sintéticos:

- Swagger navegable, panel web, cuenta, beneficiario, transferencia exitosa y movimiento actualizado.
- **Saldo insuficiente**, con error visible y sin comprobante de éxito ni débito.
- App móvil con login, saldo, 20 movimientos y transferencia segura hacia un destinatario registrado.
- Registro de estados y recuperación de red **sin simular un fallo que no se haya podido reproducir**.

**Video de hasta cinco minutos:** se graba fuera del repositorio, se inspecciona su duración y se comparte un enlace con permisos adecuados. No agregarlo a Git salvo solicitud explícita y revisión de tamaño/privacidad.

## 7. Cómo se gestionó la IA (SPEC antes del código)

`specs/requirements.md`, `specs/design.md`, `specs/tasks.md`, `specs/openapi.json` y `specs/ai-log.md` son la fuente de verdad. La IA generó propuestas desde especificaciones aprobadas; el desarrollador revisó, probó, corrigió y autorizó cada integración.

Consulta el historial completo con:

```bash
git log --oneline --reverse
git log --format='%h %s' --no-merges
```

No hubo squash deliberado de tareas; los commits preservan marcadores `[T-XX]` para facilitar trazabilidad. Para una revisión final de marcadores, ejecuta `node scripts/t32-delivery-audit.mjs`. **La presencia de un marcador no sustituye verificar los criterios de aceptación.**

## 8. Qué haría con más tiempo

1. **Seguridad y cumplimiento:** corregir vulnerabilidades npm investigadas; revisión independiente de seguridad de dependencias, gestión de secretos, hardening HTTP, políticas de sesión y modelo de amenazas. Integración real con proveedor OTP y controles antifraude.
2. **Resiliencia:** ensayos de inyección de fallos de red y crash entre commit y respuesta; pruebas repetidas de concurrencia en BD desechable, failover, recuperación PITR, conciliación contable y SLO medidos.
3. **Móvil productivo:** compilar binarios firmados, HTTPS obligatorio, protección nativa de snapshots/recording y prueba con dispositivos reales; Expo Go es una herramienta de desarrollo y la cobertura de `AppState` es *best effort*.
4. **Escala:** perfilar pools TypeORM, evaluar RDS Proxy con pinning real, partición o índices según `EXPLAIN ANALYZE` y carga representativa; no adoptar microservicios sin justificación.
5. **Entrega:** implementar IaC/Terraform y CD OIDC hacia AWS con `dev/staging/prod`, auditoría, monitoreo y rollback verificados; hoy solo existe CI, **no despliegue AWS**.
6. **Producto:** exportación CSV/PDF y/o transferencias programadas como funcionalidades opcionales, después de fortalecer invariantes y seguridad.

## 9. Referencias de entrega

- [Requisitos y criterios de aceptación](specs/requirements.md) · [Diseño y decisiones](specs/design.md) · [Tareas y trazabilidad](specs/tasks.md) · [Bitácora de IA](specs/ai-log.md).
- [Contrato OpenAPI 3.1](specs/openapi.json) · [Arquitectura AWS](docs/aws-deploy.md) · [CI GitHub Actions](docs/ci.md).
- [Guion de video](docs/demo-5min.md) · [Checklist final](docs/delivery-checklist.md) · [Recorrido móvil](docs/t29-mobile-manual.md).

**Estado de entrega:** verificación final de T-32 pendiente hasta ejecutar instalación limpia, repetir pruebas, grabar el video real (máximo 5 minutos), confirmar CI verde en `main` y verificar que la documentación y enlaces son accesibles al evaluador.
