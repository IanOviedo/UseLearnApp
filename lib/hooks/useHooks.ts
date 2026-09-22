import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useChatSesiones() {
  return useQuery({
    queryKey: ["sesiones"],
    queryFn: async () => {
      const res = await fetch("/api/chat/sesiones");
      if (!res.ok) throw new Error("Failed to fetch sesiones");
      return res.json();
    },
  });
}

export function useMensajes(sessionId: number | undefined) {
  return useQuery({
    queryKey: ["mensajes", sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/chat/mensajes?sessionId=${sessionId}`);
      if (!res.ok) throw new Error("Failed to fetch mensajes");
      return res.json();
    },
    enabled: sessionId !== undefined,
  });
}

export function useModelos() {
  return useQuery({
    queryKey: ["modelos"],
    queryFn: async () => {
      const res = await fetch("/api/modelos");
      if (!res.ok) throw new Error("Failed to fetch modelos");
      const data = await res.json();
      return data.modelos ?? [];
    },
  });
}

export function useCrearSesionLearningChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ titulo, modeloChat, modeloRevisor }: { titulo: string; modeloChat: string; modeloRevisor: string }) => {
      const res = await fetch("/api/chat/sesiones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, modeloChat, modeloRevisor }),
      });
      if (!res.ok) throw new Error("Failed to create sesion");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sesiones"] });
    },
  });
}

export function useEnviarMensaje() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, mensaje, modelo }: { sessionId: number; mensaje: string; modelo: string }) => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, mensaje, modelo }),
      });
      if (!res.ok) throw new Error("Failed to send mensaje");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["mensajes", variables.sessionId] });
    },
  });
}

export function useGenerarPregunta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, contenido, modelo }: { sessionId: number; contenido: string; modelo: string }) => {
      const res = await fetch("/api/chat/generar-pregunta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, contenido, modelo }),
      });
      if (!res.ok) throw new Error("Failed to generate pregunta");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["mensajes", variables.sessionId] });
    },
  });
}

export function useCorregirRespuesta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, preguntaJson, respuestaUsuario, modelo }: { sessionId: number; preguntaJson: any; respuestaUsuario: string; modelo: string }) => {
      const res = await fetch('/api/chat/corregir-respuesta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, preguntaJson, respuestaUsuario, modelo }),
      });
      if (!res.ok) throw new Error('Failed to correct response');
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mensajes', variables.sessionId] });
    },
  });
}
