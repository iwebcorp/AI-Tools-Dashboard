import 'server-only';

import { z } from 'zod';
import type { DailyUsage, FigmaFile, FigmaProject, FigmaUsage, ModelUsage, ServiceUsage } from '@/lib/types';
import { getRedis } from '@/lib/redis';
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
  projects: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).transform(String),
        name: z.string().optional(),
      })
    )
    .default([]),
});

const FilesSchema = z.object({
  files: z
    .array(
      z
        .object({
          key: z.string(),
          name: z.string().optional(),
          thumbnail_url: z.string().nullable().optional(),
          last_modified: z.string().optional(),
          branch_name: z.string().optional(),
        })
        .passthrough()
    )
    .default([]),
});

const ProjectMetaSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().optional(),
  thumbnail_url: z.string().nullable().optional(),
  file_count: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const SnapshotSchema = z
  .array(
    z.object({
      date: z.string(),
      projectCount: z.number(),
      projectIds: z.array(z.string()).default([]),
    })
  )
  .default([]);

export async function fetchFigmaUsage(options: { startDate?: number; endDate?: number } = {}): Promise<ServiceUsage> {
  const accessToken = process.env.FIGMA_ACCESS_TOKEN;
  const teamId = process.env.FIGMA_TEAM_ID;
  const accountLabel = process.env.FIGMA_ACCOUNT_LABEL || `team-${teamId}`;
  if (!accessToken || !teamId) {
    return emptyUsage('figma', 'NOT_CONFIGURED', 'FIGMA_ACCESS_TOKEN과 FIGMA_TEAM_ID가 필요합니다.');
  }

  if (process.env.FIGMA_OAUTH_TOKEN) {
    const enterprise = await fetchActivityLogs(process.env.FIGMA_OAUTH_TOKEN, options);
    if (enterprise) {
      const projectInsights = await fetchProjectInsights(accessToken, teamId, accountLabel);
      if (!projectInsights) return enterprise;

      return {
        ...enterprise,
        figma: projectInsights.figma,
        models: [...enterprise.models, ...projectInsights.models],
      };
    }
  }

  return fetchProjectFallback(accessToken, teamId, accountLabel);
}

async function fetchActivityLogs(oauthToken: string, options: { startDate?: number; endDate?: number }): Promise<ServiceUsage | null> {
  let url = 'https://api.figma.com/v1/activity_logs?limit=100';
  if (options.startDate) url += `&start_time=${Math.floor(options.startDate / 1000)}`;
  if (options.endDate) url += `&end_time=${Math.floor(options.endDate / 1000)}`;

  const response = await fetch(url, {
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

async function fetchProjectFallback(accessToken: string, teamId: string, accountLabel: string): Promise<ServiceUsage> {
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

    const projects = parsed.data.projects;
    if (projects.length === 0) {
      return emptyUsage('figma', 'UNKNOWN', '팀 내에 조회 가능한 프로젝트가 없습니다. Team ID가 정확한지, 혹은 프로젝트가 모두 비공개인지 확인하세요.');
    }

    const metas = await Promise.all(projects.map((project) => fetchProjectMeta(accessToken, project.id)));
    const projectDetails = buildProjectDetails(projects, metas);
    const files = await fetchProjectFiles(accessToken, projects);

    if (files.length === 0) {
      return {
        ...emptyUsage('figma', 'UNKNOWN', '프로젝트 내에 파일이 없습니다. Figma의 [Drafts]에 있는 파일은 API로 조회되지 않으니 팀 프로젝트로 이동시켜주세요.'),
        connected: true,
        figma: {
          accountLabel,
          projectCount: projects.length,
          fileCount: 0,
          snapshotDate: today,
          projects: projectDetails,
          files: [],
        }
      };
    }

    const metaFileCount = metas.reduce((sum, meta) => sum + (meta?.file_count ?? 0), 0);
    const fileCount = metaFileCount || files.length;

    const today = dateKey();
    const projectsCreatedToday = metas.filter((meta) => isSameDayKST(meta?.created_at, today)).length;
    const filesUpdatedToday = files.filter((file) => isSameDayKST(file.lastModified, today)).length;

    // Simulate daily history from file modifications (using KST)
    const dailyMap = new Map<string, DailyUsage>();
    for (const file of files) {
      if (!file.lastModified) continue;
      // Get KST date string for each file
      const date = new Date(file.lastModified);
      const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
      const kstDateStr = kstDate.toISOString().slice(0, 10);

      const current = dailyMap.get(kstDateStr) ?? { date: kstDateStr, inputTokens: 0, outputTokens: 0, requests: 0, cost: 0 };
      current.requests += 1;
      current.outputTokens += 1;
      dailyMap.set(kstDateStr, current);
    }
    const dailyHistory = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    const snapshot = await updateProjectSnapshot(accountLabel, today, projects.map((project) => project.id));
    const figma: FigmaUsage = {
      accountLabel,
      projectCount: projects.length,
      fileCount,
      projectsCreatedToday,
      filesUpdatedToday,
      projectDeltaFromPreviousSnapshot: snapshot.previous ? projects.length - snapshot.previous.projectCount : undefined,
      previousSnapshotDate: snapshot.previous?.date,
      snapshotDate: today,
      projects: projectDetails,
      files,
    };

    return {
      service: 'figma',
      connected: true,
      error: 'PLAN_REQUIRED',
      errorMessage: 'Plan을 업그레이드 하면 더 자세한 정보가 출력됩니다. Drafts가 아닌 프로젝트 폴더에 있는 파일들만 집계됩니다.',
      cost: { today: 0, thisMonth: 0 },
      tokens: { input: 0, output: 0, total: fileCount },
      requests: fileCount,
      figma,
      models: [
        {
          model: 'projects',
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          requests: projects.length,
        },
        {
          model: 'projects_created_today',
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          requests: projectsCreatedToday,
        },
        {
          model: 'project_files',
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          requests: fileCount,
        },
      ],
      dailyHistory,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Figma] Usage fetch failed:', error);
    return emptyUsage('figma', 'UNKNOWN', `Figma 사용량 조회 중 오류가 발생했습니다: ${message}`);
  }
}

async function fetchProjectMeta(accessToken: string, projectId: string) {
  const response = await fetch(`https://api.figma.com/v1/projects/${projectId}/meta`, {
    headers: { 'X-Figma-Token': accessToken },
    cache: 'no-store',
  });
  if (!response.ok) return null;

  const parsed = ProjectMetaSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

async function fetchProjectInsights(accessToken: string, teamId: string, accountLabel: string) {
  const response = await fetch(`https://api.figma.com/v1/teams/${teamId}/projects`, {
    headers: { 'X-Figma-Token': accessToken },
    cache: 'no-store',
  });
  if (!response.ok) return null;

  const parsed = ProjectsSchema.safeParse(await response.json());
  if (!parsed.success) return null;

  const projects = parsed.data.projects;
  const metas = await Promise.all(projects.map((project) => fetchProjectMeta(accessToken, project.id)));
  const projectDetails = buildProjectDetails(projects, metas);
  const files = await fetchProjectFiles(accessToken, projects);
  const metaFileCount = metas.reduce((sum, meta) => sum + (meta?.file_count ?? 0), 0);
  const fileCount = metaFileCount || files.length;

  const today = dateKey();
  const projectsCreatedToday = metas.filter((meta) => isSameDayKST(meta?.created_at, today)).length;
  const filesUpdatedToday = files.filter((file) => isSameDayKST(file.lastModified, today)).length;
  const snapshot = await updateProjectSnapshot(accountLabel, today, projects.map((project) => project.id));
  const figma: FigmaUsage = {
    accountLabel,
    projectCount: projects.length,
    fileCount,
    projectsCreatedToday,
    filesUpdatedToday,
    projectDeltaFromPreviousSnapshot: snapshot.previous ? projects.length - snapshot.previous.projectCount : undefined,
    previousSnapshotDate: snapshot.previous?.date,
    snapshotDate: today,
    projects: projectDetails,
    files,
  };

  return {
    figma,
    models: [
      {
        model: 'projects',
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        requests: projects.length,
      },
      {
        model: 'projects_created_today',
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        requests: projectsCreatedToday,
      },
      {
        model: 'project_files',
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        requests: fileCount,
      },
    ],
  };
}

function buildProjectDetails(
  projects: z.infer<typeof ProjectsSchema>['projects'],
  metas: Array<z.infer<typeof ProjectMetaSchema> | null>
): FigmaProject[] {
  return projects
    .map((project, index) => {
      const meta = metas[index];
      return {
        id: project.id,
        name: meta?.name ?? project.name ?? project.id,
        fileCount: meta?.file_count,
        thumbnailUrl: meta?.thumbnail_url,
        createdAt: meta?.created_at,
        updatedAt: meta?.updated_at,
      };
    })
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}

async function fetchProjectFiles(
  accessToken: string,
  projects: z.infer<typeof ProjectsSchema>['projects']
): Promise<FigmaFile[]> {
  const allFiles: FigmaFile[] = [];

  // 429 에러 방지를 위해 순차적으로 처리 (약간의 지연 추가)
  for (const project of projects) {
    let retries = 2;
    while (retries > 0) {
      try {
        const response = await fetch(`https://api.figma.com/v1/projects/${project.id}/files`, {
          headers: { 'X-Figma-Token': accessToken },
          cache: 'no-store',
        });

        if (response.status === 429) {
          console.warn(`[Figma] Rate limit hit for project ${project.id}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기
          retries--;
          continue;
        }

        if (!response.ok) {
          console.error(`[Figma] Failed to fetch files for project ${project.id}: ${response.status}`);
          break;
        }

        const data = await response.json();
        const filesParsed = FilesSchema.safeParse(data);
        if (!filesParsed.success) break;

        for (const file of filesParsed.data.files) {
          allFiles.push({
            key: file.key,
            name: file.name ?? file.key,
            projectId: project.id,
            projectName: project.name ?? project.id,
            thumbnailUrl: file.thumbnail_url,
            lastModified: file.last_modified,
            branchName: file.branch_name,
          });
        }
        break; // 성공 시 루프 탈출
      } catch (e) {
        console.error(`[Figma] Error fetching project ${project.id}:`, e);
        break;
      }
    }
    // 프로젝트 간 간격 추가 (API 부하 방지)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 중복 제거 및 수정일 기준 내림차순 정렬
  const uniqueFiles = Array.from(new Map(allFiles.map(f => [f.key, f])).values());
  return uniqueFiles.sort((a, b) => {
    const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
    const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
    return dateB - dateA;
  });
}

function dateKey(date = new Date()) {
  if (isNaN(date.getTime())) return '0000-00-00';
  // 한국 시간(KST, UTC+9) 기준으로 날짜 문자열 생성
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(date.getTime() + kstOffset);
  return kstDate.toISOString().slice(0, 10);
}

function isSameDayKST(isoString: string | undefined, todayStr: string) {
  if (!isoString) return false;
  try {
    const date = new Date(isoString);
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(date.getTime() + kstOffset);
    return kstDate.toISOString().slice(0, 10) === todayStr;
  } catch (e) {
    return false;
  }
}

async function updateProjectSnapshot(accountLabel: string, today: string, projectIds: string[]) {
  const redis = getRedis();
  const key = `figma:snapshots:${safeFileName(accountLabel)}`;
  const data = await redis.get(key);
  const snapshots = Array.isArray(data) ? data : [];

  const previous = [...snapshots]
    .filter((snapshot: any) => snapshot.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  const next = [
    ...snapshots.filter((snapshot: any) => snapshot.date !== today),
    {
      date: today,
      projectCount: projectIds.length,
      projectIds,
    },
  ].sort((a, b) => a.date.localeCompare(b.date));

  const trimmed = next.slice(-30);
  await redis.set(key, trimmed);

  return { previous };
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'default';
}
