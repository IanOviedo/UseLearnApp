"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { AssertionEjercicio } from "@/lib/tipos";

// Fase D2a — sandbox de ejecución de ejercicios de código.
//
// El código del usuario NUNCA corre en el árbol de React ni en el server: vive en un
// iframe con sandbox="allow-scripts" y SIN allow-same-origin, así que tiene origen
// opaco y no puede tocar localStorage, cookies ni el DOM de la app. La comunicación es
// por postMessage con un token aleatorio por montaje (el iframe no puede leer nada del
// padre, así que el token viaja embebido en su srcdoc).

export interface ResultadoAssertion {
  descripcion: string;
  ok: boolean;
  error?: string;
}

export interface ResultadoRunner {
  ok: boolean;
  resultados: ResultadoAssertion[];
  logs: string[];
  /** Error de sintaxis (compilación) del código o de los tests. */
  errorCompilacion: string | null;
  /** Error de ejecución (el código lanzó una excepción antes de correr los tests). */
  errorEjecucion: string | null;
}

export interface SandboxHandle {
  /** Ejecuta código + tests y devuelve el resultado (rechaza solo si el sandbox no existe). */
  correr: (codigo: string, tests: AssertionEjercicio[]) => Promise<ResultadoRunner>;
}

/** Si el código no vuelve en este tiempo, se asume bucle infinito y se reinicia. */
const TIMEOUT_MS = 3000;

const RESULTADO_TIMEOUT: ResultadoRunner = {
  ok: false,
  resultados: [],
  logs: [],
  errorCompilacion: null,
  errorEjecucion: "El código tardó demasiado en terminar (¿bucle infinito?) y se cortó la ejecución.",
};

/**
 * HTML del harness: fijo salvo por el token. Los tests se arman como try/catch
 * individuales para que un fallo no corte los demás, y `h()` es el helper de los
 * ejercicios en variante jsx (JSX compila exactamente a una llamada así).
 */
function construirHarness(token: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>sandbox</title></head><body>
<script>
(function () {
  var TOKEN = ${JSON.stringify(token)};
  var logs = [];

  function joinArgs(args) {
    return Array.prototype.map.call(args, function (a) {
      if (typeof a === "object" && a !== null) {
        try { return JSON.stringify(a); } catch (e) { return String(a); }
      }
      return String(a);
    }).join(" ");
  }

  var consola = {
    log: function () { logs.push(joinArgs(arguments)); },
    info: function () { logs.push(joinArgs(arguments)); },
    warn: function () { logs.push(joinArgs(arguments)); },
    error: function () { logs.push(joinArgs(arguments)); },
    debug: function () { logs.push(joinArgs(arguments)); }
  };

  function h(tag, props) {
    var children = Array.prototype.slice.call(arguments, 2);
    if (children.length === 1 && Array.isArray(children[0])) children = children[0];
    return { tag: tag, props: props || null, children: children };
  }

  function responder(mensaje) {
    parent.postMessage(Object.assign({ tipo: "resultado", token: TOKEN }, mensaje), "*");
  }

  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || d.tipo !== "ejecutar" || d.token !== TOKEN) return;

    logs = [];
    var tests = Array.isArray(d.tests) ? d.tests : [];
    var cuerpo =
      String(d.codigo || "") +
      "\\nvar __resultados = [];\\n" +
      tests.map(function (t, i) {
        var desc = JSON.stringify(t.descripcion || "Condición " + (i + 1));
        return (
          "try { __resultados.push({ descripcion: " + desc + ", ok: Boolean(" + t.test + ") }); }" +
          " catch (e) { __resultados.push({ descripcion: " + desc + ", ok: false, error: String((e && e.message) || e) }); }"
        );
      }).join("\\n") +
      "\\nreturn __resultados;";

    var fn = null;
    var errorCompilacion = null;
    try {
      fn = new Function("console", "h", cuerpo);
    } catch (e) {
      errorCompilacion = String((e && e.message) || e);
    }

    var resultados = [];
    var errorEjecucion = null;
    if (fn) {
      try {
        resultados = fn(consola, h) || [];
      } catch (e) {
        errorEjecucion = String((e && e.message) || e);
      }
    }

    responder({
      ok: !errorCompilacion && !errorEjecucion && resultados.length > 0 &&
        resultados.every(function (r) { return r.ok; }),
      resultados: resultados,
      logs: logs.slice(),
      errorCompilacion: errorCompilacion,
      errorEjecucion: errorEjecucion
    });
  });

  parent.postMessage({ tipo: "sandbox-listo", token: TOKEN }, "*");
})();
<\/script></body></html>`;
}

/**
 * Renderiza el iframe y expone `correr()` vía ref. Maneja los tres casos jodidos:
 * llegada antes de que el iframe esté listo (se encola), respuesta que nunca llega
 * (timeout + recarga para cortar el bucle) y desmontaje con una ejecución pen­diente.
 */
const RunnerSandbox = forwardRef<SandboxHandle, object>((_props, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const token = useMemo(() => `ul${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`, []);
  const srcdoc = useMemo(() => construirHarness(token), [token]);
  const listoRef = useRef(false);
  const pendienteRef = useRef<{ resolver: (resultado: ResultadoRunner) => void; timer: number } | null>(null);
  const colaRef = useRef<{ codigo: string; tests: AssertionEjercicio[] } | null>(null);

  const resolverPendiente = useCallback((resultado: ResultadoRunner) => {
    const pendiente = pendienteRef.current;
    pendienteRef.current = null;
    if (!pendiente) return;
    window.clearTimeout(pendiente.timer);
    pendiente.resolver(resultado);
  }, []);

  const enviar = useCallback(
    (codigo: string, tests: AssertionEjercicio[]) => {
      iframeRef.current?.contentWindow?.postMessage({ tipo: "ejecutar", token, codigo, tests }, "*");
    },
    [token]
  );

  /** Reinicia el iframe: es la única forma de cortar un bucle infinito en marcha. */
  const recargar = useCallback(() => {
    listoRef.current = false;
    colaRef.current = null;
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.srcdoc = "";
      iframe.srcdoc = srcdoc;
    }
  }, [srcdoc]);

  useEffect(() => {
    function alRecibir(ev: MessageEvent) {
      const data = ev.data;
      if (!data || typeof data !== "object" || data.token !== token) return;

      if (data.tipo === "sandbox-listo") {
        listoRef.current = true;
        const cola = colaRef.current;
        colaRef.current = null;
        if (cola) enviar(cola.codigo, cola.tests);
        return;
      }

      if (data.tipo !== "resultado") return;
      resolverPendiente({
        ok: data.ok === true,
        resultados: Array.isArray(data.resultados) ? data.resultados : [],
        logs: Array.isArray(data.logs) ? data.logs.map(String) : [],
        errorCompilacion: typeof data.errorCompilacion === "string" ? data.errorCompilacion : null,
        errorEjecucion: typeof data.errorEjecucion === "string" ? data.errorEjecucion : null,
      });
    }

    window.addEventListener("message", alRecibir);
    return () => {
      window.removeEventListener("message", alRecibir);
      // Al desmontar no puede quedar una promesa colgada esperando respuesta.
      resolverPendiente({
        ok: false,
        resultados: [],
        logs: [],
        errorCompilacion: null,
        errorEjecucion: "El sandbox se cerró antes de terminar.",
      });
    };
  }, [token, enviar, resolverPendiente]);

  useImperativeHandle(
    ref,
    () => ({
      correr(codigo: string, tests: AssertionEjercicio[]) {
        return new Promise<ResultadoRunner>((resolver) => {
          if (!iframeRef.current) {
            resolver({
              ok: false,
              resultados: [],
              logs: [],
              errorCompilacion: null,
              errorEjecucion: "El sandbox no está disponible.",
            });
            return;
          }

          // Un run anterior todavía colgado: se resuelve antes de empezar el nuevo.
          if (pendienteRef.current) resolverPendiente(RESULTADO_TIMEOUT);

          const timer = window.setTimeout(() => {
            resolverPendiente(RESULTADO_TIMEOUT);
            recargar();
          }, TIMEOUT_MS);

          pendienteRef.current = { resolver, timer };
          if (listoRef.current) enviar(codigo, tests);
          else colaRef.current = { codigo, tests };
        });
      },
    }),
    [enviar, recargar, resolverPendiente]
  );

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts"
      title="Sandbox de ejecución"
      referrerPolicy="no-referrer"
      // Fuera de pantalla pero renderizado: un display:none puede postergar la carga
      // del documento en algunos navegadores.
      className="pointer-events-none absolute -left-[9999px] top-0 h-4 w-4 border-0 opacity-0"
    />
  );
});

RunnerSandbox.displayName = "RunnerSandbox";

export default RunnerSandbox;
