# T-29 · Recorrido manual reproducible (Expo Go / iPhone 17)

**Alcance:** validación de login, almacenamiento de sesión, transferencias, OTP, rechazo, red inestable y cobertura visual al ir a segundo plano. Solo usuarios sintéticos, API local, red privada.

## Preparación

1. Tener PostgreSQL en ejecución, migraciones aplicadas y cuentas semilla `Treo Demo A` y `Treo Demo B` disponibles. Verificar credenciales sintéticas con el método habitual del proyecto; no documentar contraseñas reales.
2. Desde la raíz, terminal A: `npm run dev -w @treo/api`.
3. Terminal B: `cd mobile && EXPO_PUBLIC_API_URL=http://127.0.0.1:3000/api/v1 npx expo start --go --clear`. Seleccionar el simulador iPhone 17 (`i` o `Shift+I`).
4. Capturar resultados como **OK / FALLO / NO REPRODUCIDO**; no interpretar la ausencia de fallas como ejecución del escenario de red posterior a commit.

## Matriz manual

| ID | Acción | Resultado esperado | Resultado real | Evidencia | 
|---|---|---|---|---|
| M-01 | Contraseña incorrecta | Error accesible y permanencia en login | PENDIENTE | — |
| M-02 | Login válido, forzar cierre de Expo Go sin pulsar Salir, reabrir | Se restaura sesión con refresh rotativo | PENDIENTE | — |
| M-03 | Salir y reabrir app | Requiere login; token anterior revocado | PENDIENTE | — |
| M-04 | Inicio: cuentas, balances y movimientos | Solo datos del usuario, hasta 20 movimientos | PENDIENTE | — |
| M-05 | Transferencia de $1.25 a cuenta propia distinta, revisar y confirmar | Un débito y un abono, comprobante `COMPLETED` | PENDIENTE | — |
| M-06 | Transferencia > $5,000.00 dentro de cupo/saldo | OTP solicitado, sin recibo antes de confirmar | PENDIENTE | — |
| M-07 | OTP incorrecto (con operación propia pendiente) | Error, continúa pendiente, sin recibo falso | PENDIENTE | — |
| M-08 | OTP válido desde entorno sintético | `COMPLETED`; recibo solo después de confirmación backend | PENDIENTE | — |
| M-09 | Saldo insuficiente o límite excedido | `REJECTED` o error definitivo; no débito | PENDIENTE | — |
| M-10 | Desconectar red antes/durante envío, volver a conectar | Si incierto: conservar llave/payload y reconsultar folio o reintentar misma intención | PENDIENTE | — |
| M-11 | Reiniciar Expo Go con operación incierta o OTP pendiente | No ofrecer nueva intención hasta resolver la previa | PENDIENTE | — |
| M-12 | Con saldo/OTP visible, enviar a segundo plano y ver selector iOS | Capa opaca solicitada; registrar si el snapshot real muestra datos | PENDIENTE | — |

**Limitaciones:** una desconexión manual no prueba la ventana exacta posterior al commit del servidor; esa secuencia se simula con tests. La cobertura en `AppState` depende del tiempo de render de JS; Expo Go no asegura ocultación nativa de snapshots. No declarar prevención de capturas de pantalla. No usar contraseñas, JWT ni OTP en logs, capturas ni bitácora.

## Evidencia automatizada y puerta de calidad

- `npm run test -w @treo/mobile` combina la suite de `node:test` (T-26…T-29) con pruebas TSX de componentes renderizados con `jest-expo` y React Native Testing Library.
- `npm run test -w @treo/web`; `npm run lint`; `npm run typecheck`; `npm run check:types`; `npm run build -w @treo/web`.
- `cd mobile && npx expo install --check && npx expo-doctor@latest`.
- Documentar resultados reales, incidencias y correcciones en `specs/ai-log.md`; no hacer commit hasta resolver los bloqueos.
