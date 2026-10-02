import { ProviderDef } from './types';

// Model names are NOT hard-coded. Each provider only shows a placeholder
// hint (defaultModelHint) so the user can type whatever model exists today
// or tomorrow (gpt-6, gemini-3, etc.).
export const PROVIDERS: ProviderDef[] = [
  {
    id: 'custom-openai',
    name: 'Custom (OpenAI-compatible)',
    kind: 'openai',
    defaultBaseUrl: '',
    defaultModelHint: '',
    requiresKey: false,
    description: 'Any OpenAI-compatible endpoint (local or remote)',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'openai',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModelHint: 'openai/gpt-4o-mini',
    requiresKey: true,
    description: 'One key, many models',
  },
  {
    id: 'openai',
    name: 'ChatGPT (OpenAI)',
    kind: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModelHint: 'gpt-4o-mini',
    requiresKey: true,
    description: 'Key starts with sk-',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    kind: 'gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModelHint: 'gemini-2.0-flash',
    requiresKey: true,
    description: 'Google AI Studio key',
  },
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    kind: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModelHint: 'claude-3-5-sonnet-latest',
    requiresKey: true,
    description: 'Key starts with sk-ant-',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'openai',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModelHint: 'deepseek-chat',
    requiresKey: true,
    description: 'DeepSeek official API',
  },
  {
    id: 'grok',
    name: 'Grok (xAI)',
    kind: 'openai',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModelHint: 'grok-2-latest',
    requiresKey: true,
    description: 'xAI Grok API',
  },
  {
    id: 'qwen',
    name: 'Qwen (Alibaba)',
    kind: 'openai',
    defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    defaultModelHint: 'qwen-plus',
    requiresKey: true,
    description: 'DashScope OpenAI-compatible',
  },
  {
    id: 'zai',
    name: 'Z.AI',
    kind: 'openai',
    defaultBaseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModelHint: 'glm-4-plus',
    requiresKey: true,
    description: 'Z.AI (Zhipu) OpenAI-compatible',
  },
];

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
