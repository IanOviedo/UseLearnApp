# useLearn — estado real verificado (última pasada: 30/09/2026)

Este archivo reemplaza al panorama del documento de diseño, que quedó desactualizado.
No describe lo que *debería* ser: describe lo que **verifiqué** en el repo y en la base
real, después de cerrar **Fase A (cimientos)**, **Fase B (velocidad)**, **C1**
(modalidades de entrada), **C2** (rutas y fases persistidas), **D** (Enseñar/Practicar)
y el **filtro de calidad de preguntas** (validación local + juez semántico).

> **Actualización 30/09/2026 (2ª pasada):** se agregó la §12 (plan de rediseño: el código decide, el modelo
> redacta) y se ajustaron §5, §6 y §11 según esa revisión. **Lo nuevo es plan, no estado verificado.**
> El orden de trabajo vigente es el de §12.9.

> **Corrección 30/09/2026 (3ª pasada):** la base de verificación decía `71e04b6` y entre medio
> entró `8a4744a` ("Tanda 1: sub-temas por bloques con presets de calidad"), que **no estaba
> reflejado en §1, §5, §7, §12.1 ni §12.2**. Los cinco lugares que lo describían como pendiente
> quedaron desactualizados y se corrigieron acá. Se verificó por **lectura de código + SQL sobre
> `useLearn.db` + una corrida real contra Ollama** (no con humos nuevos: la Tanda 1 no agregó asserts).
>
> **Después, mismo día:** se implementó el **Paso 2b** (el corte final que se llevaba el final del
> documento) y se instaló la primera infraestructura de tests (`vitest`, 39 tests). El §6 ítem 14
> pasa de "0 tests" a "39 sobre la capa determinista" y el 2b queda cerrado. Ver §12.2.2 y §13.

Base de la verificación (HEAD `ff7007e`, con `8a4744a` adentro):

- Lectura completa de `lib/*`, `app/api/**`, `app/page.tsx`, `app/sondeo/[id]/page.tsx`, `components/**`.
- Consultas SQL directas a `useLearn.db` (sesiones, subtemas, preguntas, respuestas).
- Pruebas end-to-end contra `next dev` + Ollama `gemma3:4b`, con un cliente que emula al front:
  GET inicial → merge `responder`+`siguiente` → caché de lote en memoria → pre-generación.
- Humos end-to-end en PowerShell contra una base temporal: `.smoke-c1.ps1` (21 asserts) y
  `.smoke-fase-cd.ps1` (36 asserts), corridos con `gemma4:e2b` y con el default `gemma4:26b`.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- **3ª pasada:** medición de la cobertura de sub-temas con un script temporal (borrado después) que
  replicó `extraerSubtemas` paso a paso contra Ollama, sobre `.smoke-texto-largo.txt`. Resultados en §12.2.

> **Advertencia de método (30/09):** `tsc` y `build` en verde **no** significan que una
> feature esté conectada. El juez semántico compilaba perfecto y no se llamaba desde ningún
> lado: el usuario recibía las preguntas sin filtrar. Ver §10.1. Antes de dar por buena una
> feature nueva, hay que grepar quién la invoca.

## 1. Estado por módulo

| Módulo | Archivos | Estado verificado |
|---|---|---|
| Ingesta | `app/page.tsx`, `app/api/archivos/extraer-pdf`, `lib/texto.ts` | Texto/md pegado + PDF. El `topic` ya no es `slice(0,50)`: `derivarTema()` saltea encabezados y nombres de archivo (en la base se lee "Challenge: Date Counter (Step + Count + fecha dinámica)"). Falta solo el export a Obsidian y el import de notas (Fase E). Con C1 hay modalidades de entrada (apunte pegado/PDF o tema libre con nivel + objetivo) y confirmación de sub-temas: la landing muestra lo detectado y podés desmarcar lo que no te interesa antes de que arranque el sondeo. |
| Sub-temas | `lib/ollama.ts::extraerSubtemas`, `lib/texto.ts::dividirEnBloques`, `lib/config.ts::PRESETS_CALIDAD` | Usa el modelo y el proveedor elegidos en Ajustes. **Desde `8a4744a` (Tanda 1) la extracción ya NO manda un head fijo:** parte el texto en bloques (`dividirEnBloques`, con solape de 300 chars) y hace **una llamada por bloque** con concurrencia 2, con un objetivo por bloque acotado por material (`CHARS_POR_SUBTEMA = 700`). Si los bloques no alcanzan el objetivo del preset, corre una **pasada de cobertura** sobre inicio+final (`fuenteParaCobertura`) pidiendo conceptos que no estén ya detectados. Deduplica por similitud y ordena por aparición en el texto. Los tres presets (`rapido`/`equilibrado`/`profundo`) fijan `maxSubtemas` = 6/10/12. **Pendiente:** la columna `subtemas.fragmento` (§12.2). |
| Sondeo | `lib/sondeo.ts`, `app/api/sondeo/*`, `FaseSondeo.tsx` | Un roundtrip por pregunta (merge), caché de lote en memoria, atajos 1-4/Enter, fila respondida compacta memoizada, reanudable al recargar. **Desde 30/09 las preguntas pasan por dos filtros de calidad antes de servirse** (ver §10). Desde `8a4744a` el presupuesto del sondeo es **dinámico** (`maxPreguntasSesion(n)` = 4×n sub-temas, entre 24 y 60) y hay un paso previo de "ángulos" para que las preguntas del lote no repitan enfoque. |
| Dominio | `lib/db.ts::registrarRespuesta` | Contadores reales (`total_correctas/total_intentos/total_incorrectas`), dominado = 2 aciertos seguidos, `descartada` para lotes abandonados, y la tabla `respuestas` **sí se llena** con la opción elegida. |
| Estado de sesión | `GET /api/sesiones/[id]`, `lib/tipos.ts` | Fase, progreso, sub-temas con dominio, débiles, sin dominar e historial completo. `sesiones.fase_actual` se persiste (`sondeo` → `plan`). |
| Plan | `FasePlan.tsx`, `app/api/sesiones/[id]/fase` | Server-driven (reabrir una sesión pasada ya no lo muestra vacío), lista de débiles, lista de "quedaron sin dominar", mapa Mermaid y el paso a Enseñar: la fase se persiste en la base con guard de retroceso. |
| Enseñar | `lib/aprender.ts`, `lib/practica.ts`, `app/api/aprender/*`, `components/aprender/*` | Ruta por sub-tema (`reforzar`/`asegurar`/`practicar`/`sin_evaluar`), material generado y cacheado por sub-tema (explicaciones + ejercicios), quiz y ejercicios de código con `assertions`, runner en `iframe sandbox`, aprobados persistidos. |
| Cerrar | `components/sondeo/FaseCierre.tsx`, `POST /api/sesiones/[id]/fase` | Pantalla mínima (stepper + feedback + salir); la comparativa, la mezcla de preguntas y el export quedan en Fase E. |
| Transversal | `lib/config.ts`, `lib/db.ts`, `lib/proveedores.ts` | Gateway único de modelos, defaults centralizados, WAL + `foreign_keys` + índices + ruta absoluta de DB, CRUD de proveedores OpenAI-compatible, filtro de modelos de embeddings. |

## 2. Comparación con la auditoría previa (15 hallazgos)

| # | Hallazgo de la auditoría | Hoy | Evidencia |
|---|---|---|---|
| 1 | `respuestas` tenía 0 filas: se descartaba qué opción elegías | ✅ Corregido | `registrarRespuesta()` inserta la opción elegida y recalcula la correcta en el servidor. Hoy hay 46+ filas con el texto elegido. |
| 2 | `sesiones.modelo` siempre NULL | ✅ Corregido | Se guarda en `crearSesion()`: en la base figuran `gemma4:26b` y `gemma3:4b`. |
| 3 | `fase_actual` siempre `'sondeo'` | ✅ Corregido | `finalizarSondeo()` la pasa a `'plan'` en la misma escritura del feedback; `GET /api/sesiones/[id]` la usa para reanudar. Las sesiones 46 y 50 quedaron en `plan` y la 47 sigue en `sondeo`. |
| 4 | Contador "Pregunta X de Y" mentía (111 preguntas / 85 respondidas, 26 huérfanas) | ✅ Corregido | `preguntas.descartada` + `totalServibles`. Prueba: sesión nueva con 6 sub-temas cierra en **15/15** con 6/6 dominados (antes cerraba por el tope con total inflado). |
| 5 | Reabrir una sesión pasada mostraba el Plan vacío | ✅ Corregido | Todo se reconstruye del servidor: `historial` + `subtemasDebiles` + `subtemasSinDominar` en `GET /api/sesiones/[id]` (probado: 15 entradas de historial restauradas). |
| 6 | El feedback recibía `aciertos_seguidos` como "correctas" | ✅ Corregido | `generarFeedbackSondeo()` recibe contadores reales **y** la opción elegida en cada error, así el modelo nombra la confusión concreta. |
| 7 | `extraerSubtemas` ignoraba el modelo elegido | ✅ Corregido | Recibe `modelo` + `proveedor` del request; el mismo par se usa para el feedback. |
| 8 | Fase 2 era un callejón sin salida | ✅ Corregido (Fase C2) | El plan tiene botón para empezar a enseñar y `POST /api/sesiones/[id]/fase` persiste `ensenar`/`cerrar` (con guard que rechaza el retroceso); `app/sondeo/[id]/page.tsx` renderiza la fase que dice la base, así que recargar no te devuelve al plan. Verificado en `.smoke-fase-cd.ps1`. |
| 9 | El topic se llenaba con basura (`slice(0,50)`) | ✅ Corregido | `derivarTema()` en `lib/texto.ts`; el usuario puede pasarlo a mano (`topic`). |
| 10 | Sin `format`, sin `options`, sin `keep_alive` | ✅ Corregido (con una regresión, ver §3.1) | `llamarOllama` manda `format` (JSON Schema), `temperature`, `num_ctx`, `num_predict` y `keep_alive: "30m"`. |
| 11 | Cinco lugares construían llamadas a modelos | ✅ Corregido | `llamarModelo()` es el único transporte; los prompts son funciones puras (`construirPromptSubtemas`, `construirPromptLotePreguntas`); defaults en `lib/config.ts`; `nomic-embed-text` filtrado. |
| 12 | DB sin WAL, sin FK, ruta relativa | ✅ Corregido | `journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`, 4 índices y ruta absoluta (`process.env.USELEARN_DB ?? cwd/useLearn.db`). |
| 13 | Front: historial completo, `key={index}`, localStorage por request | ✅ Corregido | Solo se renderiza la pregunta activa + filas compactas memoizadas (por `preguntaId`), y los atajos 1-4/Enter. `leerConfigLocal()` sigue leyendo localStorage por llamada (barato, ya no es 3 ítems + parse por request). |
| 14 | `console.log` y `lib/seed-test.ts` muertos | ✅ Limpiado | No queda ningún `console.log`; `lib/seed-test.ts` borrado y su línea de `.gitignore` también. |
| 15 | Mermaid por CDN y grafo en estrella | ❌ Sigue igual | `MERMAID_CDN` sigue siendo un `<script>` remoto y `construirGrafo()` sigue dibujando `PLAN --> N0..Nn`. Se arregla en Fase C. |

## 3. Bugs nuevos encontrados en esta pasada (y cómo se arreglaron)

### 3.1 El feedback final se guardaba como JSON crudo (regresión de Fase B.8)
- **Qué pasaba:** `llamarOllama` mandaba `format: "json"` a *cualquier* llamada sin esquema. El
  feedback se pide en prosa, así que Ollama devolvía `{"feedback": "..."}` y ese JSON se guardaba
  en `feedback_final` y se mostraba tal cual en la pantalla del plan.
- **Evidencia:** en la base, la sesión 50 tiene `feedback_final = '{\n  "feedback": "¡Buen trabajo con la m…'`;
  la 46 (generada antes de Fase B) es texto plano. Prueba directa contra `/api/generate` con el
  mismo prompt: con `format:"json"` devuelve el objeto, sin `format` devuelve prosa.
- **Fix:** `format` solo se manda si hay esquema o si el llamador pide explícitamente un objeto
  (`esperaObjeto`). Verificado end-to-end: el feedback de las sesiones 53, 54 y 55 empieza con
  texto, no con `{`.
- **Dato viejo:** el feedback ya guardado en la sesión 50 quedó con el JSON roto. Se regenera solo
  pidiendo una vez la siguiente pregunta de esa sesión (ya completa):
  `curl "http://localhost:3000/api/sondeo/siguiente-pregunta?sesionId=50&modeloPreguntas=gemma3:4b&modeloPrincipal=gemma3:4b"`.

### 3.2 El cliente seguía sirviendo preguntas de lotes que el servidor ya descartó
- **Qué pasaba:** al dominar un sub-tema, el servidor descarta las preguntas que sobran del lote
  (para que no inflen el contador), pero el cliente las tenía cacheadas en memoria y las seguía
  mostrando. Responderlas ensuciaba el dominio (una respuesta mal reseteaba `aciertos_seguidos` y
  podía "des-dominar" el sub-tema) y sumaba intentos que no contaban para el sondeo.
- **Evidencia:** sesión 50 → 7 de 27 preguntas quedaron `respondida = 1 AND descartada = 1` (sub-temas
  407/408/409/410) y el sondeo terminó por el tope de 20 con el sub-tema 412 nunca evaluado.
- **A/B con el mismo cliente simulado (6 sub-temas, `gemma3:4b`, lotes de 3):**
  - cliente viejo (no descarta la caché): **18 respuestas**, 3 de ellas a preguntas abandonadas
    (`descartada: true`), contadores inflados (3 intentos donde había 2).
  - cliente nuevo: **15 respuestas**, 0 abandonadas, 6/6 sub-temas dominados, contadores limpios.
- **Fix:** `POST /api/sondeo/responder` devuelve `dominado` / `descartada`; el cliente tira de la
  caché los ítems de ese sub-tema y, si la pregunta era de un lote abandonado, pide la siguiente
  al servidor. Del lado server, `registrarRespuesta` no toca el desempeño del sub-tema cuando la
  pregunta venía descartada (guarda la respuesta, no la cuenta).

### 3.3 La pre-generación casi nunca disparaba
- **Qué pasaba:** el umbral era "quedan ≤1 pendientes" y un lote completo tiene 3, así que
  `lote.length - 1 = 2 > 1` y **nunca** disparaba. Además el candidato se elegía como "primer
  sub-tema sin pendientes por id" (no el que `servirSiguiente` iba a servir) y podía insertar un
  lote para un sub-tema ya cubierto, dejando filas pendientes para siempre en el total del sondeo.
- **Evidencia (medido con `gemma3:4b`, 6 sub-temas):**
  - respuestas instantáneas (8 ms) y umbral viejo: cada transición de sub-tema esperaba al modelo:
    **5,1 s / 4,8 s / 5,5 s**.
  - umbral corregido y ritmo humano (12 s por respuesta): la transición tarda **8 ms**, porque el
    lote del sub-tema siguiente ya estaba generado.
- **Fix:** umbral 2 (comentado en `lib/config.ts`), candidato elegido con la misma política que
  `servirSiguiente` (`elegirSiguienteSubtema`) y re-chequeo post-generación que descarta el lote si
  el sub-tema se cubrió mientras se generaba. **Límite honesto:** si el usuario responde más rápido
  de lo que tarda el modelo, la pre-generación llega tarde y la transición igual espera (fue lo que
  se vio en el test de 8 ms por respuesta).

### 3.4 El plan podía decir "dominaste todos los sub-temas" con sub-temas sin evaluar
- **Evidencia:** sesión 50, sub-tema "Template strings en JSX" con 0 intentos y `cubierto = 0`; no
  aparecía en ningún lado porque "débil" se define como "tuvo errores".
- **Fix:** `GET /api/sesiones/[id]` y el cierre del sondeo devuelven `subtemasSinDominar`
  (`cubierto = 0`); el plan los muestra en una tarjeta aparte ("Quedaron sin dominar") y el prompt
  del feedback los recibe como "no evaluados: no los presentes como dominados".

### 3.5 Limpiezas menores de la misma pasada
- `lib/seed-test.ts` borrado (único `console.log` del repo) y su entrada en `.gitignore`.
- Warning de ESLint en `lib/proveedores.ts` (`catch (error)` sin uso) → `catch {}`. ESLint queda limpio.
- Sigue habiendo código muerto anotado para Fase C: `guardarPregunta`, `generarPregunta` y
  `actualizarFaseSesion` (esta última se va a usar para persistir `fase_actual` en `ensenar`/`cerrar`).

## 4. Mediciones (Ollama local, `gemma3:4b`, 6 sub-temas, 15 respuestas)

| Etapa | Tiempo medido | Comentario |
|---|---|---|
| Extraer sub-temas (al crear la sesión) | ~2-4 s | Head de 3.5k chars + `format` con esquema. |
| Primer lote de preguntas | 2.6-3.0 s | Es la única espera "inevitable" del sondeo. |
| Avance dentro del lote (ya en memoria) | **6-12 ms** | Un POST a SQLite local, sin red y sin modelo. |
| Transición de sub-tema con pre-generación madura | **6-10 ms** | El lote del sub-tema siguiente ya estaba guardado. |
| Transición de sub-tema sin pre-generación | 4.8-5.5 s | Cuando las respuestas van más rápido que el modelo. |
| Merge `responder` + `siguiente` (un roundtrip) | 9-10 ms | Sin caché disponible pero con el lote ya generado. |
| Cierre del sondeo + feedback final | ~1-3 s | Una llamada acotada (`num_predict` 300). |
| Sesión completa (15 respuestas) | sin esperas perceptibles después del 1er lote | Medido con pausa humana de 12 s entre respuestas. |

Referencia de la corrida con ritmo humano (sesión de prueba, borrada después de medir): 15/15
respondidas, 6/6 sub-temas dominados, 3 preguntas abandonadas descartadas, 0 preguntas abandonadas
respondidas, feedback en texto plano.

## 5. Panorama actual

| Fase | Peso | Estado verificado | % interno | Aporte |
|---|---|---|---|---|
| 1. Sondeo | 30 | End-to-end con respuestas reales, dominio con contadores reales, reanudable, batching + pre-gen + atajos, presupuesto dinámico, paso de ángulos, **dos filtros de calidad de preguntas** (local + juez, gateado por preset) | 92% | 27.6 |
| 2. Plan | 10 | Server-driven y reanudable, débiles + sin dominar, Mermaid por CDN, grafo en estrella, salida a Enseñar con la fase persistida | 85% | 8.5 |
| 3. Enseñar | 35 | Rutas por sub-tema, material generado y cacheado, quiz + código con assertions, sandbox aislado, aprobados persistidos | 75% | 26.3 |
| 4. Cerrar | 15 | Pantalla mínima (stepper + feedback); falta la comparativa, la mezcla de preguntas y el export | 20% | 3.0 |
| Transversal (ajustes, proveedores, historial, ingesta, DB) | 10 | Sólido: gateway, defaults centralizados, DB endurecida, ESLint limpio; sin tests unitarios (hay 2 humos end-to-end), sin modal extraído | 85% | 8.5 |
| **Total** | 100 | | | **≈ 74 / 100** |

Lectura honesta: el **ciclo de diagnóstico** (detectar qué no sabés) está ~92% y Enseñar está
implementado (75%, con la salvedad de §7: CodeMirror, el `iframe sandbox` y los cambios de pantalla solo
se probaron a mano). Lo que sigue en 0% es la **retención entre sesiones** (que lo aprendido se recuerde y
se repase). La auditoría previa estimaba ≈37; Fase A y B
sumaron los ~6 puntos, y esta pasada corrigió cuatro bugs que hacían que los números fueran
mentira (feedback en JSON, preguntas abandonadas contadas, pre-gen muerta, sub-temas sin evaluar
invisibles).

**Los +1 del filtro son una estimación con asterisco:** la feature está conectada y compila, pero
no se midió contra un modelo real (§10.5). Si el juez resulta demasiado estricto y vacía lotes, el
número es peor, no mejor. Es el único ítem del panorama sin evidencia de runtime.

**El filtro de calidad NO mueve el total por arriba de 74.** Mejora el diagnóstico, no el
aprendizaje, y el diagnóstico ya estaba ponderado por su propio peso. Inflar el total por una
feature que solo hace más riguroso el mismo flujo sería mentir sobre el estado del producto.

Lo que sí cambió en esta lectura: la retención entre sesiones sigue en 0% pero **ahora con causa
identificada** (§11.1: la app no tiene memoria entre sesiones) en vez de ser un vacío sin
diagnóstico. Eso es progreso real: el problema dejó de ser invisible.

**Sobre la Tanda 1 (`8a4744a`) y el total.** La Tanda 1 cubrió de verdad el hueco de §12.2
(sub-temas por bloques, presets, presupuesto dinámico) y está medida en §12.2, pero **el total sigue
en 74 y el Sondeo sigue en 92%**, a propósito. Dos razones, y las dos son las mismas que se aplicaron
al filtro de calidad:

1. **Lo que corrigió es cobertura de ingesta, no aprendizaje ni retención.** La ponderación de §5
   reparte 30 al Sondeo, 35 a Enseñar y 10 a lo transversal; cubrir mejor un texto grande mejora la
   *entrada* del diagnóstico, que ya estaba en 92%. Sumar ahí sería inflar el número por una feature
   que hace lo mismo que antes pero con más material.
2. **La medición muestra que la Tanda 1 no cierra del todo el problema que vino a cerrar.** Con un
   archivo de ~9.9k chars salen 17 candidatos y sobreviven 10, pero **el corte final es por orden de
   aparición y sistemáticamente sacrifica el final del documento** (§12.2.2). No es un cierre limpio
   del ítem (g): es un avance con un agujero conocido. Subir el porcentaje sin resolver eso sería
   repetir el error que este documento ya se corrigió una vez (§10.1).

## 6. Qué sigue (ordenado por relación valor/riesgo)

> **Desde la 2ª pasada del 30/09 esta lista es el inventario de pendientes; el orden vigente es §12.9.**
> Suben de prioridad: los ítems 0 y 0b (juez real y asserts del fail-open, Paso 0-1) y el ítem 4 (regla de
> dominio, Paso 3), porque el repaso espaciado se alimenta de esa señal.

**Primero, cerrar el círculo de esta pasada (chico, ~30 min)**
0. **Probar el juez contra un modelo real** y ajustar el prompt según cuánto descarte (ver §10.5).
   Es lo único del commit `71e04b6` sin evidencia de runtime, y es el riesgo activo: un juez
   demasiado estricto vacía lotes y el usuario se queda sin preguntas. Mientras tanto, `rapido`
   no lo activa, así que hay una salida.
0b. **Un assert de humo que fije el filtro.** Los dos humos pasan igual porque no ejercitan el
   juez (es un `opts.juez` inyectado y los humos no lo pasan). Un assert con un juez que rechaza
   todo, y otro con un juez que lanza, fijarían el comportamiento fail-open.

**Fase C — el Plan de verdad (chica, 1 sesión)**
1. ~~Botón "Empezar a aprender"~~ ✅ hecho en C2/D (`POST /api/sesiones/[id]/fase`).
2. Grafo propio en SVG (nodos con el mismo estilo `rounded-2xl border-neutral-800/60`) y sacar
   Mermaid del CDN. Con `respuestas` ya poblada se pueden dibujar **aristas de error** ("elegiste
   la opción de cleanup cuando la pregunta era de dependencias") y el mapa pasa a ser un
   diagnóstico personalizado. **Sigue igual:** `MERMAID_CDN` sigue siendo un `<script>` remoto
   (`components/sondeo/FasePlan.tsx:9,164`) y el grafo sigue en estrella.
3. ~~Stepper persistente Sondeo · Plan · Enseñar · Cerrar~~ ✅ **ya existía**:
   `components/ui/Stepper.tsx`, usado en las tres fases (`FasePlan:193`, `FaseEnsenar:194`,
   `FaseCierre:25`). *Corrección (30/09): una versión anterior de este documento lo daba por
   pendiente. Se verificó con grep que estaba mal: el error fue buscar "stepper" en
   `app/sondeo/[id]/page.tsx` (el orquestador de fases, que solo delega) y no en `components/`.*
4. Regla de dominio real: mínimo 3 intentos por sub-tema antes de poder dominarlo (hoy se domina
   con 2 aciertos/2 intentos, `ACIERTOS_SEGUIDOS_PARA_DOMINAR`). **Sigue igual.**
   `proximo_repaso` salió de acá: pasa a ser parte de la Fase 2 de §11 (repaso espaciado),
   porque necesita la tabla `conceptos` para tener sentido.
   **Nota (30/09, 3ª pasada):** la Tanda 1 (`8a4744a`) no toca esta regla, pero **la vuelve más
   urgente**: al subir a 10-12 sub-temas por sesión, "2 aciertos seguidos para dominar" se aplica
   sobre un conjunto mucho más grande con el mismo presupuesto. Ver §12.3.

**Fase D — Enseñar (cerrada en su mayor parte)**
5. ~~Tablas `explicaciones`, `ejercicios`, `intentos_ejercicio`~~ ✅ en `lib/db.ts`.
6. ~~Explicaciones + ejercicios por sub-tema con lote + JSON Schema~~ ✅ `lib/aprender.ts`.
7. ~~CodeMirror 6 + runner en `iframe sandbox="allow-scripts"`~~ ✅ `components/aprender/*`.
8. Explicación anclada al error concreto. **Parcial:** la opción elegida ya se guarda, así que
   el dato está; falta la pieza que lo use en la pantalla de Enseñar.

**Fase E — Cerrar y largo plazo (nada empezado)**
9. Pantalla de cierre (comparativa, mapa completo, mezcla de preguntas, próximo tema).
   **Verificado:** `FaseCierre.tsx` sigue con el stepper + feedback, y el comentario de la línea 7
   dice que el export y el repaso se agregan ahí.
10. Export a Obsidian (`.md` con bloque `mermaid` + debilidades + ejercicios con soluciones).
    **Verificado:** cero referencias a "obsidian" en `app/` y `lib/`.
11. Repaso espaciado en la landing: los lotes abandonados ya son material (18 filas descartadas
    en una sola sesión de prueba). **Reenrutado a §11.2-11.3**: es la Fase 2 del plan de
    memoria, no un ítem suelto de Fase E.
12. Import desde la carpeta de notas con `fs` (solo lectura, whitelist).

**Deuda técnica**
13. Extraer `ModalAjustes` de `app/page.tsx`. **Creció dos veces:** el texto decía 645 líneas;
    después 886; hoy son **935** (contadas en esta pasada). El modal ya no es el único problema del
    archivo, y el tamaño importa por una razón práctica (§12.8): el harness se rompe con ediciones
    parciales de archivos grandes.
14. Tests automatizados — **started en esta tanda (30/09): 39 tests con `vitest`** sobre
    `lib/texto.ts` (incluido `dividirEnBloques` y el reparto por cuota) y `lib/db.ts`
    (`registrarRespuesta`, `elegirSiguienteSubtema`, `sondeoCompleto`, `eliminarSesion`), corriendo
    contra una base temporal. Scripts nuevos: `npm test` y `npm run typecheck`. **Lo que falta:**
    `lib/validacion.ts`, los payloads de `servirSiguiente`, el fail-open del juez (ítem 0b), el
    chequeo de callers muertos del `verify` y partir `app/page.tsx`. Ver §13.
15. Botón "esta pregunta está mal" (descarta y regenera el sub-tema).
16. Modos de estudio (tema libre, desafío de código, error/stack trace, repaso) sobre las mismas
    tablas + un campo `modo`.
17. Defaults de modelo: para preguntas sigue `gemma4:26b` (17 GB) aunque alcanza con `gemma4:e2b` o
    `llama3.1:8b`; reservar el 26b para feedback y extracción.

## 7. Límites y riesgos conocidos

- **El juez semántico puede ser demasiado estricto (nuevo, sin medir).** Si rechaza mucho, el
  lote se vacía y `generarLotePreguntas` tira `el lote no tiene preguntas válidas`: el usuario
  se queda sin pregunta. Mitigaciones ya puestas: fail-open por pregunta, fail-open por lote, y
  el preset `rapido` no lo activa. Falta medirlo (§10.5).
- **Coste y latencia del juez:** son N llamadas extra por lote (una por pregunta), en paralelo.
  Con `gemma4:26b` en local eso puede ser más lento que generar el lote mismo. No hay medición.
- **Pre-generación vs velocidad del usuario:** si respondés más rápido de lo que tarda el modelo,
  el lote llega tarde igual (medido: 5,1 s vs 8 ms de transición). Con `gemma4:26b` una transición
  puede seguir tardando aunque el resto del sondeo sea instantáneo.
- **Contienda por la GPU:** si la pre-generación y el pedido en primer plano coinciden, el pedido
  que esperás vos tarda más (se vio: 5,1 s con el modelo ocupado vs 2,6 s solo). En una sesión de
  prueba quedaron 2 lotes completos descartados por esa carrera; la pre-generación no duplica filas
  (re-chequeo post-generación) pero puede gastar una llamada. **Por esto el juez no corre en la
  pre-gen:** habría summedo N llamadas más a esa misma carrera.
- ~~**Tope de 20 respuestas**~~ **Corregido en `8a4744a` (Tanda 1).** Ya no existe el tope fijo de 20:
  el presupuesto es `maxPreguntasSesion(n)` = 4 × cantidad de sub-temas, con piso 24 y techo 60. Con
  los 6 sub-temas de antes daba 24; con los 10 de ahora da 40. **El riesgo residual sigue vivo y es
  otro:** si el usuario va lento o hay muchos sub-temas, el sondeo puede igual cerrar por tope sin
  evaluarlos a todos, y eso se ve como "quedaron sin dominar" (§3.4) en vez de pasar por "dominado".
- **Tests: hay 39, pero la cobertura es parcial.** Cubren `lib/texto.ts` y `lib/db.ts`. **No cubren**
  `lib/validacion.ts`, `lib/sondeo.ts` ni el filtro de preguntas (§10.5), que sigue siendo la capa con
  más riesgo de regresión sin red. Los 2 humos end-to-end siguen pasando porque no ejercitan el juez.
  No hay todavía un `npm run verify` que junte typecheck + lint + tests.
- **Enseñar todavía no está verificado en el navegador:** los humos cubren API, persistencia y
  caché, pero CodeMirror, el `iframe sandbox` y los cambios de pantalla solo se probaron a mano.
- **El par js/jsx depende del modelo:** `gemma4:26b` lo devuelve (verificado), `gemma4:e2b` tiende a
  mandar dos ejercicios de código sueltos. El parser no descarta nada de eso, pero la calidad varía
  con el modelo que elijas en Ajustes.

## 8. Cómo verificarlo en el navegador (5 minutos)

1. `npm run dev` + Ollama arriba, abrir `http://localhost:3000`.
2. Pegar un apunte (o usar PDF) y generar el quiz: en "Sesiones pasadas" el título ya es legible
   (no `# archivo.md`).
3. Responder con el teclado: `1-4` elige, `Enter` avanza. Dentro del mismo sub-tema el avance es
   instantáneo; las respondidas quedan como filas compactas arriba.
4. Al dominar los sub-temas, el plan muestra el feedback en **texto plano** y, si algún sub-tema
   quedó sin dominar (sesiones viejas como la 47 o la 50), la tarjeta "Quedaron sin dominar".
5. Recargar la página en medio del sondeo: se reanuda con el historial desde el servidor.
6. Apagar "Pre-generar el próximo lote" en Ajustes y comparar la transición de sub-tema.
7. Cerrado el sondeo, en el plan: "Empezar a enseñar" → la pantalla de Enseñar arranca por el sub-tema
   más flojo, genera explicaciones (3 en `reforzar`) y ejercicios, y te deja pasar al siguiente.
8. En un ejercicio de código probá "Correr": las assertions se evalúan dentro de un `iframe sandbox`
   (sin acceso a la app) y el resultado queda guardado como intento.
9. Aprobados todos los ejercicios de un sub-tema, "Cerrar la sesión" deja la fase en `cerrar`;
   recargar la página te deja donde estabas, no en el inicio.
10. **Para ver la cobertura por bloques (Tanda 1):** pegá un texto largo (varios miles de caracteres
   con secciones claramente distintas) y poné el preset en `profundo`. Vas a ver muchos más sub-temas
   que antes (hasta 12 en vez de 6) y la pantalla de confirmación te deja desmarcar. **Desde el fix
   del reparto, el final del apunte también entra:** si el modelo detecta más conceptos de los que
   entran, el log del server dice cuántos y de qué bloques se descartaron, y los sub-temas que
   quedan vienen en orden de lectura (el último es del final del documento).

> Nota: las corridas de prueba de esta verificación y de las anteriores (sesiones 52-55) ya se
> borraron de la base. Las sesiones que se citan como evidencia de los bugs (46, 47 y 50) son las
> tuyas y quedaron intactas.


## 9. Fase C/D — qué se construyó y qué se verificó (29/09/2026)

Esta pasada cerró **C1** (modalidades de entrada + confirmación de sub-temas), **C2** (rutas del plan y
fases persistidas) y **D** (Enseñar/Practicar). Evidencia y límites, sin adjetivos.

### 9.1 Qué hay ahora

| Pieza | Dónde | Qué hace |
|---|---|---|
| Modalidades de entrada | `app/page.tsx`, `POST /api/sesiones/crear` | `modo` = `apunte` o `tema_libre`. En tema libre el modelo escribe el apunte (`nivel` + `objetivo`) y ese apunte queda como `textoOriginal` de la sesión. |
| Confirmación de sub-temas | `POST /api/sesiones/[id]/subtemas` | Descartar los sub-temas que no te interesan antes de arrancar el sondeo. Guardas: fase `sondeo` y cero respuestas; `mantener: []` → 400. |
| Rutas del plan | `lib/practica.ts::calcularRutaSubtema` | `reforzar` (hubo errores), `asegurar` (dominado sin práctica), `practicar` (dominado con práctica) y `sin_evaluar`. |
| Fases persistidas | `POST /api/sesiones/[id]/fase` | `plan → ensenar → cerrar`: idempotente hacia adelante, 409 al retroceder, 400 con fase desconocida. La pantalla se elige con la fase que dice la base, así que recargar no te mueve. |
| Material | `lib/aprender.ts`, `POST /api/aprender/bloque` | Explicaciones (3 por sub-tema, 1 en `asegurar`) y ejercicios (3: quiz + par js/jsx en temas de programación), generados en paralelo y cacheados por sub-tema. |
| Intentos | `POST /api/aprender/intento` | Guarda el intento (quiz o código), marca `aprobado` y devuelve los conteos de la pantalla. |
| Editor y runner | `components/aprender/*` | CodeMirror 6 y ejecución en `iframe sandbox="allow-scripts"` (origen opaco, `postMessage` con token, timeout de 3 s). |

### 9.2 Bugs reales que aparecieron en esta pasada

- **El dedup de ejercicios se comía la variante jsx.** La clave de deduplicación era el `enunciado`, y
  las dos variantes del mismo problema comparten enunciado a propósito → una quedaba afuera. Ahora la
  clave es `tipo|variante|enunciado` (`lib/aprender.ts::parsearEjercicios`). Evidencia: con `gemma4:26b`
  el humo reporta `variantes=js+jsx` y pasa el assert "la variante jsx sobrevive al dedup"; con el
  código anterior esa corrida perdía un ejercicio.
- **La pantalla de Enseñar ignoraba Ajustes.** `FaseEnsenar` no mandaba modelos en el body, así que el
  material se generaba siempre con `MODELO_PRINCIPAL_POR_DEFECTO` (`gemma4:26b`) aunque tuvieras otro
  modelo o un proveedor de nube elegido. Ahora manda `modeloPrincipal` + `proveedor` desde
  `leerConfigLocal()`, que se extrajo a `lib/config-cliente.ts` para que sondeo y Enseñar lean lo mismo.
- **El prompt de ejercicios era blando.** Con `gemma4:e2b` devolvía 3 quiz y 0 código, así que el flujo
  de práctica quedaba sin nada que correr. Ahora el prompt dice explícitamente que los ejercicios de
  código son obligatorios en temas de programación, y cada ejercicio que el parser descarta queda en el
  log del server (`[aprender] ejercicio descartado por validación`).

### 9.3 Evidencia (comandos y resultados)

| Comando | Resultado |
|---|---|
| `.smoke-fase-cd.ps1` (modelo `gemma4:e2b`) | **36 asserts PASS**, exit 0 |
| `.smoke-fase-cd.ps1 -Modelo gemma4:26b` (el default real) | **36 asserts PASS**, exit 0 — incluye el par js/jsx |
| `.smoke-c1.ps1` | 21 asserts PASS |
| `npx tsc --noEmit`, `npx eslint .`, `npm run build` | 0 errores, 0 warnings |

El humo de C/D cubre: creación, guard de fase (409), las cuatro rutas, transiciones de fase, generación
y caché del bloque (mismos ids en la segunda llamada), intentos (quiz incorrecto/correcto, código, 404,
400), conteos después de aprobar y cierre con borrado de la sesión.

Los dos humos corren contra una base temporal (`$env:TEMP\uselearn-smoke-cd.db`, con `USELEARN_DB`
explícito en el server y en el helper) y **borran la sesión que crean**: tu `useLearn.db` no se toca.

### 9.4 Qué falta de C/D (honesto)

- **Cerrar es mínimo:** sin comparativa antes/después, sin mezcla de preguntas y sin export (todo eso es E).
- **Sin "dame más ejercicios":** el bloque genera una vez y cachea; no hay botón para pedir otro ejercicio
  del mismo sub-tema (el parámetro `ejerciciosPrevios` ya está listo para eso).
- **Sin tests unitarios ni de UI:** todo lo de esta sección es API + base; el navegador se prueba a mano.


## 10. Filtro de calidad de preguntas (30/09/2026, commit `71e04b6`)

Hasta esta pasada, una pregunta llegaba al usuario si el modelo devolvía JSON parseable. No
había ninguna verificación de contenido: una pregunta con la respuesta correcta marcada en
el lugar equivocado, o cuya explicación no tenía nada que ver, se servía igual.

### 10.1 El bug de fondo: la feature compilaba pero no estaba conectada

`lib/evaluador.ts` existía y `npx tsc --noEmit` daba **0 errores**. El problema es que
`evaluarCalidadSemantica` **no se llamaba desde ningún lado** (verificado con grep sobre todo
el repo: la única coincidencia era su propia declaración). El "filtro de inteligencia" era
código muerto compilado.

Peor: al intentar importarlo en `ollama.ts` se había generado un **import circular**
(`ollama.ts` importándose a sí mismo, más imports duplicados de `Pregunta` y `validarLote`).
TypeScript lo marcaba con `TS2440`/`TS2300`, que son los 13 errores que aparecieron al
arrancar esta pasada.

**Lección que queda escrita:** tipos en verde y build en verde no prueban que una feature
funcione. Hay que grepar quién la invoca. El build verifica que el código *anda*, no que
*se use*.

### 10.2 Qué hay ahora

| Capa | Dónde | Qué descarta | Costo |
|---|---|---|---|
| Validación local | `lib/validacion.ts` | stem pobre, cantidad de opciones inválida, comodines "todas/ninguna", opciones duplicadas, longitudes desbalanceadas (≥3×), explicación vacía, y parecido por similitud contra el lote **y** contra todo lo ya visto en la sesión | ~0 (compara strings) |
| Juez semántico | `lib/evaluador.ts` | veracidad contra el texto, enunciado ambiguo, pregunta no respondible con el texto, explicación que contradice la respuesta | 1 llamada por pregunta |

`distribucionSospechosa` completa el conjunto: si la correcta cae siempre en el mismo lugar,
`distribuirLote` mezcla las posiciones para que el usuario aprenda el tema y no el índice.

**Orden de ejecución:** la validación local corre primero y el juez solo mira lo que ya la
pasó, así que el juez nunca ve basura y sus tokens van a lo que la heurística no puede ver.
El juez corre en paralelo (`Promise.all` sobre `juzgarLote`), no en serie: son N llamadas
independientes.

**Gate por preset** (`AjustesCalidad.juezSemantico`): `rapido: false`, `equilibrado: true`,
`profundo: true`. El juez cuesta una llamada por pregunta, y en `rapido` el usuario pidió
espera mínima. Con `rapido` el lote se sirve con la validación local sola, como antes.

### 10.3 Decisiones de diseño que conviene no revertir

- **Inyección por callback, no import.** `generarLotePreguntas` acepta `juez?` en `opts` y
  `sondeo.ts` le pasa `juzgarLote`. Importar `evaluador` desde `ollama` cerraría el ciclo
  (§10.1). El callback además hace que `ollama.ts` no sepa nada del juez.
- **Fail-open en dos niveles.** Si el juez individual falla, la pregunta se acepta (ya pasó
  el filtro barato). Si falla el lote entero, se sigue sin juez. Servir una pregunta dudosa es
  mejor que dejar al usuario sin lote por un fallo del verificador. Ambos catches están
  comentados con el porqué.
- **Sin juez en la pre-generación.** `lanzarPregenSiConviene` corre en background contra el
  mismo Ollama local que está por servir la pregunta que el usuario espera; N llamadas extra
  competirían por la GPU y atrasarían el foreground, que es justo lo que la pre-gen evita.

### 10.4 Bugs corregidos de paso en el evaluador

- **Mandaba el documento entero** (~50k de un PDF) en cada evaluación. Ahora usa
  `extraerExcerpt` con `EXCERPT_MAX_CHARS`, igual que el prompt del lote.
- **`type: ["string", "null"]` no es JSON Schema válido.** Varios proveedores OpenAI-compatibles
  lo rechazan al validar el esquema. Ahora `anyOf: [{type:"string"},{type:"null"}]`.
- **`!!parsed.valida` daba por válida una pregunta rechazada.** Si el modelo devolvía `"false"`
  como string, es truthy y la pregunta pasaba. Ahora `parsed.valida === true`.
- **Extracción del texto real de la opción correcta** en el prompt: antes solo mandaba el
  índice, así que el juez juzgaba sin ver qué se-lo-estaba-presentando-como-correcto.

### 10.5 Qué NO está verificado (límite honesto)

- **El juez no se probó contra un modelo real.** Solo hay `tsc` y `build`. No hay medición de
  cuánto descarta, ni de si los motivos que devuelve son útiles, ni de si es demasiado estricto
  (un juez que rechaza de más deja al usuario sin lote).
- **Los humos no cubren esta capa.** `.smoke-c1.ps1` y `.smoke-fase-cd.ps1` siguen pasando
  porque no ejercitan el juez; el `opts.juez` es inyectado y los humos no lo pasan.
- **No hay tests del comportamiento fail-open**: que un juez caído no rompa el flujo está
  sostenido por lectura del código y los `catch`, no por una prueba.

**Siguiente paso concreto:** una corrida manual en preset `equilibrado` con Ollama arriba,
mirando `[lote] descartada por el juez` en el log. Si descarta más del ~50% del lote, el
prompt del juez está demasiado estricto y hay que relajarlo.


## 11. La app olvida: plan de memoria y repaso espaciado (30/09/2026, planificado)

Esta sección es **plan, no estado verificado**. Es lo que sigue después del filtro de calidad de
§10, y el orden está justificado en §11.8.

> **Revisada el 30/09 (2ª pasada):** el mecanismo de deduplicación, el orden y la semántica de "dominado"
> se ajustaron en §12 (ver §12.3, §12.6 y §12.9). Donde esta sección y la §12 difieren, vale la §12.

### 11.1 Diagnóstico: por qué la retención entre sesiones está en 0%

    Select-String 'proximo_repaso|intervalo|facilidad|repetir' lib/db.ts  →  0 resultados

No existe `proximo_repaso`, ni intervalos, ni registro de práctica. Y el motivo de fondo es
estructural: **cada `subtemas` es una fila de una sola sesión** (`subtemas.sesion_id`). "Closures"
en la sesión 1 y "Closures" en la sesión 8 son dos filas sin relación entre sí, porque la noción
de "concepto" que sobreviva entre sesiones no existe.

Consecuencia: se estudia un concepto, se cierra la sesión, y la app **no lo vuelve a mencionar**.
Al volver, el sondeo pregunta de cero lo que ya se sabía.

**Por qué esto va primero y no una feature más.** Con la app como está, agregar repaso espaciado,
progreso o videos produce adornos sobre una base que no recuerda. La memoria es condición de
existencia de todo lo demás.

### 11.2 Fase 1 — Memoria entre sesiones (primera entrega, va sola)

Se entrega **separada** de la Fase 2 a propósito: hay que poder verificar que un concepto persiste
entre sesiones antes de construirle repaso encima. Juntas, que "funcionen" no distingue "la memoria
funciona" de "el repaso funciona".

| Pieza | Diseño | Ancla en el código existente |
|---|---|---|
| Tabla `conceptos` | `id`, `nombre`, `nombre_normalizado UNIQUE`, `veces_visto`, `primera_vez`, `ultima_vez`, `veces_acierto`, `veces_fallo`, `ultimo_resultado` | mismo patrón `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX` del resto de `lib/db.ts` |
| Vínculo | `subtemas.concepto_id INTEGER REFERENCES conceptos(id)` | `asegurarColumna(...)` — la migración idempotente ya existe (`db.ts:114`) |
| Upsert de concepto | por `nombre_normalizado`, **determinista, sin LLM** | `normalizarParaSimilitud` ya existe en `lib/texto.ts` |
| Historial de dominio | `veces_acierto` / `veces_fallo` / `ultimo_resultado` se actualizan al responder | los contadores por sub-tema ya viven en `registrarRespuesta` |

**El punto de escritura es único:** `agregarSubtema()` (`db.ts:305`) es el único lugar del repo
que inserta en `subtemas`. Ahí se resuelve o crea el concepto antes del INSERT, así que toda
sesión nueva queda enlazada **sin tocar el resto del flujo**. Es la diferencia entre un cambio
acotado y uno que invade el sondeo entero.

**Decisión, a no revertir: la deduplicación es por nombre normalizado, no por LLM.** Es gratis,
determinista, y su falla es visible y corregible. La alternativa (preguntarle al modelo si dos
temas son el mismo) es más flexible pero cuesta una llamada por sub-tema, no es determinística —o
sea, no se puede testear— y su error es silencioso. Para una app que tiene que "quedar perfecta",
el error silencioso es peor que el error visible.

> **Revisión (30/09, 2ª pasada): el principio se mantiene, cambia el mecanismo.** El nombre normalizado
> *solo* tiene un punto ciego: los nombres los extrae un modelo y son inestables ("Closures", "Closures en
> JS" y "Clausuras y scope" normalizan distinto), y esa fragmentación **no es visible**: el concepto
> simplemente se parte en tres. La resolución pasa a dos pasadas (§12.6): nombre normalizado exacto y,
> después, similitud de embeddings local con umbral conservador y confirmación del usuario en los casos
> dudosos. Antes de implementar, medir en la base real cuántos sub-temas colisionan hoy (§12.1).

**Lo que NO hace la Fase 1:** la interfaz no cambia. No hay pantalla nueva ni botón. Es
infraestructura invisible, verificable por SQL.

**Cómo se verifica:** crear dos sesiones con material que comparta sub-temas y comprobar que
aparece **un** concepto con `veces_visto = 2` y dos filas de `subtemas` apuntando al mismo
`concepto_id`.

### 11.3 Fase 2 — Repaso espaciado (después de verificar la Fase 1)

> Prerrequisito (30/09, 2ª pasada): la señal de "dominado" es débil (2 aciertos seguidos con 4 opciones
> son ~6% por azar) y Leitner se alimenta de ella. La regla de dominio se corrige antes (§12.3).

- Algoritmo **Leitner de 3 cajas** (1d / 3d / 7d): acierto sube de caja, fallo vuelve a la
  primera. Simple, progresivo y predecible — no una caja negra que nadie puede depurar.
- `conceptos.proximo_repaso` (con `asegurarColumna`) + `GET /api/repaso` con los conceptos vencidos.
- La landing muestra **"Te tocan 3 conceptos"** antes de generar nada: es el momento donde la app
  deja de esperar que la trabaje y empieza a dirigirla.
- Al crear una sesión, los sub-temas que ya existen como concepto entran priorizados, y
  `preguntasPrevias` se alimenta con la historia del concepto: se practica **lo que se está
  olvidando**, no lo que salió bien.

### 11.4 Fase 3 — Progreso visible

Historial **por concepto**, no por sesión: "Closures: 3 sesiones, dominado en la última, próximo
repaso mañana". Hoy `listarSesionesConEstado` solo lista sesiones sueltas: no hay ninguna vista
longitudinal.

### 11.5 Fase 4 — Videos por concepto (riesgo alto, va después de la memoria)

**Advertencia de diseño, la más importante de esta sección:** un LLM que "recomienda videos"
devuelve URLs plausibles que **no existen** o que son de otro tema. Es el modo de falla más
probable de la feature y el peor posible — si el usuario hace clic y le da 404, descree de toda
la app.

Por eso el diseño acordado invierte el orden de confianza: **catálogo curado + búsqueda, nunca
URLs generadas.**

- `lib/recursos.ts`: catálogo de **10 recursos** de JS/React verificados a mano (título, tema,
  tags, URL). Diez verificados antes que cincuenta confiados en el modelo.
- El modelo, como mucho, propone **términos de búsqueda**; la app construye un link de búsqueda
  (`youtube.com/results?search_query=...`), que **no se puede romper**.
- Match por `nombre_normalizado` del concepto. Sin match → link de búsqueda, el fallback infinito.

### 11.6 Fase 5 — Verificar el juez con modelo chico

Cierra el riesgo abierto de §10.5: correr el juez con el modelo más chico, medir cuánto descarta,
y relajar el prompt si vacía lotes. Es la fase más chica y la que menos riesgo agrega.

### 11.7 Regla de pruebas: siempre el modelo más chico

Vigente para todo lo de esta sección y para cualquier trabajo futuro:

- **Usar `gemma3:4b` (3.1 GB) o `gemma4:e2b` (6.7 GB)** para toda verificación.
- Lo que se prueba es **plumbing, formato, parsing y fallbacks**, no calidad de contenido. Un
  modelo chico falla más, y para verificar que el parser y el fail-open aguantan salida mala, un
  modelo que falla más es exactamente el que se quiere.
- Si la salida con `gemma3:4b` es válida, con un modelo grande también lo será.
- **Lo que esto NO garantiza:** que un modelo grande produzca mejores preguntas. Solo garantiza
  que formato y lógica aguantan. La calidad del contenido es otro eje y se mide aparte.

**Matiz (30/09, 2ª pasada):** esta regla vale para plumbing, formato y fallbacks. La **calibración del
juez** se hace con el modelo que realmente se usará como juez (un juez chico mide la severidad de un juez
chico), con un set de prueba etiquetado y con un juez distinto del generador (§12.8).

Además (§6, punto 17): el default de preguntas sigue siendo `gemma4:26b` (17 GB) cuando
`gemma4:e2b` (6.7 GB) alcanza. Bajarlo es ganar 10 GB de VRAM sin perder nada medible.

### 11.8 Orden y por qué

> **Superado por §12.9.** El juez (antes Fase 5) se adelanta al Paso 0-1 porque es el único riesgo activo
> sin evidencia de runtime (§6 ítem 0), y la memoria pasa después de cobertura y ranuras.

| Fase | Qué desbloquea | Riesgo |
|---|---|---|
| 1. Memoria (`conceptos`) | todo lo demás depende de esto | Bajo: `ALTER` idempotente, datos intactos, un solo punto de escritura |
| 2. Repaso espaciado | la app empieza a dirigirte en vez de esperar | Medio: algoritmo nuevo, pero aislado y testeable |
| 3. Progreso visible | motivación y confianza | Bajo: es leer lo ya persistido |
| 4. Videos | lo pedido explícitamente | Medio-alto con URLs generadas; bajo con catálogo curado |
| 5. Verificar el juez | cierra el riesgo abierto | Bajo |

Las Fases 1-3 son el corazón. Sin memoria, 4 y 5 son adornos sobre una app que olvida.


## 12. Plan de rediseño: el código decide, el modelo redacta (30/09/2026, planificado)

Esta sección es **plan, no estado verificado**. Nada de lo que sigue existe todavía en el repo ni se midió.
Los archivos, columnas y tablas nuevos que se nombran son **propuestos**. Sale de la segunda revisión del
30/09 y de los objetivos pedidos para llevar la app "a nivel top".

### 12.0 Principio y mapa de objetivos

Hoy el modelo decide *qué preguntar, cuántas y cómo*. De ahí salen la repetición, la calidad despareja y
la latencia (un lote por sub-tema, un juez por pregunta). El rediseño invierte el reparto:

| Lo decide el código (determinista, testeable) | Lo redacta el modelo (acotado) | Lo verifica el código |
|---|---|---|
| Estructura del texto, sub-temas y su fragmento, cuántas preguntas y de qué tipo y nivel, orden, respuesta correcta cuando se puede ejecutar, dominio y repaso | Enunciado, distractores, explicación, ejemplo | Esquema, validación local, ejecución del snippet, similitud por embeddings, juez solo donde no hay ejecución |

| Objetivo pedido | Dónde se resuelve |
|---|---|
| a) Mejor rendimiento con LLM locales | §12.7 |
| b) Memoria de sesiones pasadas | §12.6 |
| c) Que realmente enseñe | §12.4 |
| d) Mínimos errores | §12.8 |
| e) Más fluida, menos repetitiva | §12.3, §12.4 |
| f) Mejor calidad de preguntas y respuestas | §12.3, §12.8 |
| g) Abordar todos los sub-temas de un texto grande | §12.2 (mayormente hecho en `8a4744a`; falta el reparto del corte final) |
| h) Cargar la fase completa y recién después mostrar de a una | §12.5 |
| i) El código hace el trabajo pesado; menos preguntas pero mejores; ejercicios bien explicados | §12.0, §12.3, §12.4 |

### 12.1 Paso 0: medir antes de tocar (barato, evita construir sobre supuestos)

- ~~**Causa de (g).**~~ **Resuelto por `8a4744a` y medido en esta pasada (30/09, 3ª).** El supuesto
  de este documento ("`extraerSubtemas` manda un head de 3.5k caracteres") era **falso**: quedó
  desactualizado por el commit que entró después de la base de verificación. Y la contradicción que
  este mismo §12.1 señalaba —"las notas previas decían `MAX_SUBTEMAS = 6` y la observación fue ~9,
  no coinciden"— también se resolvió: no hay un `MAX_SUBTEMAS`, hay **tres topes según el preset**
  (`maxSubtemas` = 6 / 10 / 12 en `rapido` / `equilibrado` / `profundo`), y los ~9-salían de sesiones
  creadas con el default. **Evidencia en la base real:** de 10 sesiones, las 4 más recientes tienen
  10, 10, 9 y 7 sub-temas; las 6 anteriores tienen 6 o 5. El número de sub-temas creció con el
  preset, no por azar. Lo que queda abierto de (g) no es la causa sino el **corte final** (§12.2.2).
- **Colisiones de nombre — medido en esta pasada (30/09, 3ª).** Sobre los 71 sub-temas reales de
  `useLearn.db`: normalizando (minúsculas, sin acentos, sin puntuación) quedan **59 nombres
  distintos**; hay **10 grupos que aparecen más de una vez**, que abarcan **22 filas**. O sea: el
  nombre normalizado **sí** fusionaría una parte real y medible del problema.
  Pero el punto ciego de §11.2/§12.6 también quedó **cuantificado**: hay **21 pares con similitud
  ≥ 0.34 que NO colisionan** por nombre, y varios son claramente el mismo concepto —
  `"uso del hook usestate"` ~ `"uso de usestate"` (0.67),
  `"tipos de datos basicos"` ~ `"tipos de datos primitivos"` (0.50),
  `"declaracion de variables"` ~ `"declaracion de variables var let const"` (0.40).
  O sea: el nombre normalizado exacto resuelve ~10 de ~31 casos de duplicación real. **Conclusión
  para §12.6: los embeddings no son opcionales, son la parte que hace el trabajo.** No se agregan
  por gusto: la medición muestra que la regla determinista sola deja la mitad del problema sin ver.
- **El juez contra un modelo real** (§10.5), antes de apoyarse en él. **Sin medir.**
- **Enseñar en el navegador** (§8, pasos 7-9): el 75% del panorama incluye piezas solo probadas a mano (§7).
- **Línea base de rendimiento.** `ollama ps` (la columna PROCESSOR debería decir 100% GPU), tiempo del primer
  lote y de la transición de sub-tema, con `gemma4:26b` y con `gemma4:e2b`/`gemma4:e4b`.
  **Dato parcial de esta pasada:** `ollama ps` estaba **vacío** (nada cargado) y `/api/tags` lista
  `gemma4:26b` en **17.3 GB** contra un equipo donde los otros modelos andan bien; la medición
  completa de GPU vs RAM sigue pendiente.

### 12.2 Cobertura de textos grandes (g) — **MAYORMENTE IMPLEMENTADA en `8a4744a`**

> **Corrección 30/09/2026 (3ª pasada).** Esta sección estaba escrita entera como propuesta y quedó
> desactualizada: la Tanda 1 (`8a4744a`) ya construyó 4 de las 5 piezas. Se reescribe separando lo
> que **existe** de lo que **falta**, y se le agrega la medición que faltaba.

#### 12.2.1 Qué ya existe (verificado en código, `8a4744a`)

| Pieza del diseño original | Estado real | Dónde |
|---|---|---|
| Partición del texto en módulos | ✅ Hecha, **pero en `lib/texto.ts`, no en un `lib/chunking.ts` nuevo**: `dividirEnBloques(texto, maxChars, maxBloques, solapeChars=300)`. Corta por párrafo (nunca a media oración) y arrastra 300 chars de solape entre bloques; si un párrafo es más grande que el bloque lo corta duro para no perderlo, y si salen más bloques de los pedidos agranda el tamaño para cubrir TODO el texto. | `lib/texto.ts:169` |
| Sub-temas por módulo | ✅ Hecha: `extraerSubtemas` hace **una llamada por bloque** (`construirPromptSubtemas(bloque, {indice, total, maxPorBloque})`), con concurrencia 2 (`SUBTEMAS_CONCURRENCIA`). Un bloque que falla se loguea y devuelve `[]` sin tirar la creación. | `lib/ollama.ts:622` |
| Objetivo acotado por material | ✅ Hecho: `CHARS_POR_SUBTEMA = 700`; pedir 10 sub-temas para 400 caracteres obligaría al modelo a inventar sinónimos. | `lib/config.ts:121` |
| Unificar duplicados entre módulos | ✅ Hecho: `deduplicarPorSimilidad` (Jaccard de tokens significativos, umbral 0.6) + `ordenarPorAparicion`. | `lib/ollama.ts:663,689` |
| Alcance de la sesión (elegir qué entra) | ✅ Hecho por C1: la landing muestra los sub-temas detectados y podés desmarcar. | `app/page.tsx` |
| Presupuesto del sondeo | ✅ Hecho: `maxPreguntasSesion(n)` = 4 × n, piso 24 / techo 60, **reemplazando el `MAX_PREGUNTAS_SESION = 20` fijo**. | `lib/config.ts:147` |
| **Fragmento por sub-tema** (`subtemas.fragmento`) | ❌ **NO hecho.** `agregarSubtema()` inserta solo `(sesion_id, nombre)`. Hoy el fragmento se reconstruye en cada llamada con `extraerExcerpt(texto, subtema)`, que es **a ciegas**: si el nombre del sub-tema no aparece literal en el texto, cae al head del documento. | `lib/db.ts:304` |

#### 12.2.2 Medición (30/09, 3ª pasada) — y el bug que encontró

> **Actualización: el bug de abajo ya está CORREGIDO** (mismo día, commit del reparto por cuota). Se
> conserva la medición porque es la que lo detectó y la que sirve de línea base para el test.

Corrida real contra Ollama replicando `extraerSubtemas` paso a paso, sobre `.smoke-texto-largo.txt`
(**9.865 chars**), con `gemma4:e2b`:

| Medida | Resultado |
|---|---|
| Bloques con preset `equilibrado` (3500 chars, máx 8) | **4 bloques**: 3238 / 3318 / 3321 / 826 chars |
| Objetivo total (`maxSubtemas`) | 10 |
| Candidatos detectados | **5 + 5 + 5 + 2 = 17** (los 4 bloques cumplen su objetivo) |
| Surviven al dedup por similitud 0.6 | **17** (0 duplicados entre bloques) |
| Tiempo total de la extracción | **1.7 s** (4 llamadas en paralelo) |
| Con `gemma3:4b` | 17 candidatos también, **4.0 s** |
| Casos de borde de `dividirEnBloques` | texto vacío → 0 bloques; un párrafo de 12.000 chars → 4 bloques, sin pérdida |

**El descubrimiento: el corte final sí sacrifica el final del documento.** `extraerSubtemas`
termina en `ordenarPorAparicion(unicos, texto).slice(0, maxSubtemas)` (`lib/ollama.ts:689`): ordena
por dónde aparece cada concepto y **se queda con los primeros N**. Efecto medido sobre esos 17:

| Tope | Sobreviven | Se pierden |
|---|---|---|
| 6 (`rapido`) | 6 | **11** |
| 10 (`equilibrado`) | 10 | **7** |
| 12 (`profundo`) | 12 | **5** |

Y lo que se pierde es **sistemáticamente el último bloque**, que es justamente el final del
material: el bloque 4 propuso `"Colecciones pertenencia tiempo constante"` y `"Funciones puras no
modifican"`, y con el tope del preset por defecto **solo sobrevive 1 de las 2**.

**Por qué es un bug y no una decisión de diseño.** El corte por orden de aparición es correcto para
*ordenar* (el sub-tema 1 del apunte es el primero que se estudia), pero usarlo como criterio de
*selección* significa que **el material largo se trunca siempre por el final**, que es exactamente
lo que la Tanda 1 vino a arreglar: la versión anterior mandaba un head de 3.5k y perdía el final
*por no mandarlo*; esta lo pierde *por descartar lo que sí mandó*. El síntoma es peor porque ahora
es invisible: el modelo hizo el trabajo, el sub-tema existió, y se borró.

**Cómo se arregló (hecho, 30/09):** separar las dos cosas que el `slice` mezclaba, con una función
pura y testeable: `repartirPorCuota(candidatos, bloqueDe, max)` en `lib/texto.ts`.

1. **Selección por reparto, orden por aparición.** `extraerSubtemas` ahora guarda de qué bloque
   salió cada candidato (`{nombre, bloque}`), reparte la cuota entre bloques y recién después
   reordena por aparición para mostrar. Son dos operaciones separadas: elegir *cuáles* entran y
   decidir *en qué orden* se estudia. Antes era una sola (`ordenar...slice`), y por eso el corte
   heredaba el criterio del orden.
2. **El descarte dejó de ser silencioso.** Cuando se descarta algo, el log dice cuántos conceptos se
   detectaron, cuántos entran y **de qué bloques** se perdieron.
3. **Test unitario** del reparto y de `dividirEnBloques` (`tests/texto.test.ts`), incluido el caso
   medido (4 bloques / 17 candidatos / tope 10) que es exactamente el que fallaba antes.

**Verificación del fix, mismo corpus y modelo que la medición:**

| | Último bloque representado | Reparto por bloque |
|---|---|---|
| Antes (`slice` sobre orden global) | **1 de 2** | b1:5 b2:5 b3:0 b4:0 → el último bloque pierde 1 |
| Después (reparto por cuota) | **2 de 2** | b1:3 b2:3 b3:2 b4:2 |

Los 10 sub-temas finales salen en orden de lectura y el último de la lista es del bloque 4, o sea
del final del documento. La corrida contra Ollama se hizo con un script temporal ya borrado; lo que
queda en el repo son los tests, que fijan el comportamiento sin depender del modelo.

**Lo que sigue pendiente de esta sección es una sola cosa:** `subtemas.fragmento` + usarla en
preguntas y material (que también es el prerrequisito de §12.3). La partición sin IA, la
sub-tema-por-módulo, el dedup, la cobertura, el presupuesto **y el reparto del corte final ya
están.**

### 12.3 Preguntas: menos, mejores y sin repetición (e, f, i)

**Causa de la repetición.** Se pide "N preguntas sobre X" y el modelo devuelve N versiones de lo mismo. Los
filtros de similitud (§10) la detectan *después*; el rediseño la evita *por construcción*.

**Ranuras.** El código asigna a cada pregunta una ranura distinta y el modelo solo la rellena:

| Eje | Valores propuestos |
|---|---|
| Tipo | `predecir_salida` (solo con código ejecutable), `encontrar_bug`, `por_que` (conceptual), `completar_codigo`, `elegir_patron` (qué hook o patrón usar) |
| Nivel | `recordar`, `aplicar`, `analizar` |

Reglas de asignación (todas en código, testeables): el cribado usa nivel `aplicar`; si el fragmento no tiene
código solo entran tipos conceptuales; ante un error, la segunda ranura es de **otro tipo**; si acierta, no se
pregunta más de ese sub-tema. Se guarda la ranura en la pregunta (`preguntas.ranura`, propuesta).

**Respuesta correcta por ejecución.** En JS puro (closures, métodos de array, destructuring, orden de async…)
el código ejecuta el snippet y **el resultado real es la opción correcta**; el modelo solo inventa
distractores plausibles. Elimina la clase de error "respuesta mal marcada" y hace innecesario el juez en esas
preguntas. **Límites:** JSX y componentes no se ejecutan así, y ahí sigue LLM + juez; el snippet generado por
el modelo hay que ejecutarlo aislado. *Decisión propuesta:* ejecutar en el `iframe sandbox` que ya existe
(`components/aprender/*`, timeout de 3 s) durante la etapa de preparación (§12.5), en vez de `node:vm` en el
servidor, que no es un límite de seguridad.

**Distractores con sentido.** Las mejores opciones incorrectas son errores reales: `respuestas` ya guarda la
opción elegida, y las confusiones previas sobre un concepto (§12.6) entran como distractor. Se suma un
**catálogo corto (10-20)** de errores típicos de React (closure obsoleto, dependencias faltantes, mutar
estado, `key` ausente o inestable…) que el modelo instancia sobre el tema.

**Semántica de "dominado" (decisión pendiente).** Hoy un sub-tema pasa a dominado con 2 aciertos seguidos
(`ACIERTOS_SEGUIDOS_PARA_DOMINAR`) y eso decide la ruta del plan (`calcularRutaSubtema`). Con una pregunta por
sub-tema en el sondeo no se llega a 2 aciertos, y con 4 opciones 2 aciertos seguidos son ~6% por azar.
Propuesta: separar dos estados:

- `sabido_probable`: un acierto de nivel `aplicar` en el sondeo; alcanza para elegir la ruta `asegurar`.
- `dominado`: al menos 3 intentos acertados acumulados entre sondeo, práctica y repasos; es el que alimenta
  el repaso espaciado (§11.3).

Tocar esto obliga a revisar `registrarRespuesta`, `calcularRutaSubtema` y los 36 asserts de
`.smoke-fase-cd.ps1`.

### 12.4 Enseñar de verdad (c, e)

- **Roles fijos por explicación**, asignados por código: modelo mental, ejemplo resuelto paso a paso, error
  común, caso límite. El modelo recibe el rol y los títulos de las explicaciones ya generadas, así que no las
  repite.
- **Secuencia con andamiaje que se retira:** ejemplo resuelto → ejercicio con huecos → ejercicio solo. Reemplaza
  el ciclo "3 explicaciones y 1 ejercicio" del diseño original.
- **Extractivo primero:** la explicación parte del fragmento del propio apunte (`subtemas.fragmento`) y el
  modelo lo reformula y lo ejemplifica; no inventa desde cero.
- **Plantilla de ejercicio** con campos fijos: objetivo, qué hacer, entrada y salida esperadas, pista
  escalonada. `lib/aprender.ts::parsearEjercicios` rechaza los que no traen todos los campos (hoy ya descarta
  y deja log; se suma la validación de plantilla).
- **Mensaje de error ligado a la confusión concreta** (§6 ítem 8): la opción elegida ya se guarda, falta usarla
  en la pantalla de Enseñar.

### 12.5 Fase completa antes de mostrarla (h)

Una pantalla **"Preparando tu sesión"** con progreso real: genera todo el material de la fase, lo verifica y
recién entonces muestra, y cada pregunta o ejercicio aparece sin espera.

- Pasos visibles: generar → verificar (ejecutar código, validación local, similitud, juez donde corresponda) →
  guardar → listo.
- El estado de la preparación se persiste en la base (mismo principio del resto: la pantalla se reconstruye
  desde el servidor, recargar no pierde el avance). Consulta por polling al principio; algo más sofisticado
  solo si hace falta.
- Concurrencia acotada y configurable: en una GPU de 10 GB más paralelismo no acelera; con un proveedor de
  nube se puede subir.
- La pre-generación en background (`lanzarPregenSiConviene`) queda solo para las preguntas de profundización
  del sondeo adaptativo; el resto se genera antes.
- **Enseñar** también se prepara entero: el material de todos los sub-temas de la ruta antes de entrar, en
  vez de generar un bloque al abrir cada sub-tema.
- El tiempo aceptable es **un objetivo a medir, no una promesa**: se fija con la línea base de §12.1 (local
  contra nube).

### 12.6 Memoria entre sesiones (b)

Se mantiene la Fase 1 de §11.2 (tabla `conceptos`, `subtemas.concepto_id`, punto de escritura único en
`agregarSubtema()`), con un cambio en cómo se reconoce que dos sub-temas son el mismo concepto:

1. **Nombre normalizado exacto** (`normalizarParaSimilitud`), como en §11.2.
2. **Embeddings locales** con `nomic-embed-text` (ya instalado; hoy solo se filtra de la lista de modelos):
   similitud coseno con umbral **conservador**; los casos dudosos se le preguntan una vez al usuario.

> **Medición que justifica los embeddings (30/09, 3ª pasada, §12.1):** sobre los 71 sub-temas reales,
> el nombre normalizado exacto fusiona 10 grupos (22 filas) pero deja **21 pares con similitud ≥ 0.34
> que no colisionan**, varios inequívocamente el mismo concepto (`"uso del hook usestate"` ~
> `"uso de usestate"`, 0.67). O sea: la regla determinista sola resuelve menos de la mitad de la
> duplicación real. **Los embeddings son la parte que hace el trabajo, no un extra.**

Por qué es compatible con el principio de §11.2: es local, barato, determinista para un modelo fijo y
testeable con fixtures. **Riesgo a cubrir:** los falsos positivos entre conceptos vecinos (`useState` /
`useReducer`, `useEffect` / `useLayoutEffect`). El umbral se calibra con un set de pares duplicados reales y
de pares vecinos que **no** deben fusionarse, y ese set queda como test.

Los mismos embeddings sirven para detectar **preguntas repetidas por paráfrasis**, que la comparación de
strings de `lib/validacion.ts` no ve.

El historial de confusiones por concepto no necesita tabla nueva: se consulta desde `respuestas` a través de
`subtemas.concepto_id`. Repaso espaciado y progreso visible siguen como §11.3-§11.4.

### 12.7 Rendimiento con LLM locales (a)

- **Que lo frecuente quepa en VRAM.** `gemma4:26b` pesa 17 GB y la GPU tiene 10 GB: se desborda a RAM, lo que
  explica las llamadas de 2+ minutos registradas. Los defaults de `lib/config.ts` deben ser modelos que
  quepan (`gemma4:e2b` ocupa 6.7 GB según §11.7; confirmar `e4b` con `ollama ps`). Lo grande, pocas veces o en
  la nube. Coincide con el ítem 17 de §6.
  **Tamaños medidos en `/api/tags` (30/09, 3ª pasada):** `gemma4:26b` **17.3 GB**, `gemma4:e4b` 8.9,
  `deepseek-r1:14b` 8.4, `gpt-oss:20b` 12.8, `gemma4:e2b` 6.7, `mistral-nemo:12b` 6.6,
  `llama3.1:8b` 4.6, `gemma3:4b` 3.1. **Contra 10 GB de VRAM, el default de preguntas actual
  (`gemma4:26b`, 17.3 GB) no puede residir en GPU.** El default de §11.7 (`gemma4:e2b`, 6.7 GB) sí.
  Con `gemma3:4b` la extracción por bloques del §12.2 tardó 4.0 s contra 1.7 s de `e2b`: la diferencia
  es aceptable para plumbing, no para el camino caliente.
  **Dato de cooler:** con `gemma4:e2b`, mandar `think: false` en `/api/generate` no es un detalle
  cosmético. Sin él, la extracción por bloques devolvió **response vacío en los 4 bloques**
  (`done_reason: "length"`): el modelo gastaba los 600 tokens en razonamiento y no llegaba al JSON.
  El repo ya lo manda (`lib/ollama.ts:105`), pero cualquier llamada nueva que lo omita falla en
  silencio con un `parsearListaSubtemas` que tira "no es un array JSON".
- **No alternar modelos grandes dentro de una sesión:** cada cambio recarga pesos. Un modelo residente para
  todo y, si hace falta, un proveedor de nube para lo pesado.
- **Menos tokens de entrada:** el fragmento del sub-tema en vez del texto completo (§12.2).
- **Caché de generación** por clave `hash(fragmento + ranura + modelo)` (tabla propuesta
  `cache_generacion`): regenerar lo ya generado cuesta cero y se reutiliza entre sesiones.
- **Opciones de Ollama a probar y medir:** `OLLAMA_FLASH_ATTENTION=1` y `OLLAMA_KV_CACHE_TYPE=q8_0`
  (menos VRAM para contexto). Verificar que la versión instalada las soporte; no se da por hecho el efecto.
- **La mayor ganancia es hacer menos llamadas:** sin juez en las preguntas verificadas por ejecución, una
  pregunta por sub-tema en el cribado, y partición sin IA.

### 12.8 Calidad y menos errores (d, f)

- **Tests para lo determinista** (hoy 0, §7): `lib/texto.ts` (incluido **`dividirEnBloques`**, que
  entró sin un assert), `lib/validacion.ts`,
  `lib/db.ts::registrarRespuesta`, `elegirSiguienteSubtema`, y lo nuevo (asignación de ranuras:
  sin repetición y respetando las reglas). Runner mínimo a elegir (vitest, o `node:test` con `tsx`).
  Incluye los dos asserts del fail-open del juez (§6, ítem 0b).
- **`npm run verify`:** `tsc`, `eslint`, tests y los humos, más un chequeo de **llamadores** (exports de
  `lib/` sin ningún import, para que un caso como el del juez de §10.1 salte solo; con lista de excepciones
  para el código muerto ya anotado: `guardarPregunta`, `generarPregunta`, `actualizarFaseSesion`).
- **Botón "esta pregunta está mal"** (§6 ítem 15): la descarta y la guarda con su motivo.
- **Set de prueba del juez** (`tests/golden/`, propuesto): 15-20 preguntas etiquetadas, malas (respuesta mal
  marcada, explicación contradictoria, ambigua, no respondible con el texto, casi duplicada) y buenas. Se
  alimenta del botón anterior. Métrica: cuántas malas detecta y cuántas buenas descarta, no solo la tasa
  global de descarte.
- **Matiz a §11.7:** probar con el modelo más chico vale para el plumbing. La **calibración del juez** se hace
  con el modelo que realmente se usará como juez, y el juez **no debe ser el mismo modelo que generó** la
  pregunta.
- **Partir `app/page.tsx`** (935 líneas, §6 ítem 13): además de deuda técnica, el tamaño del archivo está
  ligado a que el harness rompa las ediciones parciales.

### 12.9 Orden vigente y cómo se verifica cada paso

Reemplaza el orden de §11.8 y el de §6 (que queda como inventario de pendientes).

> **Ajustado en la 3ª pasada (30/09).** El Paso 0 se hizo parcialmente (causa de (g), colisiones de
> nombre y tamaños de modelo ya están medidos y anotados; falta el juez, Enseñar en navegador y la
> línea base completa) y el Paso 2 está **cerrado**: `8a4744a` construyó la cobertura y el reparto por
> cuota (2b) arregló el corte que se llevaba el final del documento. El Paso 1 está **a medias**:
> ya hay runner y 39 tests, falta partir `page.tsx`, el `verify` y el botón de "pregunta mala".

| Paso | Qué entrega | Se verifica con | Riesgo |
|---|---|---|---|
| 0. Medir | ~~Causa de (g)~~ ✅, ~~colisiones de nombre~~ ✅. Falta: juez real, Enseñar en navegador, línea base de GPU/RAM | Números anotados en este documento | Ninguno |
| 1. Base | **Parcial:** runner (`vitest`) + 39 tests ✅. Falta: partir `page.tsx`, `npm run verify` con chequeo de callers, botón "pregunta mala", set de prueba del juez, tests de `validacion.ts` y del fail-open | `npm run verify` en verde; tests del fail-open | Bajo |
| 2. Cobertura | ✅ **Cerrada:** bloques, presets, presupuesto (`8a4744a`) + reparto del corte (2b). **2c (único resto):** `subtemas.fragmento` + usarla en preguntas y material | Texto con N secciones → todas aportan, con tope activo el último bloque sigue representado | Bajo |
| 3. Ranuras y verificación | Ranuras, respuesta por ejecución, distractores, estados `sabido_probable` / `dominado` | Tests de ranuras; humos C1 y C/D actualizados | Medio-alto: cambia la semántica de dominio |
| 4. Preparando | Pantalla de preparación persistida, Enseñar preparado entero | Recargar en medio de la preparación; humo nuevo | Medio |
| 5. Memoria | `conceptos` con embeddings (§12.6 = Fase 1 de §11) | Dos sesiones con temas en común → un concepto con `veces_visto = 2`; test de pares vecinos | Bajo-medio |
| 6. Enseñar rediseñado | Roles, andamiaje, extractivo, plantilla de ejercicio | Humo de Enseñar; golden de ejercicios | Medio |
| 7. Repaso, progreso, videos | Fases 2-4 de §11 | Según §11 | Según §11 |

Por qué el resto del orden: la base evita romper lo verificado; la cobertura va antes que las ranuras porque las
ranuras necesitan el fragmento por sub-tema; "Preparando" va antes que la memoria porque define el flujo y es
donde se verifica; el repaso espaciado va último porque necesita conceptos y una señal de dominio fiable.

**Método:** un commit por paso; tareas chicas al harness y verificación con `git --no-pager diff`; los archivos
con texto en español se editan con Node y no con PowerShell (reglas de trabajo ya vigentes).

### 12.10 Decisiones, pendientes y límites

**Decisiones a no revertir (propuestas, pendientes de confirmar con la medición del Paso 0):**
- El código decide estructura, ranuras y orden; el modelo solo redacta cada pieza.
- Lo que se pueda ejecutar se verifica ejecutando, no preguntándole al modelo.
- Nada llega al usuario sin pasar por la etapa de preparación y verificación.

**Pendientes de decisión:**
- Semántica de `sabido_probable` / `dominado` (§12.3) y su impacto en `calcularRutaSubtema`.
- Umbral de similitud y política de confirmación para embeddings (§12.6).
- Dónde ejecutar los snippets: `iframe sandbox` durante la preparación (propuesto) o servidor.
- Cuál es hoy el tope real de sub-temas (§12.1) — **resuelto en la 3ª pasada:** 6 / 10 / 12 según el
  preset (`maxSubtemas`), no un `MAX_SUBTEMAS` único.

**Lo que este plan no promete:**
- La calidad de la **redacción** de explicaciones y ejemplos sigue dependiendo del modelo; el código garantiza
  estructura, verificación y ausencia de repetición, no que la explicación sea buena. Por eso el set de prueba
  y el botón de "pregunta mala" son parte del plan y no un extra.
- La verificación por ejecución cubre JS puro; JSX y componentes siguen necesitando juez.
- Ninguna cifra de tiempo o de descarte está medida todavía.

## 13. Tanda del 30/09: reparto por cuota + arranque de los tests

Dos cosas cerradas en la misma tanda, porque la segunda es lo que permite no volver a romper la
primera sin avisarse. Todo verificado con el mismo corpus y modelo que §12.2.

### 13.1 El fix: el corte final ya no se lleva el final del documento

**Qué estaba mal.** `extraerSubtemas` terminaba en `ordenarPorAparicion(unicos, texto).slice(0, maxSubtemas)`:
una sola operación para dos decisiones distintas. Ordenar por aparición es correcto —el sub-tema 1
del apunte es el primero que se estudia—, pero usar **ese mismo orden como criterio de selección**
hacía que el tope siempre cortara por el final del documento.

**Qué se hizo.** Separar las dos decisiones con una función pura, `repartirPorCuota(candidatos,
bloqueDe, max)` (`lib/texto.ts`):

- `extraerSubtemas` ahora arrastra el bloque de origen de cada candidato (`{nombre, bloque}`), que
  antes se perdía al aplanar con `.flat()`.
- **Seleccionar** es por reparto de cuota (ronda 1: uno por bloque; ronda 2: completa por orden de
  aparición si sobró lugar). **Ordenar** sigue siendo por aparición, sobre los ya seleccionados.
- La pasada de cobertura asigna sus candidatos al último bloque, porque mira inicio y final.
- Cuando se descarta algo, el log lo dice: cuántos conceptos se detectaron, cuántos entran y **de
  qué bloques** se perdieron. El descarte dejó de ser silencioso.

**Evidencia (mismo corpus, `gemma4:e2b`, 4 bloques, 17 candidatos, tope 10):**

| | Del último bloque entran | Reparto por bloque |
|---|---|---|
| Antes | **1 de 2** | b1:5 b2:5 b3:0 b4:0 |
| Después | **2 de 2** | b1:3 b2:3 b3:2 b4:2 |

El último sub-tema de la lista final es del bloque 4, o sea del final del documento.

### 13.2 Los tests (39) y qué fijan

`vitest` + `npm test` + `npm run typecheck`. `tests/texto.test.ts` (26) y `tests/db.test.ts` (13),
este último contra una base temporal propia (`USELEARN_DB` en `$TEMP`) que se borra al terminar, así
que `useLearn.db` no se toca.

Lo que queda fijado, y que antes dependía de que nadie lo tocara:

- `repartirPorCuota`: el caso medido (el último bloque entra), el tope exacto, el reparto parejo
  (diferencia ≤ 1 entre bloques), el orden dentro de cada bloque, que no duplique, topes 4/6/8/10/12,
  y que un bloque corto no monopolice.
- `dividirEnBloques`: que no se pierda texto al agrandar, que no corte palabras, 0 bloques con texto
  vacío, 1 bloque con texto corto.
- `registrarRespuesta`: que guarda la opción elegida, que hace match sin depender de mayúsculas o
  espacios, que acumula contadores, que un error resetea los aciertos seguidos, que es idempotente,
  que descarta las sobrantes al dominar, y **el guard de §3.2** (responder una pregunta descartada no
  toca el desempeño del sub-tema).
- `elegirSiguienteSubtema`, `sondeoCompleto`, `eliminarSesion` (orden de borrado por FKs).

### 13.3 Verificación de la tanda

| Comando | Resultado |
|---|---|
| `npm test` | **39/39 PASS** (2 archivos) |
| `npx tsc --noEmit` | 0 errores |
| `npm run lint` | 0 errores, 0 warnings |
| `npm run build` | OK (13 rutas) |
| Corrida contra Ollama (`gemma4:e2b`) | reparto verificado sobre el corpus real; script temporal borrado |

**Un cambio de tooling:** `eslint.config.mjs` ahora ignora `.tmp-*`. Los scripts de una sola vez ya
estaban en `.gitignore`, pero `npm run lint` no lo miraba y fallaba con uno que ya estaba en el repo
(`.tmp-brace.cjs`). No es cosmético: **el lint tenía que estar rojo y no se notó**, porque hace un
par de commits que nadie lo corrió. Es el mismo modo de falla de §10.1.

### 13.4 Lo que esta tanda NO cubre

- **El juez sigue sin medir** (§10.5, ítem 0): no hay test de su fail-open ni corrida con modelo real.
- **`lib/validacion.ts` y `lib/sondeo.ts` sin tests**: la capa de validación de preguntas y el armado
  de payloads siguen dependiendo de verificación manual.
- **No hay `npm run verify`**: typecheck, lint y tests se corren por separado, así que es posible
  commitear con uno en rojo (como pasó con el lint).
- **`page.tsx` sigue en 935 líneas** y `ModalAjustes` sin extraer.
- **El reparto está verificado con un corpus y un modelo.** El test fija la lógica, no que el modelo
  detecte bien los conceptos: eso sigue siendo cuestión de prompt, no de código.