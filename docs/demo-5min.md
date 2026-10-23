# T-32 · Guion de demostración (máximo cinco minutos)

**Destino:** video solicitado en el ejercicio Treo. **Estado:** guion listo; grabación real a cargo del desarrollador, fuera de Git.

## Preparación (antes de grabar)

- API + PostgreSQL + web + Expo Go/simulador encendidos. Mostrar solo usuarios sintéticos. Preparar credenciales en un gestor local, **nunca en pantalla ni código**.
- Confirmar que Demo A y B pueden iniciar sesión. Si se usó T-20, las 50 000 transferencias históricas **no deben resembrarse** antes del video.
- Tener un beneficiario **interno** registrado y dos cuentas propias distintas con fondos suficientes para una transferencia pequeña.
- Para **saldo insuficiente**, elegir una cuenta cuyo saldo visible sea inferior al importe de prueba (preferentemente <=$5 000 para evitar que el umbral OTP desvíe el escenario). La cuenta de $2 000 originalmente sembrada admite una prueba de $2 000.01 **solo si no recibió movimientos posteriores**. Ajusta el importe a los saldos **reales actuales**; no modifiques saldo manualmente en la BD.
- Comprobar que la webcam/recortado no muestre archivos `.env`, contraseñas, JWT, OTP, URLs privadas ni información personal.
- Activar grabación de **pantalla** (QuickTime/OBS o herramienta equivalente). El audio de voz es opcional, pero conviene narrar la decisión técnica. Cronometrar el archivo exportado antes de entregar. No presentar una captura vacía como demostración.

## Secuencia sugerida (4:45 objetivo)

| Intervalo | Pantalla | Acción / mensaje |
|---|---|---|
| **00:00–00:25** | VS Code y Swagger | Identificar monorepo y `http://127.0.0.1:3000/api-docs`; enseñar contratos reales, no rutas supuestas. |
| **00:25–01:05** | Web | Login Demo A; dos cuentas con saldos exactos. Explicar centavos enteros y control de acceso por propietario. |
| **01:05–01:45** | Web | Abrir beneficiarios, confirmar el interno ya registrado; seleccionar origen/destino, importe pequeño, concepto y referencia. Mostrar pantalla de revisión previa. |
| **01:45–02:15** | Web | Confirmar una transferencia; ver comprobante `COMPLETED` y movimiento, sin doble débito. |
| **02:15–02:55** | Web | Demostrar **saldo insuficiente** con una cuenta/importe válidos según saldos visibles; mostrar `REJECTED` o error de fondos y ausencia de comprobante de éxito. |
| **02:55–03:25** | Web | Historial con filtros y cursor; verificar cargo/abono y referencia. |
| **03:25–04:00** | iPhone 17 (Expo Go) | Login sintético; cuentas, saldos y últimos 20 movimientos. |
| **04:00–04:35** | Móvil | Beneficiario interno, transferencia pequeña, revisión y comprobante **solo si** estado `COMPLETED`. |
| **04:35–04:45** | Repo/Actions | Mostrar CI verde en `main` y diagrama Mermaid AWS; indicar que AWS es **solo una propuesta sin despliegue**. |

**Si una pantalla tarda más:** priorizar web + móvil + rechazo por saldo insuficiente; no alargar por encima de 05:00. Se pueden preparar navegadores/simulador y ventanas **antes** de grabar, pero no editar las pruebas de forma engañosa. La secuencia OTP (> $5 000) y la pérdida de red pueden mostrarse en la defensa técnica o mediante tests, si no caben; no afirmar que fueron grabadas.

## Narrativa técnica breve

- «El dinero se contabiliza dentro de una transacción PostgreSQL; el ledger usa asientos balanceados y restricciones, no cálculos con `float`».
- «Una llave de idempotencia identifica la intención; ante red incierta conservamos payload y llave y reconciliamos el estado».
- «Refresh web via cookie segura de acuerdo con el contexto local; móvil almacena refresh en SecureStore. Ninguna operación pendiente es comprobante».
- «CI valida API/PostgreSQL, web y móvil. AWS es la arquitectura propuesta; no se desplegó».

## Evidencia que se registra después de grabar

| Campo | Valor a comprobar (no inventar) |
|---|---|
| Archivo o enlace del video | PENDIENTE |
| Duración comprobada | PENDIENTE — requisito **<= 05:00** |
| Fecha de grabación | PENDIENTE |
| Web visible con saldo insuficiente | PENDIENTE |
| Flujo móvil visible | PENDIENTE |
| Sin datos/secretos reales | PENDIENTE |
| Enlace accesible a evaluadores | PENDIENTE |

## Para la defensa técnica de 60 minutos

Prepárate para justificar: (1) por qué monorepo y monolito modular y no microservicios; (2) constraints y triggers diferidos PostgreSQL, permisos e inmutabilidad; (3) bloqueos y concurrencia; (4) idempotencia, replay, red caída y reconciliación; (5) refresh rotativo, OTP, CORS/CSRF y almacenamiento móvil; (6) seed de 100k movimientos y `EXPLAIN ANALYZE`; (7) límites de Expo Go y AWS propuesto; (8) qué errores detectó la IA y cómo se corrigieron; (9) CI real, errores de runner y correcciones de T-31.
