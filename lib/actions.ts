"use server";
import { crearSesion, actualizarFaseSesion, actualizarFaseChatSesion, guardarIntento, guardarScore, obtenerProgresoSesion, obtenerTodasLasSesiones } from './db/queries';

export async function actualizarFaseChatSesionAction(sessionId: number, fase: string) {
  return await actualizarFaseChatSesion(sessionId, fase);
}

export async function actualizarFaseSesionAction(sessionId: number, fase: string) {
  return await actualizarFaseSesion(sessionId, fase);
}

export async function crearSesionAction(topic: string) {
  return await crearSesion(topic);
}

export async function guardarIntentoAction(params: {
  sessionId: number;
  pregunta: string;
  respuestaUsuario: string;
  correcta: boolean;
  explicacion: string;
}) {
  const { sessionId, pregunta, respuestaUsuario, correcta, explicacion } = params;
  return await guardarIntento(sessionId, pregunta, respuestaUsuario, correcta, explicacion);
}

export async function guardarScoreAction(params: {
  sessionId: number;
  categoria: string;
  puntaje: number;
}) {
  const { sessionId, categoria, puntaje } = params;
  return await guardarScore(sessionId, categoria, puntaje);
}

export async function obtenerProgresoAction(sessionId: number) {
  return await obtenerProgresoSesion(sessionId);
}

export async function obtenerTodasLasSesionesAction() {
  return await obtenerTodasLasSesiones();
}
