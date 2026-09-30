# useLearn — estado real verificado (última pasada: 30/09/2026)

Este archivo reemplaza al panorama del documento de diseño, que quedó desactualizado.
No describe lo que *debería* ser: describe lo que **verifiqué** en el repo y en la base
real, después de cerrar **Fase A (cimientos)**, **Fase B (velocidad)**, **C1**
(modalidades de entrada), **C2** (rutas y fases persistidas), **D** (Enseñar/Practicar)
y el **filtro de calidad de preguntas** (validación local + juez semántico).

Base de la verificación (HEAD `71e04b6`):

- Lectura completa de `lib/*`, `app/api/**`, `app/page.tsx`, `app/sondeo/[id]/page.tsx`, `components/**`.
- Consultas SQL directas a `useLearn.db` (sesiones, subtemas, preguntas, respuestas).
- Pruebas end-to-end contra `next dev` + Ollama `gemma3:4b`, con un cliente que emula al front:
  GET inicial → merge `responder`+`siguiente` → caché de lote en memoria → pre-generación.
- Humos end-to-end en PowerShell contra una base temporal: `.smoke-c1.ps1` (21 asserts) y
  `.smoke-fase-cd.ps1` (36 asserts), corridos con `gemma4:e2b` y con el default `gemma4:26b`.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`.

> **Advertencia de método (30/09):** `tsc` y `build` en verde **no** significan que una
> feature esté conectada. El juez semántico compilaba perfecto y no se llamaba desde ningún
> lado: el usuario recibía las preguntas sin filtrar. Ver §10.1. Antes de dar por buena una
> feature nueva, hay que grepar quién la invoca.

## 1. Estado por módulo

| Módulo | Archivos | Estado verificado |
|---|---|---|
| Ingesta | `app/page.tsx`, `app/api/archivos/extraer-pdf`, `lib/texto.ts` | Texto/md pegado + PDF. El `topic` ya no es `slice(0,50)`: `derivarTema()` saltea encabezados y nombres de archivo (en la base se lee "Challenge: Date Counter (Step + Count + fecha dinámica)"). Falta solo el export a Obsidian y el import de notas (Fase E). Con C1 hay modalidades de entrada (apunte pegado/PDF o tema libre con nivel + objetivo) y confirmación de sub-temas: la landing muestra lo detectado y podés desmarcar lo que no te interesa antes de que arranque el sondeo. |
| Sub-temas | `lib/ollama.ts::extraerSubtemas` | Usa el modelo y el proveedor elegidos en Ajustes (antes llamaba al default hardcodeado). Manda un head de 3.5k chars, no el PDF entero. |
| Sondeo | `lib/sondeo.ts`, `app/api/sondeo/*`, `FaseSondeo.tsx` | Un roundtrip por pregunta (merge), caché de lote en memoria, atajos 1-4/Enter, fila respondida compacta memoizada, reanudable al recargar. **Desde 30/09 las preguntas pasan por dos filtros de calidad antes de servirse** (ver §10). |
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
| 1. Sondeo | 30 | End-to-end con respuestas reales, dominio con contadores reales, reanudable, batching + pre-gen + atajos, **dos filtros de calidad de preguntas** (local + juez, gateado por preset) | 92% | 27.6 |
| 2. Plan | 10 | Server-driven y reanudable, débiles + sin dominar, Mermaid por CDN, grafo en estrella, salida a Enseñar con la fase persistida | 85% | 8.5 |
| 3. Enseñar | 35 | Rutas por sub-tema, material generado y cacheado, quiz + código con assertions, sandbox aislado, aprobados persistidos | 75% | 26.3 |
| 4. Cerrar | 15 | Pantalla mínima (stepper + feedback); falta la comparativa, la mezcla de preguntas y el export | 20% | 3.0 |
| Transversal (ajustes, proveedores, historial, ingesta, DB) | 10 | Sólido: gateway, defaults centralizados, DB endurecida, ESLint limpio; sin tests unitarios (hay 2 humos end-to-end), sin modal extraído | 85% | 8.5 |
| **Total** | 100 | | | **≈ 74 / 100** |

Lectura honesta: el **ciclo de diagnóstico** (detectar qué no sabés) está ~92% y el **ciclo de
aprendizaje** (arreglar lo que no sabés) sigue en 0%. La auditoría previa estimaba ≈37; Fase A y B
sumaron los ~6 puntos, y esta pasada corrigió cuatro bugs que hacían que los números fueran
mentira (feedback en JSON, preguntas abandonadas contadas, pre-gen muerta, sub-temas sin evaluar
invisibles).

**Los +1 del filtro son una estimación con asterisco:** la feature está conectada y compila, pero
no se midió contra un modelo real (§10.5). Si el juez resulta demasiado estricto y vacía lotes, el
número es peor, no mejor. Es el único ítem del panorama sin evidencia de runtime.

## 6. Qué sigue (ordenado por relación valor/riesgo)

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
3. Stepper persistente Sondeo · Plan · Enseñar · Cerrar arriba de todo. **Sigue igual:** no hay
   stepper en `app/sondeo/[id]/page.tsx` (139 líneas, sin referencia).
4. Regla de dominio real: mínimo 3 intentos por sub-tema antes de poder dominarlo (hoy se domina
   con 2 aciertos/2 intentos, `ACIERTOS_SEGUIDOS_PARA_DOMINAR`) + `proximo_repaso` para el repaso
   espaciado. **Sigue igual:** `proximo_repaso` no existe en `lib/db.ts`; solo la constante de
   2 aciertos en `db.ts:590`.

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
    en una sola sesión de prueba). Depende de `proximo_repaso` (Fase C, punto 4).
12. Import desde la carpeta de notas con `fs` (solo lectura, whitelist).

**Deuda técnica**
13. Extraer `ModalAjustes` de `app/page.tsx`. **Creció:** el texto decía 645 líneas; ahora son
    **886**. El modal ya no es el único problema del archivo.
14. Tests automatizados (hoy 0): al menos `lib/texto.ts`, `lib/db.ts::registrarRespuesta`,
    el armado de payloads de `servirSiguiente` y **`lib/validacion.ts`** (comparar strings es
    barato de testear y es la capa que más riesgos de regresión tiene).
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
- **Tope de 20 respuestas:** con muchos sub-temas el sondeo puede cerrar por el tope sin evaluarlos
  a todos; ahora eso se ve como "quedaron sin dominar" en vez de pasar por "dominado".
- **Sin tests:** toda la verificación de esta pasada fue manual + scripts temporales (borrados).
  Los 2 humos no cubren el filtro de preguntas (§10.5).
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







