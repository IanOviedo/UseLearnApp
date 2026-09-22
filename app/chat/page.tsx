"use client";

import { useState, useEffect } from "react";
import { useChatSesiones, useMensajes, useCrearSesionLearningChat, useGenerarPregunta, useCorregirRespuesta, useModelos } from "../../lib/hooks/useHooks";

export default function ChatPage() {
  const { data: sesiones = [], isLoading: loadingSesiones } = useChatSesiones();
  const { data: modelos = [], isLoading: loadingModelos } = useModelos();
  const [activeSession, setActiveSession] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newModel, setNewModel] = useState("");

  const { data: mensajes = [], isLoading: loadingMensajes } = useMensajes(activeSession?.id);
  const { mutateAsync: crearChatSession } = useCrearSesionLearningChat();
  const { mutateAsync: generarPregunta, isPending: generandoPregunta } = useGenerarPregunta();
  const { mutateAsync: corregirRespuesta, isPending: corregiendoRespuesta } = useCorregirRespuesta();

  const [inputText, setInputText] = useState("");

  const lastPreguntaMessage = mensajes.filter((m: any) => m.tipo === 'pregunta').pop();
  const preguntaObj = lastPreguntaMessage ? JSON.parse(lastPreguntaMessage.contenido) : null;
  const [selectedOption, setSelectedOption] = useState<string>("");
const lastCorrMessage = mensajes.find((m: any) => m.tipo === 'correccion' && lastPreguntaMessage && m.id > lastPreguntaMessage.id);
  const [libreRespuesta, setLibreRespuesta] = useState<string>("");

  useEffect(() => {
    setSelectedOption("");
    setLibreRespuesta("");
  }, [lastPreguntaMessage?.id]);

  const handleCreateSession = async () => {
    if (!newTitle.trim() || !newModel) return;
    const res = await crearChatSession({ titulo: newTitle, modeloChat: newModel, modeloRevisor: newModel });
    setActiveSession({ id: res.sessionId, titulo: newTitle, modelo_chat: newModel, modelo_revisor: newModel });
    setShowForm(false);
    setNewTitle("");
    setNewModel("");
  };

  const handleGenerarQuiz = async () => {
    if (!inputText.trim() || !activeSession || generandoPregunta) return;
    await generarPregunta({ sessionId: activeSession.id, contenido: inputText, modelo: activeSession.modelo_chat });
    setInputText("");
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left panel */}
      <div className="w-64 bg-white shadow-md p-4 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Chats</h2>
          <button onClick={() => setShowForm(true)} className="text-sm text-indigo-600 hover:underline">+ Nueva</button>
        </div>
        {loadingSesiones ? (
          <p>Loading...</p>
        ) : (
          <ul className="flex-1 overflow-y-auto">
            {sesiones.map((s: any) => (
              <li
                key={s.id}
                onClick={() => setActiveSession(s)}
                className={`p-2 rounded cursor-pointer hover:bg-indigo-50 ${activeSession?.id === s.id ? "bg-indigo-200" : ""}`}
              >
                <div className="font-medium">{s.titulo}</div>
                <div className="text-sm text-gray-500">
                  {new Date(s.fecha_creacion).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden text-gray-900">
        {activeSession ? (
          <div className="flex flex-col h-full">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">{activeSession.titulo}</h2>
              <div className="text-sm text-gray-600">
                Chat: {activeSession.modelo_chat} | Revisión: {activeSession.modelo_revisor}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto mb-4">
              {loadingMensajes ? (
                <p>Loading...</p>
              ) : (
                mensajes
                  .filter((m: any) => m.tipo !== 'pregunta')
                  .map((m: any, idx: number) => {
                    const isAssistant = m.rol === "assistant";
                    let content = m.contenido;
                    let bg = isAssistant ? "bg-gray-200" : "bg-indigo-500 text-white";
                    let border = "";
                    if (m.tipo === 'correccion') {
                      try {
                        const corr = JSON.parse(m.contenido);
                        content = corr.explicacion;
                        bg = corr.correcta ? 'bg-green-200' : 'bg-red-200';
                        border = corr.correcta ? 'border-green-700' : 'border-red-700';
                      } catch {
                        // leave defaults
                      }
                    }
                    return (
                      <div key={idx} className={`mb-2 flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-md rounded p-3 ${bg} ${border}`}>{content}</div>
                      </div>
                    );
                  })
              )}
            </div>

            {lastPreguntaMessage && !lastCorrMessage && (
              <div className="mt-4">
                <div className="mb-2">
                  <div className="font-semibold mb-1">{preguntaObj?.pregunta}</div>
                  {preguntaObj?.formato === 'multiple_choice' ? (
                    <div className="flex flex-col gap-2">
                      {preguntaObj?.opciones.map((opt: string, i: number) => (
                        <button
                          key={i}
                          onClick={() => setSelectedOption(opt)}
                          className={`px-4 py-2 rounded ${selectedOption === opt ? "bg-indigo-600 text-white" : "bg-gray-200"}`}
                        >{opt}</button>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      value={libreRespuesta}
                      onChange={e => setLibreRespuesta(e.target.value)}
                      className="w-full border rounded p-2"
                      rows={4}
                      placeholder="Escribe tu respuesta..."
                    />
                  )}
                </div>
                <button
                  onClick={async () => {
                    const respuestaUsuario = preguntaObj?.formato === 'multiple_choice' ? selectedOption : libreRespuesta;
                    if (!respuestaUsuario) return;
                    await corregirRespuesta({
                      sessionId: activeSession.id,
                      preguntaJson: preguntaObj,
                      respuestaUsuario,
                      modelo: activeSession.modelo_revisor,
                    });
                    setSelectedOption("");
                    setLibreRespuesta("");
                  }}
                  disabled={!((preguntaObj?.formato === 'multiple_choice' && selectedOption) || (preguntaObj?.formato === 'libre' && libreRespuesta)) || corregiendoRespuesta}
                  className={`px-4 py-2 rounded ${corregiendoRespuesta ? "bg-gray-500" : "bg-green-600"} text-white`}
                >{corregiendoRespuesta ? 'Corrigiendo...' : 'Responder'}</button>
              </div>
            )}

            {(!lastPreguntaMessage || lastCorrMessage) && (
              <div className="flex items-center gap-2">
                <textarea
                  className="flex-1 border rounded p-2"
                  rows={2}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Pegá el texto o tus notas para generar el quiz..."
                />
                <button
                  onClick={handleGenerarQuiz}
                  className="bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50"
                  disabled={!inputText.trim() || generandoPregunta}
                >{generandoPregunta ? "Generando..." : "Generar quiz"}</button>
              </div>
            )}

          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Selecciona o crea una sesión de chat.</p>
          </div>
        )}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded p-6 w-96 text-gray-900">
            <h3 className="text-lg font-semibold mb-4">Nueva sesión</h3>
            <div className="mb-4">
              <label className="block text-sm mb-1">Título</label>
              <input type="text" className="w-full border rounded p-2" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            </div>
            <div className="mb-4">
              <label className="block text-sm mb-1">Modelo</label>
              <select className="w-full border rounded p-2" value={newModel} onChange={(e) => setNewModel(e.target.value)}>
                <option value="">-- Seleccionar --</option>
                {modelos.map((m: string) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded border">Cancelar</button>
              <button onClick={handleCreateSession} className="px-4 py-2 rounded bg-indigo-600 text-white" disabled={!newTitle.trim() || !newModel}>Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
