export interface ModelPrice {
  input: number;
  output: number;
}

export const OPENAI_PRICING: Record<string, ModelPrice> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  default: { input: 0.002, output: 0.002 },
};

export const GEMINI_PRICING: Record<string, ModelPrice> = {
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  default: { input: 0.001, output: 0.002 },
};

export const ANTHROPIC_PRICING: Record<string, ModelPrice> = {
  'claude-opus-4': { input: 0.015, output: 0.075 },
  'claude-sonnet-4': { input: 0.003, output: 0.015 },
  'claude-haiku-4': { input: 0.00025, output: 0.00125 },
  default: { input: 0.003, output: 0.015 },
};

// Figma는 LLM 토큰 단가 없음. API 호출 수 기반 지표로 표시한다.

export function getPrice(
  table: Record<string, ModelPrice>,
  model: string
): ModelPrice {
  const key = Object.keys(table).find(
    (candidate) => candidate !== 'default' && model.startsWith(candidate)
  );
  return key ? table[key] : table.default;
}

export function estimateCost(price: ModelPrice, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output;
}
