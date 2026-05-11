export type ServiceId = 'openai' | 'gemini' | 'cursor' | 'claude' | 'figma';

export type ErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_KEY'
  | 'SESSION_EXPIRED'
  | 'SCHEMA_CHANGED'
  | 'RATE_LIMIT'
  | 'NO_USAGE_API'
  | 'PLAN_REQUIRED'
  | 'UNKNOWN';

export interface ServiceUsage {
  service: ServiceId;
  connected: boolean;
  error?: ErrorCode;
  errorMessage?: string;
  cost: {
    today: number;
    thisMonth: number;
  };
  tokens: {
    input: number;
    output: number;
    total: number;
    limit?: number;
  };
  requests: number;
  models: ModelUsage[];
  dailyHistory: DailyUsage[];
}

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  requests: number;
}

export interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  cost: number;
}

export interface AllUsageResponse {
  openai: ServiceUsage;
  gemini: ServiceUsage;
  cursor: ServiceUsage;
  claude: ServiceUsage;
  figma: ServiceUsage;
  fetchedAt: string;
}
