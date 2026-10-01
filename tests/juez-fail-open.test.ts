// Tests del fail-open del filtro de calidad de preguntas (§6 ítem 0b, §10.5 de ESTADO.md).
//
// Por qué existen: el juez es una llamada a un modelo, y los modelos fallan. Si un juez caído se
// traduce en "el usuario se queda sin preguntas", un problema de Ollama se convierte en un producto
// roto. Los dos niveles de fail-open están escritos a mano en el código; esta es la única red que
// los ata. Antes no había asserts y por eso los dos humos pasaban igual con el juez roto: es un
// `opts.juez` inyectado y los humos no lo pasaban (§10.5).
//
// El mock es de `global.fetch` y no del módulo: `llamarModelo` se importa desde dos rutas distintas
// (relativa en `evaluador.ts`, alias en otros) y espiar exports ESM no es confiable. Interceptando
// la red se cubre la cadena real sin depender de cómo se importó, y el test mide el fail-open y no
// la disponibilidad de Ollama.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generarLotePreguntas } from "@/lib/ollama";
import { evaluarCalidadSemantica } from "@/lib/evaluador";
import type { Pregunta } from "@/lib/tipos";

const TEXTO =
  "Un closure es una función que recuerda el ámbito donde fue creada, incluso después de que ese " +
  "ámbito terminó de ejecutarse. Por eso puede seguir accediendo a sus variables.";

const MARCA_JUEZ = "control de calidad";

// Tres preguntas con contenido DISTINTO: la validación local rechaza las que se parecen entre sí
// (`rechazarPorRepeticion`), así que si el mock devolviera el mismo texto variando un número, el
// lote moriría antes de llegar al juez y el test mediría la validación local, no el fail-open.
const PREGUNTAS: Pregunta[] = [
  {
    pregunta: "¿Qué es un closure en JavaScript y qué conserva cuando se crea?",
    opciones: [
      "Una función que conserva el ámbito donde fue declarada",
      "Una clase privada con constructor reservado",
      "Un bucle que espera promesas en paralelo",
      "Una función que se ejecuta de forma diferida",
    ],
    indiceCorrecta: 0,
    explicacion: "El closure conserva las variables del ámbito donde se lo definió, incluso después de salir de él.",
  },
  {
    pregunta: "¿Por qué una función devuelta desde un bucle puede ver siempre la última variable?",
    opciones: [
      "Porque el bucle crea un ámbito nuevo por iteración",
      "Porque todas las funciones comparten un único ámbito global mutable",
      "Porque el motor copia el valor de la variable en cada llamada",
      "Porque las funciones flecha capturan el valor y no la referencia",
    ],
    indiceCorrecta: 1,
    explicacion: "Las funciones creadas en un bucle comparten la referencia a la misma variable del ámbito.",
  },
  {
    pregunta: "¿Qué problema resuelve usar una función para encapsular un contador privado?",
    opciones: [
      "Evita que el estado quede expuesto y se pueda modificar desde afuera",
      "Hace que el contador se ejecute en paralelo",
      "Convierte el contador en una constante inmutable",
      "Reduce el tamaño del código generado en memoria",
    ],
    indiceCorrecta: 0,
    explicacion: "Como el estado vive en el ámbito del closure, nadie de afuera puede tocarlo directamente.",
  },
];

function pregunta(indice: number): Pregunta {
  return PREGUNTAS[indice % PREGUNTAS.length];
}

const LOTE_JSON = JSON.stringify(PREGUNTAS);

/**
 * Cómo responde el modelo: "lote" para generar, y para el juez "aceptar" / "rechazar" / "lanzar" /
 * "basura" / o un string crudo (para testear la interpretación del veredicto).
 */
let modo = "lote";

function respuestaPara(prompt: string): unknown {
  if (!prompt.includes(MARCA_JUEZ)) return LOTE_JSON;
  if (modo === "lanzar") throw new Error("Ollama caído (simulado)");
  if (typeof modo === "string" && modo.startsWith("crudo:")) return modo.slice("crudo:".length);
  const valida = modo !== "rechazar";
  return JSON.stringify({ valida, motivo: valida ? null : "la explicación contradice la respuesta" });
}

beforeEach(() => {
  modo = "lote";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    const { prompt } = JSON.parse(init.body) as { prompt: string };
    return {
      ok: true,
      status: 200,
      json: async () => ({ response: respuestaPara(prompt), done_reason: "stop" }),
      text: async () => "",
    } as unknown as Response;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Genera el lote con el juez REAL inyectado: cubre la cadena completa, no un doble. */
async function generar(preset = "equilibrado"): Promise<Pregunta[]> {
  const { juzgarLote } = await import("@/lib/evaluador");
  return generarLotePreguntas("Closures", TEXTO, "gemma3:4b", undefined, [], {
    preset,
    // El paso de ángulos hace otra llamada al modelo que no es lo que se está testeando: se apaga
    // para que el único factor sea el juez.
    aspectos: false,
    intentosRegeneracion: 0,
    juez: (lote: Pregunta[], texto: string, modelo: string) => juzgarLote(lote, texto, modelo),
  });
}


describe("fail-open del juez", () => {
  it("el juez que ACEPTA deja pasar el lote", async () => {
    modo = "aceptar";
    expect((await generar()).length).toBeGreaterThan(0);
  });

  it("el juez que LANZA (Ollama caído) no rompe el flujo", async () => {
    modo = "lanzar";
    // Este es el assert que faltaba (§6 ítem 0b): con el juez caído el usuario igual recibe
    // preguntas, porque ya pasaron la validación local. La alternativa (tirar) lo dejaba sin lote.
    expect((await generar()).length).toBeGreaterThan(0);
  });

  it("el juez que devuelve basura (no JSON) no rompe el flujo", async () => {
    modo = "basura";
    expect((await generar()).length).toBeGreaterThan(0);
  });

  it("un juez que rechaza TODO termina en lote vacío (riesgo conocido de §10.5)", async () => {
    modo = "rechazar";
    // El fail-open es por PREGUNTA, no por lote: si el juez rechaza todas, el lote queda vacío.
    // Está documentado como riesgo y este assert lo deja fijado, no accidentalmente tolerado.
    await expect(generar()).rejects.toThrow();
  });

  it("el preset `rapido` ignora el juez aunque se le pase (gateo por preset)", async () => {
    // Este assert existe porque pasó: con preset `rapido` el juez inyectado se ignora en silencio
    // (`usarJuez = Boolean(opts.juez) && ajustes.juezSemantico`), y un test escrito sin saber eso
    // pasa sin estar probando nada. Es el mismo modo de falla que §10.1, un test que miente.
    modo = "rechazar";
    const resultado = await generar("rapido");
    expect(resultado.length).toBeGreaterThan(0); // el juez no corrió: no descartó ninguna
  });

  it("el preset `equilibrado` sí corre el juez", async () => {
    modo = "rechazar";
    await expect(generar("equilibrado")).rejects.toThrow();
  });
});

describe("interpretación del veredicto (§10.4)", () => {
  const veredicto = async (crudo: string) => {
    modo = `crudo:${crudo}`;
    return evaluarCalidadSemantica(pregunta(0), TEXTO, "gemma3:4b");
  };

  it('trata "false" (string) como inválida, no como válida', async () => {
    // El bug de §10.4: `!!parsed.valida` daba por válida una pregunta rechazada, porque el string
    // "false" es truthy. Este assert evita que vuelva.
    expect((await veredicto('{"valida":"false","motivo":"mala"}')).valida).toBe(false);
  });

  it('rechaza "true" (string): el veredicto tiene que ser un booleano real', async () => {
    // Decisión, no descuido: `parsed.valida === true` es estricto a propósito. Un string "true" no
    // es un veredicto, es un modelo respondiendo mal el formato, así que la pregunta se descarta.
    // El sesgo del parseo es "ante la duda, no confíes": es lo contrario de `!!parsed.valida`, que
    // era exactamente el bug de §10.4 (daba por válida una pregunta rechazada).
    expect((await veredicto('{"valida":"true","motivo":null}')).valida).toBe(false);
  });

  it("acierta con booleanos reales", async () => {
    expect((await veredicto('{"valida":true,"motivo":null}')).valida).toBe(true);
    expect((await veredicto('{"valida":false,"motivo":"x"}')).valida).toBe(false);
  });

  it("devuelve el motivo cuando rechaza", async () => {
    const v = await veredicto('{"valida":false,"motivo":"la respuesta está mal marcada"}');
    expect(v.valida).toBe(false);
    expect(v.motivo).toBe("la respuesta está mal marcada");
  });

  it("fail-open si la respuesta del juez no es JSON", async () => {
    // Servir una pregunta dudosa es mejor que dejar al usuario sin lote: es la decisión de §10.3.
    expect((await veredicto("no soy json")).valida).toBe(true);
  });

  it("no inventa veredicto si al juez le falta el campo `valida`", async () => {
    expect((await veredicto('{"motivo":"sin veredicto"}')).valida).toBe(false);
  });
});
