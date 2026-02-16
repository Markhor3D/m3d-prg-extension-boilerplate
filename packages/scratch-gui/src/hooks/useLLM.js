export const useLLM = () => {
  const generate = async (prompt, engine = 'GEMINI', systemInstruction = null) => {
    try {
      const res = await fetch('http://your-server.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': '218a75af-c7a9-454b-9a01-252e29ba330a',
        },
        body: JSON.stringify({
          prompt,
          engine,
          systemInstruction,
        }),
      });

      if (!res.ok) throw new Error('API Error');
      
      const data = await res.json();
      return data.text;
    } catch (err) {
      throw err;
    }
  };

  return { generate, loading: false, error: null };
};
