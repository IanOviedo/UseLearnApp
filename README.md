## How AI is used / Cómo se usa la IA

**EN:** The code decides, the model drafts. Structure, order, mastery and
review scheduling are deterministic and tested; the LLM only writes each
piece (question text, distractors, explanations, exercises), and the code
verifies the result.

- **Sub-topic extraction:** the text is split into blocks without AI, and
  the model extracts sub-topics per block, with a quota so the end of long
  documents isn't dropped.
- **Question batches:** one model call per sub-topic generates a batch that
  is stored and served one at a time (no waiting between questions).
- **Quality filters:** local validation (duplicates, balanced options,
  empty explanations) plus an LLM judge, calibrated against a labeled
  golden set.
- **Mastery and review:** answers update per-concept counters; a Leitner
  3-box schedule (1/3/7 days) decides what to review.
- **Providers:** local models via Ollama, or any OpenAI-compatible cloud
  provider (configurable in Settings).

**ES:** El código decide, el modelo redacta. La estructura, el orden, el
dominio y el calendario de repasos son deterministas y están testeados; el
LLM solo escribe cada pieza (enunciados, distractores, explicaciones,
ejercicios) y el código verifica el resultado.

- **Extracción de sub-temas:** el texto se divide en bloques sin IA y el
  modelo extrae sub-temas por bloque, con cuota para no perder el final de
  documentos largos.
- **Lotes de preguntas:** una llamada por sub-tema genera un lote que se
  guarda y se sirve de a una (sin esperas entre preguntas).
- **Filtros de calidad:** validación local (duplicados, opciones
  balanceadas, explicación vacía) más un juez LLM calibrado con un set
  etiquetado.
- **Dominio y repaso:** las respuestas actualizan contadores por concepto;
  un esquema Leitner de 3 cajas (1/3/7 días) decide qué repasar.
- **Proveedores:** modelos locales con Ollama o cualquier proveedor de nube
  compatible con OpenAI (configurable en Ajustes).
