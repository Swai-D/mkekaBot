/**
 * MkekaBOT — Provider-agnostic AI loader
 * lib/ai.js
 *
 * Returns the active predictor based on the environment:
 * - USE_MOCK_AI=true  → deterministic local predictor (zero cost)
 * - USE_MOCK_AI=false → configured OpenAI-compatible LLM (default: Groq)
 */

export async function loadPredictor() {
  if (process.env.USE_MOCK_AI === 'true') {
    const { default: mockPredictor } = await import('./mockAi.js');
    console.log('[AI] Using MOCK predictor (USE_MOCK_AI=true)');
    return mockPredictor;
  }

  const { default: llmPredictor } = await import('./llm.js');
  console.log('[AI] Using LLM predictor');
  return llmPredictor;
}
