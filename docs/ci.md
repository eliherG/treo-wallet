# T-31 · Integración continua de Treo Wallet

> **Alcance:** GitHub Actions de verificación. **No** despliega a AWS, no usa credenciales externas ni convierte las pruebas de desarrollo en certificación de seguridad.

## Activadores, permisos y trabajos

`.github/workflows/ci.yml` ejecuta tres trabajos independientes en Ubuntu 24.04 al recibir `push` (cualquier rama), `pull_request` hacia `main` y `workflow_dispatch`:

| Trabajo | Acciones y evidencia |
|---|---|
| **API · PostgreSQL 16** | `npm ci`, inicialización PostgreSQL, migraciones de `treo_test`, lint, typecheck, comprobación OpenAPI y 17 suites API secuenciales. |
| **Web** | `npm ci`, pruebas Vitest y compilación Vite. |
| **Móvil** | `npm ci`, suite combinada Node + Jest/RNTL y `expo install --check`. |

Se utiliza Node.js `24.19.0`, npm `12.0.2` y `npm ci` desde `package-lock.json`. Las acciones se invocan con checkout/setup-node `v7`; el token de GitHub dispone únicamente de permiso `contents: read` y checkout no persiste credenciales. Los valores de PostgreSQL/JWT/OTP son **fijos, públicos y exclusivos de este CI desechable**; no son secretos reales ni aptos para producción. La API se ejecuta en modo de pruebas y no se expone a Internet.

## PostgreSQL real sin tocar datos existentes

Cada ejecución del trabajo API crea un servicio `postgres:16` nuevo. Tras el `checkout`, copia y ejecuta `db/init/01-bootstrap.sh` **dentro del contenedor**, reutilizando el script de T-02 que prepara roles `treo_app`/`treo_migrator` y bases `treo_dev`/`treo_test`. El contenedor de CI se desecha al finalizar el trabajo; no hay relación con el volumen de Docker ni con las credenciales de la Mac.

`npm run db:migrate -w @treo/api -- --test` aplica las migraciones a `treo_test` antes de ejecutar suites. **No** ejecutar `synchronize: true` ni usar un superusuario para pruebas de aplicación: el sistema valida permisos de `treo_app`.

## Política npm 12 de scripts de instalación

`node scripts/configure-t31.mjs` registra en `package.json` raíz `allowScripts` para permitir `argon2` y `esbuild` y denegar explícitamente `@scarf/scarf`. No habilita indiscriminadamente scripts de instalación. Esta revisión corresponde a las dependencias que ya estaban instaladas en el proyecto; si `npm ci` descubre scripts adicionales, revisarlos antes de aprobarlos. `fsevents` no se instala en Linux por restricciones de plataforma.

El proyecto conserva vulnerabilidades npm previamente reportadas; no se usa `npm audit fix --force` para maquillarlas ni se afirma que el repositorio sea apto para producción.

## Por qué NO ejecutamos estrés ni seed masivo en cada push

`test:financial:stress` de T-19 crea transferencias y asientos **persistentes e inmutables** de forma intencional, por lo que exige reconocimiento explícito (`TREO_T19_PERSISTENT_STRESS=ACKNOWLEDGE_IMMUTABLE_LEDGER`) y una base de pruebas desechable. El seed de 100k movimientos y `EXPLAIN ANALYZE` de T-20 son tareas de evidencia de rendimiento, **no regresión habitual**.

CI sí ejecuta `test:financial:integrity`, los tests de concurrencia seguros incluidos en las suites ordinarias y `test:seed` (que usa rollback). Con ello no se afirma que el estrés T-19 se repitió en cada push: su evidencia previa queda documentada por separado.

## Validación y criterios de cierre

1. Rama nueva `ci/t-31-github-actions` sobre `main` limpio. Integrar overlay y ejecutar `node scripts/configure-t31.mjs`.
2. Verificar localmente `node --check scripts/ci-run-api-tests.mjs`, `npm run lint`, `npm run typecheck`, `npm run check:types`, suites API locales con `treo_test` y tests web/móvil.
3. Hacer commit **en la rama** y `git push -u origin ci/t-31-github-actions`. GitHub → **Actions** → **Treo Wallet CI**: comprobar los tres trabajos y sus logs. No son evidencia `npm` local ni comprobaciones estáticas del YAML.
4. Si los tres trabajos aparecen `success`, registrar **URL del run, SHA, fecha y trabajos** en `specs/ai-log.md`; solo entonces hacer merge a `main` y verificar que el push a `main` también queda verde.
5. Si no existe un run verde verificable, marcar `T-31 BLOCKED / CI pendiente`. No declarar cumplida RNF-12 ni puerta G4.

### Fallos comunes

- **Error `npm ci` / `node-gyp` / `argon2`:** comprobar versión Node/npm y `allowScripts`; no usar `--force` ni `--dangerously-allow-all-scripts`.
- **Error bootstrap PostgreSQL:** revisar paso `Bootstrap roles` (imagen postgres 16, container ID, logs sin divulgar contraseñas).
- **Error migraciones:** revisar variables `DB_PORT=5432`, `DB_TEST_NAME=treo_test`, credenciales efímeras y privilegios.
- **Suite fallida:** identificar nombre exacto `test:*` en el log. No ocultar suites con `continue-on-error`, `|| true` ni excluir casos hasta revisar causa.
- **Workflow no aparece:** verificar que el archivo y el commit estén en una rama accesible y que GitHub Actions esté habilitado para el repositorio; `workflow_dispatch` puede requerir que el archivo exista en la rama predeterminada.

El documento `docs/aws-deploy.md` de T-30 solo **propone** CI/CD OIDC hacia AWS; este workflow no solicita `id-token: write` porque T-31 no despliega nada.
