import 'server-only';

import { z } from 'zod';
import type { DailyUsage, ModelUsage, ServiceUsage } from '@/lib/types';
import { emptyUsage } from './shared';

const ActivityLogSchema = z.object({
  events: z
    .array(
      z
        .object({
          event_type: z.string().optional(),
          timestamp: z.string().optional(),
        })
        .passthrough()
    )
    .optional(),
});

const ProjectsSchema = z.object({
  projects: z.array(z.object({ id: z.string(), name: z.string().optional() })).default([]),
});

const FilesSchema = z.object({
  files: z.array(z.object({ key: z.string(), name: z.string().optional() })).default([]),
});

export async function fetchFigmaUsage(): Promise<ServiceUsage> {
  const accessToken = process.env.FIGMA_ACCESS_TOKEN;
  const teamId = process.env.FIGMA_TEAM_ID;
  if (!accessToken || !teamId) {
    return emptyUsage('figma', 'NOT_CONFIGURED', 'FIGMA_ACCESS_TOKEN과 FIGMA_TEAM_ID가 필요합니다.');
  }

  if (process.env.FIGMA_OAUTH_TOKEN) {
    const enterprise = await fetchActivityLogs(process.env.FIGMA_OAUTH_TOKEN);
    if (enterprise) return enterprise;
  }

  return fetchProjectFallback(accessToken, teamId);
}

async function fetchActivityLogs(oauthToken: string): Promise<ServiceUsage | null> {
  const response = await fetch('https://api.figma.com/v1/activity_logs?limit=100', {
    headers: { Authorization: `Bearer ${oauthToken}` },
    cache: 'no-store',
  });

  if (response.status === 401) {
    return emptyUsage('figma', 'INVALID_KEY', 'Figma OAuth token 권한을 확인하세요.');
  }
  if (response.status === 403) {
    return null;
  }
  if (!response.ok) {
    return null;
  }

  const parsed = ActivityLogSchema.safeParse(await response.json());
  if (!parsed.success) {
    return emptyUsage('figma', 'SCHEMA_CHANGED', 'Figma Activity Logs 응답 구조가 변경되었습니다.');
  }

  const modelMap = new Map<string, ModelUsage>();
  const dailyMap = new Map<string, DailyUsage>();

  for (const event of parsed.data.events ?? []) {
    const type = event.event_type ?? 'unknown';
    const date = (event.timestamp ?? new Date().toISOString()).slice(0, 10);
    const model = modelMap.get(type) ?? {
      model: type,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      requests: 0,
    };
    model.requests += 1;
    modelMap.set(type, model);

    const daily = dailyMap.get(date) ?? {
      date,
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
      cost: 0,
    };
    daily.requests += 1;
    dailyMap.set(date, daily);
  }

  const calls = [...modelMap.values()].reduce((sum, item) => sum + item.requests, 0);
  return {
    service: 'figma',
    connected: true,
    cost: { today: 0, thisMonth: 0 },
    tokens: { input: 0, output: 0, total: calls },
    requests: calls,
    models: [...modelMap.values()].sort((a, b) => b.requests - a.requests),
    dailyHistory: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

async function fetchProjectFallback(accessToken: string, teamId: string): Promise<ServiceUsage> {
  try {
    const response = await fetch(`https://api.figma.com/v1/teams/${teamId}/projects`, {
      headers: { 'X-Figma-Token': accessToken },
      cache: 'no-store',
    });

    if (response.status === 401 || response.status === 403) {
      return emptyUsage('figma', 'INVALID_KEY', 'Figma access token 또는 team ID를 확인하세요.');
    }
    if (!response.ok) {
      return emptyUsage('figma', 'UNKNOWN', `Figma API 오류: ${response.status}`);
    }

    const parsed = ProjectsSchema.safeParse(await response.json());
    if (!parsed.success) {
      return emptyUsage('figma', 'SCHEMA_CHANGED', 'Figma Projects API 응답 구조가 변경되었습니다.');
    }

    let fileCount = 0;
    for (const project of parsed.data.projects.slice(0, 20)) {
      const filesResponse = await fetch(`https://api.figma.com/v1/projects/${project.id}/files`, {
        headers: { 'X-Figma-Token': accessToken },
        cache: 'no-store',
      });
      if (!filesResponse.ok) continue;
      const filesParsed = FilesSchema.safeParse(await filesResponse.json());
      if (filesParsed.success) fileCount += filesParsed.data.files.length;
    }

    return {
      service: 'figma',
      connected: true,
      error: 'PLAN_REQUIRED',
      errorMessage: 'activity_logs는 Enterprise 플랜과 OAuth token이 필요합니다. 파일 수로 대체 표시 중입니다.',
      cost: { today: 0, thisMonth: 0 },
      tokens: { input: 0, output: 0, total: fileCount },
      requests: fileCount,
      models: [
        {
          model: 'project_files',
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          requests: fileCount,
        },
      ],
      dailyHistory: [],
    };
  } catch (error) {
    console.error('[Figma] Usage fetch failed:', error);
    return emptyUsage('figma', 'UNKNOWN', 'Figma 사용량 조회 중 알 수 없는 오류가 발생했습니다.');
  }
}
