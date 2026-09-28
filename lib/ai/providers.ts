import { ProviderDef } from './types';

// Every provider we support. Anything marked `kind: 'openai'` uses the
// OpenAI Chat Completions schema so the same adapter handles it; changing
// the base URL + key is all that is needed.
export const PROVIDERS: ProviderDef[] = [
  {
    id: 'openai',
    name: 'ChatGPT (OpenAI)',
    kind: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    requiresKey: true,
    authHeader: 'bearer',
    description: 'OpenAI official API. Key starts with sk-',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    kind: 'gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    requiresKey: true,
    authHeader: 'query',
    description: 'Google AI Studio key. Free tier available.',
  },
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    kind: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-latest',
    models: [
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
      'claude-3-opus-latest',
    ],
    requiresKey: true,
    authHeader: 'x-api-key',
    description: 'Anthropic official API. Key starts with sk-ant-',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'openai',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    requiresKey: true,
    authHeader: 'bearer',
    description: 'DeepSeek official API.',
  },
  {
    id: 'grok',
    name: 'Grok (xAI)',
    kind: 'openai',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-2-latest',
    models: ['grok-2-latest', 'grok-2-1212', 'grok-beta'],
    requiresKey: true,
    authHeader: 'bearer',
    description: 'xAI Grok API.',
  },
  {
    id: 'qwen',
    name: 'Qwen (Alibaba)',
    kind: 'openai',
    defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen2.5-72b-instruct'],
    requiresKey: true,
    authHeader: 'bearer',
    description: 'Alibaba DashScope OpenAI-compatible endpoint.',
  },
  {
    id: 'zai',
    name: 'Z.AI',
    kind: 'openai',
    defaultBaseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModel: 'glm-4-plus',
    models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'],
    requiresKey: true,
    authHeader: 'bearer',
    description: 'Z.AI (Zhipu) OpenAI-compatible endpoint.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'openai',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    requiresKey: true,
    authHeader: 'bearer',
    description: 'One key, many models (routes to OpenAI / Anthropic / Google).',
  },
  {
    id: 'custom-openai',
    name: 'Custom (OpenAI-compatible)',
    kind: 'openai',
    defaultBaseUrl: '',
    defaultModel: '',
    models: [],
    requiresKey: true,
    authHeader: 'bearer',
    description: 'Any endpoint that speaks the OpenAI Chat Completions API.',
  },
];

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providerDisplayName(id: string): string {
  return getProvider(id)?.name || id;
}
