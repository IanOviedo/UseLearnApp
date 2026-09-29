// Configuración central de useLearn.
// Todo valor que estaba hardcodeado y repetido en varios archivos vive acá.

/** Modelo por defecto para extraer sub-temas y generar el feedback final. */
export const MODELO_PRINCIPAL_POR_DEFECTO = "gemma4:26b";

/** Modelo por defecto para generar las preguntas del sondeo. */
export const MODELO_PREGUNTAS_POR_DEFECTO = "gemma4:26b";

/** Modelo por defecto de un proveedor de nube compatible con OpenAI. */
export const MODELO_NUBE_POR_DEFECTO = "openai/gpt-oss-120b";

/** Modelo de la integración nativa con Gemini (cuando no hay proveedor configurado). */
export const MODELO_GEMINI = "gemini-flash-latest";

/** URL base de la API nativa de Gemini, para cuando no hay proveedor configurado. */
export const URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";

/** Cantidad máxima de sub-temas que se aceptan al extraerlos del texto de estudio. */
export const MAX_SUBTEMAS = 6;

/** Tope de seguridad: al alcanzar esta cantidad de respuestas, el sondeo cierra igual. */
export const MAX_PREGUNTAS_SESION = 20;

/** Aciertos seguidos necesarios para considerar un sub-tema dominado. */
export const ACIERTOS_SEGUIDOS_PARA_DOMINAR = 2;

/** Preguntas que se piden de una sola vez por sub-tema. */
export const PREGUNTAS_POR_LOTE = 3;

/** Opciones que debe tener cada pregunta de opción múltiple. */
export const OPCIONES_POR_PREGUNTA = 4;

/** Fragmentos de nombre que delatan modelos de embeddings: no sirven para generar texto. */
export const MODELOS_NO_GENERATIVOS = ["embed", "minilm", "bge-", "rerank"];

// --- Fase B (velocidad) -------------------------------------------------------
// Todo el transporte hacia Ollama local vive acá para que gemma4:26b y otros
// modelos grandes respondan rápido y no se desperdicien recursos.

/** Mantiene el modelo cargado en VRAM entre llamadas: el 2º lote no recarga pesos. */
export const OLLAMA_KEEP_ALIVE = "30m";

/** Ventana de contexto pedida a Ollama: acotada para no hacer OOM con PDFs grandes. */
export const OLLAMA_NUM_CTX = 8192;

/** Temperatura baja = JSON determinista, menos tokens basura y menos reintentos. */
export const TEMPERATURA_JSON = 0.2;

/** Tope de tokens generados: corta de raíz la verborragia si el modelo divaga. */
export const NUM_PREDICT_SUBTEMAS = 400;
export const NUM_PREDICT_LOTE = 1200;
export const NUM_PREDICT_FEEDBACK = 300;

/** Tamaño del excerpt por subtema: se manda esto en vez del textoOriginal entero. */
export const EXCERPT_MAX_CHARS = 1800;

/** Cuántos caracteres del head se usan para extraer sub-temas (corte por párrafo). */
export const SUBTEMAS_HEAD_CHARS = 3500;

/** Si quedan esta cantidad (o menos) de pendientes, se pre-genera en paralelo. */
export const PREGEN_UMBRAL_PENDIENTES = 1;
