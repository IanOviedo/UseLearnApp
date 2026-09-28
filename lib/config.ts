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
