// lib/ollama.ts

/**
 * Fetches a response from the local Ollama API.
 * @param model The Ollama model to use.
 * @param prompt The prompt text.
 * @returns The assistant's reply as a string.
 */
export const fetchOllama = async (model: string, prompt: string): Promise<string> => {
  const res = await fetch(`http://localhost:11434/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error: ${res.status} ${text}`);
  }
  const data = await res.json();
  // Ollama returns a stream of choices; for simplicity assume single choice.
  const reply = data?.message?.content ?? '';
  return reply;
};


