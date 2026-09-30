# useLearn — estado real verificado (última pasada: 29/09/2026)

Este archivo reemplaza al panorama del documento de diseño, que quedó desactualizado.
No describe lo que *debería* ser: describe lo que **verifiqué** en el repo y en la base
real, después de cerrar **Fase A (cimientos)**, **Fase B (velocidad)**, **C1**
(modalidades de entrada), **C2** (rutas y fases persistidas) y **D** (Enseñar/Practicar).

Base de la verificación (HEAD `b6a5fd3` + los cambios locales de esta pasada):

- Lectura completa de `lib/*`, `app/api/**`, `app/page.tsx`, `app/sondeo/[id]/page.tsx`, `components/**`.
- Consultas SQL directas a `useLearn.db` (sesiones, subtemas, preguntas, respuestas).
- Pruebas end-to-end contra `next dev` + Ollama `gemma3:4b`, con un cliente que emula al front:
  GET inicial → merge `responder`+`siguiente` → caché de lote en memoria → pre-generación.
- Humos end-to-end en PowerShell contra una base temporal: `.smoke-c1.ps1` (21 asserts) y
  `.smoke-fase-cd.ps1` (36 asserts), corridos con `gemma4:e2b` y con el default `gemma4:26b`.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## 1. Estado por módulo

| Módulo | Archivos | Estado verificado |
|---|---|---|
| Ingesta | `app/page.tsx`, `app/api/archivos/extraer-pdf`, `lib/texto.ts` | Texto/md pegado + PDF. El `topic` ya no es `slice(0,50)`: `derivarTema()` saltea encabezados y nombres de archivo (en la base se lee "Challenge: Date Counter (Step + Count + fecha dinámica)"). Falta solo el export a Obsidian y el import de notas (Fase E). Con C1 hay modalidades de entrada (apunte pegado/PDF o tema libre con nivel + objetivo) y confirmación de sub-temas: la landing muestra lo detectado y podés desmarcar lo que no te interesa antes de que arranque el sondeo. |
| Sub-temas | `lib/ollama.ts::extraerSubtemas` | Usa el modelo y el proveedor elegidos en Ajustes (antes llamaba al default hardcodeado). Manda un head de 3.5k chars, no el PDF entero. |
| Sondeo | `lib/sondeo.ts`, `app/api/sondeo/*`, `FaseSondeo.tsx` | Un roundtrip por pregunta (merge), caché de lote en memoria, atajos 1-4/Enter, fila respondida compacta memoizada, reanudable al recargar. |
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
| 1. Sondeo | 30 | End-to-end con respuestas reales, dominio con contadores reales, reanudable, batching + pre-gen + atajos | 90% | 27.0 |
| 2. Plan | 10 | Server-driven y reanudable, débiles + sin dominar, Mermaid por CDN, grafo en estrella, salida a Enseñar con la fase persistida | 85% | 8.5 |
| 3. Enseñar | 35 | Rutas por sub-tema, material generado y cacheado, quiz + código con assertions, sandbox aislado, aprobados persistidos | 75% | 26.3 |
| 4. Cerrar | 15 | Pantalla mínima (stepper + feedback); falta la comparativa, la mezcla de preguntas y el export | 20% | 3.0 |
| Transversal (ajustes, proveedores, historial, ingesta, DB) | 10 | Sólido: gateway, defaults centralizados, DB endurecida, ESLint limpio; sin tests unitarios (hay 2 humos end-to-end), sin modal extraído | 85% | 8.5 |
| **Total** | 100 | | | **≈ 73 / 100** |

Lectura honesta: el **ciclo de diagnóstico** (detectar qué no sabés) está ~90% y el **ciclo de
aprendizaje** (arreglar lo que no sabés) sigue en 0%. La auditoría previa estimaba ≈37; Fase A y B
sumaron los ~6 puntos, y esta pasada corrigió cuatro bugs que hacían que los números fueran
mentira (feedback en JSON, preguntas abandonadas contadas, pre-gen muerta, sub-temas sin evaluar
invisibles).

## 6. Qué sigue (ordenado por relación valor/riesgo)

**Fase C — el Plan de verdad (chica, 1 sesión)**
1. Botón "Empezar a aprender" en `FasePlan` + `actualizarFaseSesion(id, "ensenar")`: hoy es un
   callejón sin salida y es lo único que bloquea Fase D.
2. Grafo propio en SVG (nodos con el mismo estilo `rounded-2xl border-neutral-800/60`) y sacar
   Mermaid del CDN. Con `respuestas` ya poblada se pueden dibujar **aristas de error** ("elegiste
   la opción de cleanup cuando la pregunta era de dependencias") y el mapa pasa a ser un
   diagnóstico personalizado.
3. Stepper persistente Sondeo · Plan · Enseñar · Cerrar arriba de todo.
4. Regla de dominio real: mínimo 3 intentos por sub-tema antes de poder dominarlo (hoy se domina
   con 2 aciertos/2 intentos) + `proximo_repaso` para el repaso espaciado.

**Fase D — Enseñar (la grande)**
5. Tablas `explicaciones`, `ejercicios`, `intentos_ejercicio` (mismo patrón de migración que ya
   usa `lib/db.ts`).
6. 3 explicaciones + 1 ejercicio por sub-tema débil, con el mismo patrón de lote + JSON Schema que
   ya funciona para las preguntas.
7. CodeMirror 6 + runner en `iframe sandbox="allow-scripts"` con assertions.
8. Explicación anclada al error concreto: la opción elegida ya se guarda, así que "elegiste X, la
   correcta era Y, por esto" es posible sin llamadas extra.

**Fase E — Cerrar y largo plazo**
9. Pantalla de cierre (comparativa, mapa completo, mezcla de preguntas, próximo tema).
10. Export a Obsidian (`.md` con bloque `mermaid` + debilidades + ejercicios con soluciones).
11. Repaso espaciado en la landing: los lotes abandonados ya son material (18 filas descartadas
    en una sola sesión de prueba).
12. Import desde la carpeta de notas con `fs` (solo lectura, whitelist).

**Deuda técnica**
13. Extraer `ModalAjustes` de `app/page.tsx` (hoy 645 líneas, ~250 de JSX del modal).
14. Tests automatizados (hoy 0): al menos `lib/texto.ts`, `lib/db.ts::registrarRespuesta` y el
    armado de payloads de `servirSiguiente`.
15. Botón "esta pregunta está mal" (descarta y regenera el sub-tema).
16. Modos de estudio (tema libre, desafío de código, error/stack trace, repaso) sobre las mismas
    tablas + un campo `modo`.
17. Defaults de modelo: para preguntas sigue `gemma4:26b` (17 GB) aunque alcanza con `gemma4:e2b` o
    `llama3.1:8b`; reservar el 26b para feedback y extracción.

## 7. Límites y riesgos conocidos

- **Pre-generación vs velocidad del usuario:** si respondés más rápido de lo que tarda el modelo,
  el lote llega tarde igual (medido: 5,1 s vs 8 ms de transición). Con `gemma4:26b` una transición
  puede seguir tardando aunque el resto del sondeo sea instantáneo.
- **Contienda por la GPU:** si la pre-generación y el pedido en primer plano coinciden, el pedido
  que esperás vos tarda más (se vio: 5,1 s con el modelo ocupado vs 2,6 s solo). En una sesión de
  prueba quedaron 2 lotes completos descartados por esa carrera; la pre-generación no duplica filas
  (re-chequeo post-generación) pero puede gastar una llamada.
- **Tope de 20 respuestas:** con muchos sub-temas el sondeo puede cerrar por el tope sin evaluarlos
  a todos; ahora eso se ve como "quedaron sin dominar" en vez de pasar por "dominado".
- **Sin tests:** toda la verificación de esta pasada fue manual + scripts temporales (borrados).
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






