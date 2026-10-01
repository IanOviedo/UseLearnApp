"use client";

import { useState } from "react";
import { IconoAlerta, IconoCheck } from "@/components/ui/Iconos";

// "Este ejercicio está mal" — el mismo propósito que el botón de las preguntas del sondeo, pero con
// otros motivos: acá los defectos no son "la respuesta está mal marcada" sino "no entendí qué me
// piden", "la solución no funciona" o "ya lo hice antes".
//
// Se monta DENTRO de cada card de ejercicio (ver components/aprender/EjercicioCodigo.tsx y
// EjercicioQuiz.tsx) para que quede pegado al ejercicio que se está reportando. El estado es local
// al componente: por eso cada card tiene su propio menú y reportar uno no afecta a los demás.

const MOTIVOS: { valor: string; texto: string }[] = [
  { valor: "no_se_entiende", texto: "No se entiende" },
  { valor: "no_dice_que_hay_que_hacer", texto: "No dice qué hay que hacer" },
  { valor: "la_solucion_no_funciona", texto: "La solución no funciona" },
  { valor: "las_assertions_estan_mal", texto: "Las pruebas están mal" },
  { valor: "nada_que_ver_con_el_tema", texto: "Nada que ver con el tema" },
  { valor: "repetido", texto: "Es repetido" },
  { valor: "muy_dificil", texto: "Es muy difícil" },
  { valor: "otra", texto: "Otra cosa" },
];

export default function BotonReportarEjercicio({ ejercicioId }: { ejercicioId: number }) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function reportar(motivo: string) {
    setEnviando(true);
    setAbierto(false);
    try {
      const res = await fetch("/api/aprender/ejercicio-mala", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ejercicioId, motivo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        setMensaje(data.error ?? "No se pudo marcar el ejercicio");
        return;
      }
      setMensaje(data.yaReportado ? "Ya lo habías marcado." : "Gracias, lo vamos a revisar.");
      window.setTimeout(() => setMensaje(null), 3000);
    } catch {
      setMensaje("No se pudo marcar el ejercicio");
      window.setTimeout(() => setMensaje(null), 3000);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-4 border-t border-neutral-800/50 pt-3">
      {mensaje ? (
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-300/80">
          <IconoCheck className="h-3 w-3" />
          {mensaje}
        </p>
      ) : abierto ? (
        <div>
          <p className="mb-1.5 text-center text-[11px] text-neutral-500">
            ¿Qué está mal con este ejercicio?
          </p>
          <div className="flex flex-wrap justify-center gap-1">
            {MOTIVOS.map((m) => (
              <button
                key={m.valor}
                onClick={() => void reportar(m.valor)}
                disabled={enviando}
                className="rounded-full border border-neutral-800 px-2.5 py-1 text-[11px] text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200 disabled:opacity-50"
              >
                {m.texto}
              </button>
            ))}
            <button
              onClick={() => setAbierto(false)}
              className="rounded-full px-2.5 py-1 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAbierto(true)}
          className="mx-auto flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <IconoAlerta className="h-3 w-3" />
          Este ejercicio está mal
        </button>
      )}
    </div>
  );
}