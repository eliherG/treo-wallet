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
