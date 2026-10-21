# Treo Wallet — Especificación de requisitos

**Archivo:** `/specs/requirements.md`  
**Versión:** 0.3 — especificación aprobada  
**Fecha:** 2026-10-21  
**Estado:** **APROBADO** por el desarrollador el 2026-10-21: catálogo RF-01 a RF-14, criterios CA y decisiones D-01 a D-08. No se ha ejecutado código de aplicación ni pruebas.

> Este documento expresa **qué debe hacer el producto**. El modelo ER, OpenAPI 3.1, mecanismos precisos de concurrencia, esquema de tablas y flujos visuales se desarrollarán en `design.md`. Las decisiones D-01 a D-08 fueron aprobadas junto con esta versión; cualquier cambio posterior requiere control de cambios. Los criterios conservan los IDs del catálogo ya aprobado.

## 1. Propósito y alcance

Treo Wallet es una billetera **simulada** en pesos mexicanos (MXN). Los usuarios pueden registrarse, iniciar sesión, consultar sus cuentas, guardar beneficiarios con CLABE válida, transferir fondos **solo entre cuentas de Treo**, consultar movimientos, cumplir un límite diario y confirmar transferencias elevadas mediante OTP simulado. Un cliente web y una aplicación móvil consumen la misma API.

**No incluido:** SPEI, bancos externos, dinero real, apertura bancaria regulada, depósitos/retiros reales, KYC, comisiones, cambio de moneda, despliegue real en AWS. El componente AWS es únicamente una propuesta documentada.

**Principio principal:** si una transferencia no termina correctamente, el dinero debe permanecer íntegro. Nunca se confirma un débito sin su crédito correspondiente.

## 2. Convenciones

- `RF-XX`: requerimiento funcional aprobado como alcance.
- `CA-RFXX-NN`: criterio de aceptación verificable mediante Given/When/Then.
- `D-XX`: decisión de producto aprobada para este MVP; cualquier cambio requiere registro documental.
- `RNF-XX`: requisito técnico o no funcional exigido por Treo.
- `Given` = Dado; `When` = Cuando; `Then` = Entonces.
- El servidor y PostgreSQL determinan permisos, saldos y resultados; ningún cliente calcula ni impone las reglas financieras de manera autoritativa.

## 3. Requerimientos funcionales (catálogo aprobado)

| ID | Título | Resultado mínimo | Clientes |
|---|---|---|---|
| RF-01 | Registro de usuario | Crear una identidad de acceso única y protegida | API, web |
| RF-02 | Autenticación y sesiones | Acceder con credenciales, JWT corto, refresh rotativo y logout | API, web, móvil |
| RF-03 | Consulta de cuentas y saldos | Listar únicamente las cuentas y saldos propios | API, web, móvil |
| RF-04 | Alta de beneficiario | Guardar nombre, alias y CLABE de 18 dígitos con checksum correcto | API, web |
| RF-05 | Consulta de beneficiarios | Listar los propios y seleccionarlos como destinatarios | API, web, móvil |
| RF-06 | Transferencia a beneficiario interno | Transferir a otra cuenta de Treo con concepto y referencia | API, web, móvil |
| RF-07 | Transferencia entre cuentas propias | Transferir entre dos cuentas distintas del mismo usuario | API, web |
| RF-08 | Revisión y confirmación | Mostrar resumen y confirmar una única intención de transferencia | API, web, móvil |
| RF-09 | Límite diario | Rechazar operaciones que excedan el cupo del día | API; mensajes web/móvil |
| RF-10 | Confirmación OTP | Solicitar un código de un solo uso para importes altos | API, web, móvil |
| RF-11 | Historial de movimientos | Filtrar por fecha y tipo; paginar por cursor; móvil últimos 20 | API, web, móvil |
| RF-12 | Estado y comprobante | Consultar resultado real y mostrar comprobante propio | API, web, móvil |
| RF-13 | Idempotencia y recuperación | No duplicar cargos por doble clic, reenvío o red inestable | API, web, móvil |
| RF-14 | Integridad financiera y auditoría | Saldos no negativos, asientos balanceados y auditoría append-only | API, PostgreSQL |

## 4. Decisiones de negocio aprobadas para el MVP

Treo no fija estos valores. Fueron definidos como **supuestos de producto del MVP y aprobados** el 2026-10-21; no forman parte del enunciado original.

| ID | Propuesta | Razón |
|---|---|---|
| D-01 | Registro con `name` (2–100 caracteres), `email` válido/canónico y único, `password` de 12–128 caracteres; hash Argon2id; sin verificación de correo real | Evitar KYC e infraestructura de email fuera de alcance |
| D-02 | Seed local: usuario A con **dos** cuentas de $10,000.00 y $2,000.00, usuario B con **una** cuenta de $5,000.00; alta normal crea una cuenta con $0.00; solo seed/migración de datos de demostración inicializa fondos | Permite probar cuentas propias, destinatarios y saldo insuficiente sin depósitos reales |
| D-03 | Puede guardarse una CLABE con checksum válido aunque no corresponda a una cuenta Treo, pero **la transferencia se rechaza** si no se resuelve internamente; misma CLABE no se duplica en beneficiarios del mismo propietario | Separar validación de formato de existencia de destinatario interno |
| D-04 | Concepto: 1–140 caracteres tras `trim`; referencia: cadena de **1–7 dígitos**, admite ceros iniciales y no se trata como número aritmético | Evitar pérdida de ceros y entradas indeterminadas |
| D-05 | Cupo máximo de transferencias **$20,000.00 MXN por usuario y día calendario `America/Mexico_City`**, compartido entre sus cuentas. Cuenta el importe total de las operaciones completadas en ese día; cupo verificado y consumido atómicamente en la confirmación efectiva | Regla clara para concurrencia y medianoche; montos modificables por configuración |
| D-06 | Transferencias entre cuentas propias **sí** consumen límite diario y **sí** requieren OTP si exceden el umbral; transferencias de una cuenta hacia ella misma se rechazan | Modelo uniforme, sin vías alternativas para eludir reglas |
| D-07 | OTP para transferencias de importe **estrictamente mayor** a $5,000.00; expira tras **5 minutos**, máximo **3 intentos incorrectos**, un solo uso; en modo local/test usar un código fijo de demostración configurable (nunca habilitado en producción), con desafío y consumo por operación | Cumple simulación reproducible; explícitamente inseguro para producción, donde deberá reemplazarse por un segundo factor real |
| D-08 | Movimientos `DEBIT` y `CREDIT`; filtros por día civil de Ciudad de México con `from` inclusivo y `to` inclusivo para el usuario, internamente convertidos a intervalo UTC semiabierto; orden `(created_at DESC, id DESC)` y cursor opaco | Orden estable e interpretación determinista de fechas |

**Decisiones transversales para hacer los CA ejecutables:** moneda única MXN; montos enviados como **cadena decimal** exacta, de 1 centavo en adelante y máximo dos decimales (por ejemplo `"1500.25"`); centavos enteros de 64 bits en DB y respuestas JSON como cadenas de centavos; **no redondear**. Se utiliza `UTC` en almacenamiento de instantes. Una transferencia no puede tener cuenta origen y destino iguales. Una operación incierta nunca debe informarse al usuario como exitosa sin verificación del servidor.

**Regla temporal precisa para D-05/D-07:** el día del cupo se determina en el **instante de contabilización** de la operación, no al crear una solicitud pendiente OTP. Las operaciones pendientes no consumen cupo; al confirmar se revalidan saldo y cupo dentro de la transacción. Si cruza medianoche, utiliza el día nuevo y no consume el anterior. Si hay una confirmación y otra operación concurrentes, las dos compiten por el mismo contador/filas bloqueadas.

## 5. Criterios de aceptación Given / When / Then

### RF-01 — Registro de usuario

**CA-RF01-01 — Alta válida.** Given un visitante con nombre, correo nuevo y contraseña que satisfacen D-01; When se registra; Then se crea **una** identidad y se devuelve una confirmación sin secretos.

**CA-RF01-02 — Validación.** Given datos incompletos, nombre inválido, correo mal formado o contraseña fuera de política; When intenta registrarse; Then recibe error RFC 7807 y no se crea ninguna identidad.

**CA-RF01-03 — Duplicación.** Given que el correo ya existe en forma canónica; When intenta registrarse con cualquier capitalización equivalente; Then la identidad no se duplica y obtiene un error controlado.

**CA-RF01-04 — Concurrencia en registro.** Given dos peticiones concurrentes para el mismo correo nuevo; When llegan juntas; Then la base de datos permite como máximo una alta y la otra falla de manera controlada.

**CA-RF01-05 — Contraseña protegida.** Given un registro válido; When queda almacenado; Then la contraseña existe únicamente como hash seguro y ni contraseña ni hash se devuelven en API o logs.

**CA-RF01-06 — Registro frente a cuenta financiera.** Given un registro exitoso fuera del seed; When consulta cuentas tras autenticarse; Then existe una cuenta demo con saldo **$0.00**, sin generación encubierta de fondos.

### RF-02 — Autenticación y sesiones

**CA-RF02-01 — Login correcto.** Given credenciales válidas; When inicia sesión; Then recibe un access JWT de vida corta y un refresh token rotativo conforme al contrato.

**CA-RF02-02 — Credenciales incorrectas.** Given correo o contraseña inválidos; When intenta login; Then recibe fallo controlado sin revelar cuál campo es incorrecto.

**CA-RF02-03 — Autorización.** Given que falta JWT, está caducado, manipulado o pertenece a otro usuario; When solicita un recurso privado; Then la API rechaza la solicitud sin exponer datos ajenos.

**CA-RF02-04 — Rotación.** Given un refresh válido; When solicita renovación; Then se invalida el refresh anterior y se emiten nuevas credenciales; el anterior no puede renovarlas de nuevo.

**CA-RF02-05 — Reutilización de refresh.** Given un refresh ya rotado; When se presenta otra vez; Then se rechaza y se aplica la política de revocación de la familia de tokens que detalle `design.md`.

**CA-RF02-06 — Logout y rate limit.** Given una sesión vigente; When cierra sesión; Then se revoca su refresh correspondiente. Given múltiples intentos rápidos de login; When supera el umbral configurado; Then se limita la tasa sin revelar secretos.

### RF-03 — Consulta de cuentas y saldos

**CA-RF03-01 — Cuentas propias.** Given un usuario autenticado con dos cuentas; When consulta cuentas; Then ve solamente sus dos cuentas con moneda MXN y saldos exactos como cadenas de centavos.

**CA-RF03-02 — Sin cuentas ajenas.** Given un usuario A; When solicita cuentas de B o intenta acceder a un ID ajeno; Then no recibe datos de B.

**CA-RF03-03 — Saldo actualizado.** Given una transferencia completada; When origen y destino consultan sus cuentas; Then ambos ven exactamente los saldos correspondientes a una única aplicación de débito/crédito.

**CA-RF03-04 — Lista vacía y disponibilidad.** Given un usuario sin cuentas (fixture de prueba); When consulta; Then obtiene una colección vacía válida; no una respuesta errónea de servidor.

### RF-04 — Alta y validación de beneficiarios

**CA-RF04-01 — CLABE válida.** Given nombre, alias y una CLABE de exactamente 18 dígitos con dígito verificador correcto; When la registra; Then el beneficiario queda asociado al usuario.

**CA-RF04-02 — CLABE inválida.** Given una CLABE de 17/19 dígitos, con letras o checksum incorrecto; When intenta guardarla; Then se rechaza y no se crea beneficiario.

**CA-RF04-03 — CLABE externa válida.** Given una CLABE con checksum correcto pero no asociada a Treo; When la registra; Then puede guardarse, aunque no será transferible hasta que exista una cuenta interna resoluble.

**CA-RF04-04 — Duplicado y autorización.** Given que el propietario ya registró esa CLABE; When intenta agregarla otra vez; Then se rechaza el duplicado. Given un usuario distinto; When agrega su propio registro; Then no se expone ni modifica el de otro usuario.

### RF-05 — Consulta de beneficiarios

**CA-RF05-01 — Lista propia.** Given beneficiarios registrados para A y B; When A consulta; Then ve únicamente los de A con nombre, alias y CLABE enmascarada para presentación.

**CA-RF05-02 — Vacío.** Given que A no tiene beneficiarios; When consulta; Then recibe lista vacía y el cliente presenta un estado vacío comprensible.

**CA-RF05-03 — Elección.** Given que A posee un beneficiario válido; When lo selecciona en web o móvil; Then el cliente envía la referencia autorizada a ese beneficiario; el servidor vuelve a verificar su pertenencia.

### RF-06 — Transferencia a beneficiario interno

**CA-RF06-01 — Transferencia exitosa.** Given origen propio con fondos suficientes, beneficiario interno de otro usuario, concepto y referencia válidos, cupo disponible y autorización requerida satisfecha; When confirma una transferencia de $150.25; Then origen disminuye 15,025 centavos, destino aumenta 15,025 y existe un único resultado `COMPLETED`.

**CA-RF06-02 — Saldo insuficiente.** Given saldo menor que importe; When intenta transferir; Then se rechaza sin cambios en origen, destino, ledger o cupo.

**CA-RF06-03 — Destinatario inexistente o ajeno.** Given beneficiario no interno, inexistente o perteneciente a otro usuario; When intenta transferir; Then recibe error controlado y no se mueve dinero.

**CA-RF06-04 — Monto inválido.** Given cero, negativo, más de dos decimales, notación exponencial o importe mal formado; When solicita transferir; Then se rechaza sin redondeo ni asiento financiero.

**CA-RF06-05 — Concepto y referencia inválidos.** Given concepto vacío o mayor a 140 caracteres, o referencia no numérica o de más de 7 dígitos; When intenta transferir; Then recibe error de validación sin movimiento de dinero. La referencia `"0001234"` conserva sus ceros iniciales.

**CA-RF06-06 — Operaciones simultáneas.** Given saldo de $1,000.00 y varias transferencias concurrentes que en conjunto exceden el saldo; When se procesan; Then solamente se completan las que caben realmente; el saldo nunca es negativo.

### RF-07 — Transferencia entre cuentas propias

**CA-RF07-01 — Entre cuentas propias.** Given A con dos cuentas diferentes y saldo suficiente; When mueve $300.00 de una a otra; Then se descuenta y acredita una única vez, sin beneficiario.

**CA-RF07-02 — Misma cuenta.** Given que origen y destino son idénticos; When intenta transferir; Then se rechaza sin cambios ni movimientos.

**CA-RF07-03 — Cuenta no propia.** Given un destino directo que no pertenece al usuario; When intenta utilizarlo como transferencia entre cuentas propias; Then se rechaza; para enviar a B debe usar un beneficiario suyo.

**CA-RF07-04 — Mismas reglas.** Given una transferencia entre cuentas propias que excede el umbral OTP o consume el cupo; When se intenta; Then se aplica exactamente la misma política D-05/D-07 que a transferencias a beneficiarios.

### RF-08 — Revisión y confirmación

**CA-RF08-01 — Resumen previo.** Given una solicitud con importe, cuenta de origen, destino, concepto y referencia; When llega a confirmación web o móvil; Then muestra esos datos antes del envío y exige acción expresa del usuario.

**CA-RF08-02 — Envío repetido.** Given una confirmación ya iniciada; When el usuario hace doble clic o toca varias veces Enviar; Then el cliente deshabilita envíos repetidos y conserva la misma llave de idempotencia; aun si llegan dos peticiones el servidor no duplica fondos.

**CA-RF08-03 — Error recuperable.** Given una validación fallida o saldo insuficiente; When muestra el resultado; Then el usuario ve un error claro, puede corregir la intención y crear una llave nueva para una solicitud nueva.

**CA-RF08-04 — OTP.** Given una operación que requiere OTP; When el usuario solicita enviarla; Then la interfaz pasa al estado de confirmación OTP en lugar de mostrar falsamente un comprobante de éxito.

### RF-09 — Límite diario

**CA-RF09-01 — Dentro del cupo.** Given cupo diario restante de $400.00; When completa una transferencia de $400.00; Then la operación se aprueba si demás reglas se cumplen, dejando cupo restante en $0.00.

**CA-RF09-02 — Excede el cupo.** Given cupo restante de $400.00; When intenta completar $400.01; Then se rechaza sin tocar fondos.

**CA-RF09-03 — Varias cuentas y concurrencia.** Given un usuario con dos cuentas y $500.00 de cupo; When envía simultáneamente dos transferencias de $400.00 desde cuentas distintas; Then no pueden completarse las dos: el consumo compartido se protege atómicamente.

**CA-RF09-04 — Medianoche.** Given una transferencia completada el día X antes de las 00:00 en `America/Mexico_City` y otra el día X+1; When se calcula el límite; Then se imputan a días diferentes sin resetear datos históricos ni depender de la zona horaria del dispositivo.

**CA-RF09-05 — OTP cruza medianoche.** Given un intento creado antes de medianoche pero confirmado después; When se completa; Then utiliza el cupo del día de **contabilización**, previa revalidación de saldo y límites.

**CA-RF09-06 — Rechazos y reintentos.** Given operación rechazada, OTP pendiente o replay idempotente de una completada; When se calcula consumo; Then no se carga dos veces el cupo y solo transferencias efectivamente completadas lo consumen.

### RF-10 — Confirmación OTP

**CA-RF10-01 — Umbral.** Given importe exactamente $5,000.00; When solicita transferir; Then no requiere OTP por D-07. Given importe $5,000.01; When solicita; Then requiere OTP antes de mover dinero.

**CA-RF10-02 — Pendiente sin fondos movidos.** Given transferencia que requiere OTP; When crea la intención; Then queda `PENDING_CONFIRMATION`, sin débito, crédito ni consumo de cupo.

**CA-RF10-03 — Código correcto.** Given desafío vigente sin usar; When confirma con OTP válido; Then la transferencia se ejecuta exactamente una vez, después de revalidar saldo y cupo.

**CA-RF10-04 — Incorrecto, vencido o agotado.** Given OTP incorrecto, expirado o después de tres fallos; When solicita confirmar; Then no completa transferencia ni mueve fondos.

**CA-RF10-05 — Código reutilizado.** Given OTP ya consumido en una confirmación exitosa; When intenta volverlo a usar; Then no se ejecuta otra operación; debe consultarse el estado de la transferencia original.

**CA-RF10-06 — Modo demo aislado.** Given ejecución en producción; When solicita una transferencia elevada; Then no está habilitado el OTP fijo de desarrollo. En modo local/test se admite la simulación explícita de D-07 sin registrarlo en logs.

### RF-11 — Historial de movimientos

**CA-RF11-01 — Movimientos propios.** Given una cuenta con débitos y créditos; When consulta historial; Then obtiene solo los movimientos autorizados, con importe exacto, fecha, tipo y referencia.

**CA-RF11-02 — Filtros.** Given movimientos en varios días y tipos; When filtra por intervalo y `DEBIT` o `CREDIT`; Then obtiene únicamente coincidencias; se valida que la fecha inicial no sea posterior a la final.

**CA-RF11-03 — Cursor.** Given más movimientos que el tamaño de página; When solicita páginas sucesivas; Then recibe cursor opaco, sin `OFFSET`, en orden estable `(created_at DESC, id DESC)` sin repetir ni omitir filas existentes durante el recorrido normal.

**CA-RF11-04 — Nuevas filas durante navegación.** Given que se consulta una primera página; When aparece un movimiento nuevo antes de pedir la segunda; Then el cursor conserva la frontera del recorrido y no duplica filas ya vistas.

**CA-RF11-05 — Vacío y móvil.** Given filtros sin resultados; When consulta web; Then se muestra estado vacío. When consulta la aplicación móvil; Then recibe y muestra como máximo los 20 movimientos más recientes.

**CA-RF11-06 — Paginación segura.** Given un cursor manipulado o filtro de otra cuenta; When el cliente lo presenta; Then la API rechaza la solicitud inválida o no devuelve recursos ajenos.

### RF-12 — Estado y comprobante

**CA-RF12-01 — Consulta del resultado real.** Given transferencia propia con identificador conocido; When pide su estado; Then recibe un estado persistido verificable, no un estado inferido del cliente.

**CA-RF12-02 — Comprobante final.** Given transferencia `COMPLETED`; When solicita comprobante; Then ve identificador, fecha, origen/destino enmascarados, importe, concepto, referencia y estado.

**CA-RF12-03 — Pendiente o rechazada.** Given transferencia en `PENDING_CONFIRMATION` o `REJECTED`; When consulta; Then la interfaz lo informa explícitamente y no muestra comprobante de transferencia completada.

**CA-RF12-04 — Confidencialidad.** Given transferencia perteneciente a B; When A la consulta por ID; Then no obtiene el recurso ni datos sensibles.

### RF-13 — Idempotencia y recuperación de red

**CA-RF13-01 — Doble solicitud idéntica.** Given la misma identidad, llave y payload canónico; When llegan dos peticiones simultáneas; Then hay como máximo **una** transferencia real y ambas obtienen resultado consistente o indicación temporal de operación en curso.

**CA-RF13-02 — Replay completado.** Given transferencia `COMPLETED` con llave persistida; When se repite la misma solicitud; Then se recupera el resultado, sin nuevo débito/crédito ni consumo de cupo.

**CA-RF13-03 — Misma llave, distinto payload.** Given llave previamente utilizada; When se presenta con diferente importe, origen, destino, concepto o referencia; Then se rechaza la colisión sin movimiento adicional.

**CA-RF13-04 — Pérdida de red.** Given que la app pierde conexión después de enviar una solicitud pero antes de recibir respuesta; When recupera internet; Then consulta el estado del intento o reintenta con **la misma llave** hasta conocer el resultado; jamás asume fracaso ni crea una segunda intención automáticamente.

**CA-RF13-05 — Alcance por identidad.** Given dos usuarios diferentes con el mismo valor textual de llave; When envían solicitudes independientes; Then no se confunden entre sí. Cada llave es única dentro del alcance definido por usuario.

**CA-RF13-06 — Falla intermedia.** Given una excepción o caída antes del commit de PostgreSQL; When se recupera el servicio y se reintenta; Then solo existen los efectos de un commit completo o ninguno.

### RF-14 — Integridad financiera y auditoría

**CA-RF14-01 — Doble entrada.** Given transferencia `COMPLETED` por 123 centavos; When se inspeccionan sus asientos; Then existe débito por -123 y crédito por +123, cuya suma es exactamente cero.

**CA-RF14-02 — Integridad desde PostgreSQL.** Given intento de insertar o confirmar asientos desbalanceados, crear saldo negativo o referencias inválidas; When se ejecuta contra DB; Then restricciones/trigger rechazan la transacción, incluso sin validación previa del servicio.

**CA-RF14-03 — Todo o nada.** Given una falla después de intentar el débito pero antes del crédito; When se aborta la transacción; Then no persiste ninguno de los cambios financieros parciales.

**CA-RF14-04 — Auditoría de solo inserción.** Given el rol de base de datos de la aplicación; When intenta actualizar o borrar registros de auditoría; Then PostgreSQL deniega la operación; una transferencia deja evidencia auditable sin guardar secretos.

**CA-RF14-05 — Prueba de concurrencia.** Given cuenta con saldo conocido; When se disparan al menos **100 intentos simultáneos** de transferencia desde esa cuenta; Then ninguna cuenta queda negativa, no hay duplicados, los asientos cuadran y el saldo final es igual al inicial menos débitos completados más créditos completados, al centavo.

**CA-RF14-06 — Consistencia de errores.** Given error de autorización, validación o falla inesperada; When la API responde; Then utiliza Problem Details RFC 7807, request ID y no expone trazas, claves ni CLABE completa.

## 6. Requisitos técnicos/no funcionales (obligatorios)

| ID | Verificación exigida |
|---|---|
| RNF-01 | Node.js 20+, Express, TypeScript `strict`, TypeORM, PostgreSQL 15+, estructura por módulos o capas; lógica financiera fuera de los handlers. |
| RNF-02 | TypeORM migraciones; `synchronize: false`; foreign keys, `CHECK`, unicidad de idempotencia, trigger/restricción DB para suma cero de asientos. |
| RNF-03 | Zod o equivalente; errores RFC 7807 sin detalles internos; Swagger UI/Redoc sobre OpenAPI 3.1 navegable local. |
| RNF-04 | JWT acceso corto; refresh rotativo; contraseñas Argon2id/bcrypt; rate limiting login; registros JSON con request ID y secretos enmascarados. |
| RNF-05 | PostgreSQL transaction por transferencia; `SELECT … FOR UPDATE` en orden determinista (o `SERIALIZABLE` con reintentos); consumo diario atómico; integridad garantizada por DB. |
| RNF-06 | Historial indexado y cursor; `EXPLAIN ANALYZE` documentado usando **al menos 100,000 movimientos** generados por seed real. |
| RNF-07 | Pruebas unitarias de CLABE, montos y servicios; integración con PostgreSQL real de idempotencia, límite, saldo y ledger; concurrencia de 100+ intentos. |
| RNF-08 | Web React 18+ y TS, TanStack Query o equivalente, estados de carga/vacío/error, accesibilidad, `Intl.NumberFormat('es-MX')`, pruebas Testing Library con saldo insuficiente. |
| RNF-09 | Móvil React Native + Expo + TS, tokens en `expo-secure-store` o equivalente seguro, no `AsyncStorage`, recuperación de red, ocultar información sensible al fondo. |
| RNF-10 | Monorepo con tipos API compartidos preferentemente generados desde OpenAPI; scripts `npm run db:migrate`, `npm run db:seed`, `npm run dev`; README reproducible. |
| RNF-11 | Documento `/docs/aws-deploy.md`: diagrama Mermaid; cómputo y alternativas, RDS/Aurora, Multi-AZ, backup/PITR, RPO/RTO, web, móvil, observabilidad/auditoría, CI/CD OIDC, entornos, pooling/RDS Proxy, escala 100x e IaC. No desplegar. |
| RNF-12 | CI en verde con lint y pruebas de API/web/móvil; historial Git sin squash, specs previas al código, `ai-log.md` honesto, demo web+móvil ≤5 min con saldo insuficiente; preparación de defensa de 60 min. |

**Nota sobre seguridad móvil:** el método preciso para ocultar la vista en segundo plano y las limitaciones de Expo Go se documentarán en el diseño y README. **Nota sobre auditoría:** la tabla append-only y sus privilegios deben verificarse también con pruebas DB.

## 7. Matriz de cobertura de pruebas prevista (NO ejecutada)

| Grupo | Criterios cubiertos | Nivel |
|---|---|---|
| Registro/identidad | RF-01, RF-02 | Unitario + integración API/PostgreSQL |
| Beneficiarios/CLABE | RF-04, RF-05 | Unitario checksum + integración |
| Saldos y transferencias | RF-03, RF-06, RF-07, RF-14 | Integración contra PostgreSQL real |
| UI web/móvil | RF-03, RF-05, RF-08, RF-11, RF-12, RF-13 | Testing Library web + pruebas cliente móvil |
| Concurrencia/idempotencia | RF-06, RF-09, RF-13, RF-14 | Integración paralela 100+ |
| OTP y calendario | RF-09, RF-10 | Integración con reloj controlable, borde de medianoche |
| Rendimiento del historial | RF-11 | Seed 100,000 + `EXPLAIN ANALYZE` real |
| Controles PostgreSQL | RF-14 | Tests de constraints, triggers, permisos de auditoría |

La implementación deberá trazar `RF-XX → CA-RFXX-NN → diseño → T-XX → commit → prueba`. No se podrá marcar un CA como satisfecho sin ejecutar su evidencia correspondiente.

## 8. Alcance por cliente

| Función | API | Web | Móvil |
|---|:---:|:---:|:---:|
| Registro | ✓ | ✓ | Opcional |
| Inicio de sesión y consulta de saldos | ✓ | ✓ | ✓ |
| Alta de beneficiario | ✓ | ✓ | No exigido |
| Selección de beneficiario registrado | ✓ | ✓ | ✓ |
| Transferencia a beneficiario | ✓ | ✓ | ✓ |
| Transferencia entre cuentas propias | ✓ | ✓ | No exigido |
| Historial con filtros y paginación cursor | ✓ | ✓ | No exigido |
| Últimos 20 movimientos | ✓ | ✓ | ✓ |
| OTP, recuperación de red y consulta de estado | ✓ | ✓ | ✓ |

**Estados de interfaces obligatorios:** carga, vacío, éxito, error, pendiente de confirmación y resultado incierto por desconexión cuando sea aplicable. Los detalles de pantallas van en `design.md`.

## 9. Control de cambios y aprobaciones

| Fecha | Versión | Cambio | Aprobación |
|---|---|---|---|
| 2026-10-21 | 0.1 | Inventario RF-01 a RF-14 | Catálogo aprobado por el desarrollador |
| 2026-10-21 | 0.2 | Propuesta de criterios RF-01 y D-01 | No hubo aprobación explícita de criterios |
| 2026-10-21 | 0.3 | Todos los CA para RF-01 a RF-14; D-01 a D-08; RNF y cobertura de pruebas | **Aprobado íntegramente por el desarrollador** |

**Siguiente fase:** elaborar y revisar `design.md` y `tasks.md`, efectuar el primer commit de `AGENTS.md` y `/specs` **antes** de implementar código de aplicación. La aprobación documental no implica que existan pruebas ejecutadas ni código validado.
