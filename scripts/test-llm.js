/**
 * Quick smoke test for the configured LLM provider.
 * Run with: node scripts/test-llm.js
 */

import 'dotenv/config';
import OpenAI from 'openai';

const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
const providerDefaults = {
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  },
};
const defaults = providerDefaults[provider] || providerDefaults.groq;
const providerApiKey =
  provider === 'openrouter'
    ? process.env.OPENROUTER_API_KEY
    : provider === 'groq'
      ? process.env.GROQ_API_KEY
      : provider === 'kimi'
        ? process.env.KIMI_API_KEY
        : null;
const apiKey = providerApiKey || process.env.LLM_API_KEY;
const baseURL = process.env.LLM_BASE_URL || defaults.baseURL;
const model = process.env.LLM_MODEL || defaults.model;

console.log('LLM connection test');
console.log('Provider:', provider);
console.log('Base URL:', baseURL);
console.log('Model:', model);
console.log('API key present:', apiKey ? 'yes' : 'NO');
console.log('API key prefix:', apiKey ? apiKey.slice(0, 12) + '...' : 'N/A');

if (!apiKey) {
  console.error('\n❌ LLM_API_KEY / OPENROUTER_API_KEY / GROQ_API_KEY / KIMI_API_KEY is missing.');
  console.error('Add one to .env.local');
  process.exit(1);
}

const llm = new OpenAI({ apiKey, baseURL });

async function main() {
  try {
    const response = await llm.chat.completions.create({
      model,
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: 'You are a concise assistant. Reply with one sentence.',
        },
        {
          role: 'user',
          content: 'Say hello in Swahili.',
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    console.log('\n✅ LLM API is working.');
    console.log('Response:', text);
  } catch (err) {
    console.error('\n❌ LLM API call failed.');
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('HTTP status:', err.status);
    console.error('\nTroubleshooting:');
    console.error('1. Verify your key and balance at the provider dashboard.');
    console.error('2. Check LLM_BASE_URL matches your provider.');
    console.error('3. Check your internet / VPN connection.');
    process.exit(1);
  }
}

main();
