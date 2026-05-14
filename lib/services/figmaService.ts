import 'server-only';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { DailyUsage, FigmaFile, FigmaProject, FigmaUsage, ModelUsage, ServiceUsage } from '@/lib/types';
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

const snapshotDir = path.join(process.cwd(), 'data', 'figma');

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
    const metas = await Promise.all(projects.map((project) => fetchProjectMeta(accessToken, project.id)));
    const projectDetails = buildProjectDetails(projects, metas);
    const files = await fetchProjectFiles(accessToken, projects);
    const metaFileCount = metas.reduce((sum, meta) => sum + (meta?.file_count ?? 0), 0);
    const fileCount = metaFileCount || files.length;

    const today = dateKey();
    const projectsCreatedToday = metas.filter((meta) => meta?.created_at && dateKey(new Date(meta.created_at)) === today).length;
    const filesUpdatedToday = files.filter((file) => file.lastModified && dateKey(new Date(file.lastModified)) === today).length;
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
      errorMessage: 'activity_logs는 Enterprise 플랜과 OAuth token이 필요합니다. 파일 수로 대체 표시 중입니다.',
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
      dailyHistory: [],
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
  const projectsCreatedToday = metas.filter((meta) => meta?.created_at && dateKey(new Date(meta.created_at)) === today).length;
  const filesUpdatedToday = files.filter((file) => file.lastModified && dateKey(new Date(file.lastModified)) === today).length;
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
  const files: FigmaFile[] = [];
  for (const project of projects) {
    const filesResponse = await fetch(`https://api.figma.com/v1/projects/${project.id}/files`, {
      headers: { 'X-Figma-Token': accessToken },
      cache: 'no-store',
    });
    if (!filesResponse.ok) continue;
    const filesParsed = FilesSchema.safeParse(await filesResponse.json());
    if (!filesParsed.success) continue;

    for (const file of filesParsed.data.files) {
      files.push({
        key: file.key,
        name: file.name ?? file.key,
        projectId: project.id,
        projectName: project.name ?? project.id,
        thumbnailUrl: file.thumbnail_url,
        lastModified: file.last_modified,
        branchName: file.branch_name,
      });
    }
  }

  return files.sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''));
}

function dateKey(date = new Date()) {
  if (isNaN(date.getTime())) return '0000-00-00';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  try {
    return local.toISOString().slice(0, 10);
  } catch (e) {
    return '0000-00-00';
  }
}

async function updateProjectSnapshot(accountLabel: string, today: string, projectIds: string[]) {
  const snapshotPath = projectSnapshotPath(accountLabel);
  const snapshots = await readProjectSnapshots(snapshotPath);
  const previous = [...snapshots]
    .filter((snapshot) => snapshot.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const next = [
    ...snapshots.filter((snapshot) => snapshot.date !== today),
    {
      date: today,
      projectCount: projectIds.length,
      projectIds,
    },
  ].sort((a, b) => a.date.localeCompare(b.date));

  await writeProjectSnapshots(snapshotPath, next);
  return { previous };
}

function projectSnapshotPath(accountLabel: string) {
  return path.join(snapshotDir, `${safeFileName(accountLabel)}-project-snapshots.json`);
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'default';
}

async function readProjectSnapshots(snapshotPath: string) {
  try {
    const json = await readFile(snapshotPath, 'utf8');
    const parsed = SnapshotSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

async function writeProjectSnapshots(snapshotPath: string, snapshots: z.infer<typeof SnapshotSchema>) {
  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshots, null, 2)}\n`);
}
