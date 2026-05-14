export type ServiceId = 'openai' | 'gemini' | 'cursor' | 'figma' | 'chatgpt';

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
  accounts?: AccountUsage[];
  figma?: FigmaUsage;
}

export interface FigmaUsage {
  accountLabel: string;
  projectCount: number;
  fileCount: number;
  projectsCreatedToday?: number;
  projectDeltaFromPreviousSnapshot?: number;
  previousSnapshotDate?: string;
  snapshotDate: string;
}

export interface AccountUsage {
  label: string;
  cost: {
    today: number;
    thisMonth: number;
  };
  tokens: {
    input: number;
    output: number;
    total: number;
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
  dailyHistory?: DailyUsage[];
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
  figma: ServiceUsage;
  chatgpt: ServiceUsage;
  fetchedAt: string;
}
