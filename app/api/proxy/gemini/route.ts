import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  appendGeminiUsage,
  buildGeminiUsageRecord,
  getGeminiApiKeys,
} from '@/lib/services/geminiUsageStore';

export const runtime = 'nodejs';

const ProxyRequestSchema = z
  .object({
    project: z.string().min(1).default('default'),
    model: z.string().min(1).default('gemini-2.0-flash'),
    contents: z.unknown(),
  })
  .passthrough();

const UsageMetadataSchema = z
  .object({
    promptTokenCount: z.number().optional(),
    candidatesTokenCount: z.number().optional(),
    totalTokenCount: z.number().optional(),
    prompt_token_count: z.number().optional(),
    candidates_token_count: z.number().optional(),
    total_token_count: z.number().optional(),
  })
  .passthrough();

const GeminiResponseSchema = z
  .object({
    usageMetadata: UsageMetadataSchema.optional(),
    usage_metadata: UsageMetadataSchema.optional(),
  })
  .passthrough();

export async function POST(request: Request) {
  const body = ProxyRequestSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: body.error.message },
      { status: 400 }
    );
  }

  const keys = getGeminiApiKeys();
  const apiKey = keys.get(body.data.project);
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'NOT_CONFIGURED',
        message: `Gemini API key is not configured for project "${body.data.project}".`,
      },
      { status: 400 }
    );
  }

  const { project, model, ...geminiBody } = body.data;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
      cache: 'no-store',
    }
  );

  const rawResponse: unknown = await response.json();
  if (!response.ok) {
    return NextResponse.json(rawResponse, { status: response.status });
  }

  const parsed = GeminiResponseSchema.safeParse(rawResponse);
  if (parsed.success) {
    const usage = parsed.data.usageMetadata ?? parsed.data.usage_metadata;
    if (usage) {
      const promptTokens = usage.promptTokenCount ?? usage.prompt_token_count ?? 0;
      const candidatesTokens = usage.candidatesTokenCount ?? usage.candidates_token_count ?? 0;
      const totalTokens = usage.totalTokenCount ?? usage.total_token_count ?? promptTokens + candidatesTokens;
      await appendGeminiUsage(
        buildGeminiUsageRecord({
          project,
          model,
          promptTokens,
          candidatesTokens,
          totalTokens,
        })
      );
    }
  }

  return NextResponse.json(rawResponse);
}
