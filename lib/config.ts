// Configuración central de useLearn.
// Todo valor que estaba hardcodeado y repetido en varios archivos vive acá.

/** Modelo por defecto para extraer sub-temas y generar el feedback final. */
export const MODELO_PRINCIPAL_POR_DEFECTO = "gemma4:26b";

/** Modelo por defecto para generar las preguntas del sondeo. */
export const MODELO_PREGUNTAS_POR_DEFECTO = "gemma4:26b";

/** Modelo por defecto de un proveedor de nube compatible con OpenAI. */
export const MODELO_NUBE_POR_DEFECTO = "openai/gpt-oss-120b";

/**
 * Modelo del juez semántico. Es un papel distinto al del generador de preguntas, y la medición
 * (§14.3 de ESTADO.md) justifica separarlo:
 *
 * | Modelo           | recall de las malas | falsos positivos | 12 casos |
 * |------------------|--------------------|------------------|----------|
 * | `gemma3:4b`      | 17% (1/6)          | 0%               | casi no filtra |
 * | `gemma4:e2b`     | **67% (4/6)**      | 0%               | usable y rápido |
 * | `gemma4:26b`     | 83% (5/6)          | 0%               | usable, ~30s por lote |
 *
 * `e2b` es el corte: casi el recall del 26b (que pesa 17 GB y desborda la VRAM) con 4s en vez de
 * 35s, y **cero falsos positivos** en los tres. Con `gemma3:4b` el juez no cumple su función.
 */
export const MODELO_JUEZ = "gemma4:e2b";

/** Modelo de la integración nativa con Gemini (cuando no hay proveedor configurado). */
export const MODELO_GEMINI = "gemini-flash-latest";

/** URL base de la API nativa de Gemini, para cuando no hay proveedor configurado. */
export const URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";

// --- Presets de calidad --------------------------------------------------------
// El usuario elige en Ajustes cuánto puede esperar a cambio de calidad. Todo lo que
// antes estaba hardcodeado sale de esta tabla: una sola fuente de verdad, y cualquier
// valor desconocido cae en el preset por defecto.

export type PresetCalidad = "rapido" | "equilibrado" | "profundo";

export interface AjustesCalidad {
  /** Sub-temas máximos en toda la sesión. */
  maxSubtemas: number;
  /** Sub-temas que se le piden a CADA bloque del texto. */
  maxSubtemasPorBloque: number;
  /** Tamaño de cada bloque en el que se parte el texto (cobertura del final incluido). */
  subtemasBloqueChars: number;
  /** Tope de bloques: con más, se agrandan para no perder el final del documento. */
  subtemasMaxBloques: number;
  /** Llamadas de "cobertura" si los sub-temas detectados no llegan al máximo. */
  intentosCobertura: number;
  numPredictSubtemas: number;
  /** Tope de tokens del lote de preguntas. */
  numPredictLote: number;
  /** Preguntas por lote del sondeo. */
  preguntasPorLote: number;
  /** Regeneraciones extra cuando el lote sale pobre (repetido o de baja calidad). */
  intentosRegeneracion: number;
  /** Paso previo de "ángulos" para que las preguntas cubran aspectos distintos. */
  pasosDeAspectos: boolean;
  /** Tamaño del fragmento que ve el modelo por lote: más contexto = menos genérico. */
  excerptMaxChars: number;
  numCtx: number;
  /** Pre-generar el próximo lote: en "profundo" se apaga para no competir por la GPU. */
  pregen: boolean;
  /**
   * Pasar cada pregunta por el "juez" LLM (veracidad/claridad contra el texto).
   * Cuesta una llamada extra por pregunta, así que "rapido" lo apaga: ahí el usuario
   * pidió espera mínima y solo corre la validación local (forma + duplicados).
   */
  juezSemantico: boolean;
}

export const PRESETS_CALIDAD: Record<PresetCalidad, AjustesCalidad> = {
  /** Como antes: una sola pasada y sin verificaciones extra. */
  rapido: {
    maxSubtemas: 6,
    maxSubtemasPorBloque: 6,
    subtemasBloqueChars: 8000,
    subtemasMaxBloques: 2,
    intentosCobertura: 0,
    numPredictSubtemas: 400,
    numPredictLote: 1000,
    preguntasPorLote: 3,
    intentosRegeneracion: 0,
    pasosDeAspectos: false,
    excerptMaxChars: 1800,
    numCtx: 8192,
    pregen: true,
    juezSemantico: false,
  },
  /** Nuevo default: cubre todo el texto, verifica y regenera una vez. */
  equilibrado: {
    maxSubtemas: 10,
    maxSubtemasPorBloque: 5,
    subtemasBloqueChars: 3500,
    subtemasMaxBloques: 8,
    intentosCobertura: 1,
    numPredictSubtemas: 600,
    numPredictLote: 1200,
    preguntasPorLote: 3,
    intentosRegeneracion: 1,
    pasosDeAspectos: true,
    excerptMaxChars: 2500,
    numCtx: 8192,
    pregen: true,
    juezSemantico: true,
  },
  /** Para material grande y ganas de esperar: más sub-temas, más contexto, sin pregen. */
  profundo: {
    maxSubtemas: 12,
    maxSubtemasPorBloque: 5,
    subtemasBloqueChars: 3500,
    subtemasMaxBloques: 8,
    intentosCobertura: 2,
    numPredictSubtemas: 700,
    numPredictLote: 1600,
    preguntasPorLote: 4,
    intentosRegeneracion: 2,
    pasosDeAspectos: true,
    excerptMaxChars: 3000,
    numCtx: 16384,
    pregen: false,
    juezSemantico: true,
  },
};

export const PRESET_POR_DEFECTO: PresetCalidad = "equilibrado";

/**
 * Material que "sostiene" un sub-tema (en caracteres). La cantidad de sub-temas que se le
 * piden al modelo sale de acá: pedir 10 sub-temas para un texto de 400 caracteres obliga al
 * modelo a inventar variantes del mismo concepto ("Arrays orden", "Arrays secuencia"), que
 * es justo la repetición que queremos evitar.
 */
export const CHARS_POR_SUBTEMA = 700;

/** Ajustes del preset pedido. Cualquier valor raro (o vacío) cae en el default. */
export function ajustesDePreset(preset?: string): AjustesCalidad {
  const pedido = preset as PresetCalidad | undefined;
  return (pedido && PRESETS_CALIDAD[pedido]) || PRESETS_CALIDAD[PRESET_POR_DEFECTO];
}

/** Deja el preset en un nombre válido: así se puede guardar/ecochar sin ambigüedad. */
export function normalizarPreset(preset?: string): PresetCalidad {
  const pedido = preset as PresetCalidad | undefined;
  return pedido && PRESETS_CALIDAD[pedido] ? pedido : PRESET_POR_DEFECTO;
}

/** Los valores "de fábrica" del resto del archivo salen del preset por defecto. */
const BASE: AjustesCalidad = PRESETS_CALIDAD[PRESET_POR_DEFECTO];

/**
 * Tope de seguridad del sondeo: al alcanzar esta cantidad de respuestas, cierra igual.
 * Se deriva de la cantidad de sub-temas (antes eran 20 fijos y con muchos sub-temas el
 * sondeo cerraba sin evaluarlos a todos).
 */
export const RESPUESTAS_POR_SUBTEMA = 4;
export const MAX_PREGUNTAS_SESION_MIN = 24;
export const MAX_PREGUNTAS_SESION_MAX = 60;

export function maxPreguntasSesion(subtemas: number): number {
  const calculado = Math.max(1, subtemas) * RESPUESTAS_POR_SUBTEMA;
  return Math.min(MAX_PREGUNTAS_SESION_MAX, Math.max(MAX_PREGUNTAS_SESION_MIN, calculado));
}

/** Aciertos seguidos necesarios para considerar un sub-tema dominado. */
export const ACIERTOS_SEGUIDOS_PARA_DOMINAR = 2;

// --- Memoria entre sesiones (repaso espaciado) --------------------------------
// Hasta antes de esto la app olvidaba: cada sub-tema vivía en UNA sesión y no había
// noción de "concepto" que sobreviviera. La tabla `conceptos` es esa memoria.

/**
 * Días hasta el próximo repaso según la caja Leitner (índice 0 = caja 1).
 * Un fallo devuelve el concepto a la caja 1; un acierto la sube hasta la última.
 */
export const DIAS_POR_CAJA = [1, 3, 7] as const;

/** Cuántos conceptos vencidos se ofrecen de una sola vez para repasar. */
export const LIMITE_CONCEPTOS_REPASO = 8;


/** Preguntas que se piden de una sola vez por sub-tema (default del preset). */
export const PREGUNTAS_POR_LOTE = BASE.preguntasPorLote;

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
export const NUM_PREDICT_SUBTEMAS = BASE.numPredictSubtemas;
export const NUM_PREDICT_LOTE = BASE.numPredictLote;
export const NUM_PREDICT_FEEDBACK = 300;

/**
 * Tokens para el veredicto del juez. Es un sí/no con motivo corto: si se le da más
 * presupuesto, el modelo se pone a justificar la pregunta en lugar de decidir.
 */
export const NUM_PREDICT_JUEZ = 120;

/** Tamaño del excerpt por subtema (default del preset): más contexto = menos genérico. */
export const EXCERPT_MAX_CHARS = BASE.excerptMaxChars;

/** Cuántos caracteres del head se usan para extraer sub-temas (corte por párrafo). */
export const SUBTEMAS_HEAD_CHARS = 3500;

/** Si quedan esta cantidad (o menos) de pendientes, se pre-genera en paralelo.
 *  Con lotes de 3 y 2 aciertos seguidos para dominar, un sub-tema se cubre en la 2ª
 *  respuesta y sobra 1 pregunta: la transición al sub-tema siguiente cae enseguida, así
 *  que el lote del próximo tiene que estar generándose desde la 1ª pregunta (antes el
 *  umbral era 1 y nunca disparaba con lotes completos → cada transición esperaba al modelo). */
export const PREGEN_UMBRAL_PENDIENTES = 2;

// --- Fase C (plan → enseñar/practicar) ---------------------------------------

/**
 * Respuestas mínimas sin errores para que un sub-tema pase directo a "practicar" en vez
 * de "asegurar". Con lotes de 3 y 2 aciertos seguidos para dominar, un sub-tema domi-
 * nado sin errores queda con ~4 intentos: por debajo de eso el sondeo lo cubrió muy
 * rápido y conviene repasar antes de ejercitar.
 */
export const INTENTOS_MINIMOS_PARA_PRACTICA = 4;

// --- Fase D (material: enseñar/practicar) ------------------------------------

/** Explicaciones que se generan por sub-tema (la ruta `asegurar` pide solo 1). */
export const EXPLICACIONES_POR_BLOQUE = 3;

/**
 * Tope de ejercicios por sub-tema: 1 quiz conceptual + 1 par de código (js y jsx con el
 * mismo problema). Temas no programables devuelven 2 quiz.
 */
export const EJERCICIOS_POR_BLOQUE = 3;

/** Tope de tokens: explicaciones (3 bloques cortos) y ejercicios (enunciado+tests+sol). */
export const NUM_PREDICT_EXPLICACIONES = 900;
export const NUM_PREDICT_EJERCICIOS = 1600;

// --- Fase C1 (modalidades) ---------------------------------------------------

/**
 * Tope de tokens del apunte sintético de la modalidad "tema libre": ~800-1100 palabras
 * más el título. Si el tope queda corto el JSON viene truncado y se pierde el apunte.
 */
export const NUM_PREDICT_APUNTE = 3000;
