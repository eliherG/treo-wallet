# T-32 · Checklist de auditoría final y entrega

> **No marcar verificado por intención.** Registrar evidencia real (comando, SHA, URL, archivo, fecha), sin contraseñas, JWT, OTP ni datos personales. Este archivo empieza **pendiente** por diseño.

## 1. Criterios del enunciado Treo

| Entregable obligatorio | Estado actual | Evidencia y acción |
|---|---|---|
| GitHub: URL real, permisos para evaluadores e historial **sin squash** | PENDIENTE | Comprobar enlace, acceso y `git log --oneline --reverse`; registrar URL. |
| `/specs`: requirements, design, tasks, ai-log (+ OpenAPI aprobado) | PENDIENTE AUDITAR | Archivos versionados; verificar que SPEC antecede al primer commit de código. |
| `/docs/aws-deploy.md` y diagrama Mermaid | PREPARADO, PENDIENTE VISUAL | Confirmar preview Markdown/Mermaid en GitHub; **AWS no desplegado**. |
| Swagger local navegable | PENDIENTE | API arriba y `http://127.0.0.1:3000/api-docs` funcionando. |
| README reproducible desde **clon limpio** | PENDIENTE | Seguir secciones 2–5 del README en otra carpeta sin copiar `node_modules` ni `.env`; aportar salida real. |
| Web con datos demo; saldo insuficiente | PENDIENTE | Confirmación manual sin alterar BD ni falsificar estado. |
| Expo Go/iOS y API local; móvil funcional | PENDIENTE | Verificar en simulador o iPhone y registrar dispositivo. |
| **Video real de duración <= 05:00** web+móvil+saldo insuficiente | PENDIENTE | Grabar, medir duración, revisar privacidad y adjuntar el archivo al correo de entrega. |
| CI tres jobs **verdes en `main`** | REPORTADO POR DESARROLLADOR, ENLACE PENDIENTE | Registrar run URL, SHA de `main` y tres trabajos `success`. |
| Bitácora de IA y trazabilidad RF → tarea → prueba → commit | PENDIENTE AUDITAR | Revisar fallos y correcciones, no solo nombres de tareas. |
| Entrega por correo con enlaces y acceso | PENDIENTE | Comprobar destinatario con reclutador; no inventar correo. |

## 2. Comandos de evidencia

Desde raíz de `treo-wallet`:

```bash
node scripts/t32-delivery-audit.mjs
npm ci
npm run lint
npm run typecheck
npm run check:types
npm run test -w @treo/web
npm run build -w @treo/web
npm run test -w @treo/mobile
# Con PostgreSQL 16 disponible y SOLO treo_test migrada:
npm run db:migrate -w @treo/api -- --test
node scripts/ci-run-api-tests.mjs
# Validación Expo:
cd mobile && npx expo install --check && npx expo-doctor@latest && cd ..
git log --oneline --reverse
git status --short
```

**Nota:** para un **clon realmente limpio** seguir el README desde una nueva carpeta y configurar `.env` local con valores sintéticos; no basta repetir checks en la copia ya instalada. Ejecutar `db:seed` **solo** en una base nueva de desarrollo; el seed T-20 persistente no debe ejecutarse otra vez en una BD usada para la demo.

## 3. Registro de evidencia final

| Evidencia | Valor |
|---|---|
| Commit T-32 y merge de `main` | PENDIENTE |
| URL repositorio / permisos confirmados | PENDIENTE |
| Run CI verde `main` (URL) | PENDIENTE |
| SHA verificado del run de `main` | PENDIENTE |
| Clon limpio, fecha y SO | PENDIENTE |
| Resultado migraciones PostgreSQL | PENDIENTE |
| Resultado 17 suites API | PENDIENTE |
| Resultado pruebas web y build | PENDIENTE |
| Resultado pruebas móviles y Expo | PENDIENTE |
| Archivo del video adjunto al correo | PENDIENTE |
| Duración medida | PENDIENTE |
| Matriz manual y saldo insuficiente | PENDIENTE |
| Incidencias abiertas / decisión | PENDIENTE |

## 4. Límites que deben declararse

- Es un **MVP de dinero ficticio**. El uso de Expo Go y HTTP por LAN privada es solo de desarrollo; no es una certificación de seguridad ni bloquea todas las capturas nativas.
- `docs/aws-deploy.md` es una propuesta de despliegue productivo. T-31 proporciona CI **sin CD hacia AWS** ni recursos creados.
- Las advertencias/vulnerabilidades npm identificadas antes siguen pendientes de revisión separada, no se remedian con `--force`.
- El seed T-20 y el estrés persistente de T-19 crean registros inmutables, por eso no deben ejecutarse en cada checkout ni en bases no desechables.
- La ventana exacta «commit SQL exitoso + respuesta de red perdida» se simuló en tests: una desconexión manual no garantiza reproducirla.

## 5. Puerta G4

**No declarar T-32 DONE ni G4 cerrada** hasta tener: clon limpio verificado, video real <=5 min que incluye web + móvil + saldo insuficiente, CI verde sobre `main`, README y diagramas legibles, bitácora y historial completo, enlaces accesibles y evidencia de entrega. Marcar cualquier omisión como `PENDIENTE` o `NO REPRODUCIDO`, no como aprobado.
