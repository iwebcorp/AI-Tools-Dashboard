import type { ServiceUsage } from '@/lib/types';
import { formatCurrency, formatNum } from './format';

const serviceNames: Record<ServiceUsage['service'], string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  cursor: 'Cursor',
  figma: 'Figma',
  chatgpt: 'ChatGPT',
};

export function ServiceCard({ usage }: { usage: ServiceUsage }) {
  const isFigma = usage.service === 'figma';
  const figma = usage.figma;
  const figmaDelta = figma?.projectDeltaFromPreviousSnapshot;
  const dot = usage.connected
    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
    : usage.error === 'NOT_CONFIGURED'
      ? 'bg-slate-400'
      : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';

  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2.5">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
            <h3 className="min-w-0 break-words text-lg font-bold leading-tight tracking-tight text-slate-900">{serviceNames[usage.service]}</h3>
          </div>
          <p className="mt-1.5 break-words text-xs font-medium text-slate-500">
            {usage.connected ? '연결됨' : usage.error ?? '연결 안됨'}
            {figma?.accountLabel ? ` · ${figma.accountLabel}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold tracking-tight text-slate-900">{formatCurrency(usage.cost.thisMonth)}</div>
          <div className="text-xs font-medium text-slate-500">이번 달 비용</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-slate-50/50 p-4">
        <div>
          <div className="text-xs font-medium text-slate-500">{figma ? '총 프로젝트 수' : isFigma ? '총 파일 수' : '총 사용 토큰'}</div>
          <div className="mt-1 text-lg font-bold text-slate-800">{figma ? formatNum(figma.projectCount) : formatNum(usage.tokens.total)}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500">{figma ? 'API 기준 오늘 생성 프로젝트' : isFigma && usage.error === 'PLAN_REQUIRED' ? 'API 상세 정보' : '총 요청 수'}</div>
          <div className="mt-1 text-lg font-bold text-slate-800">{figma ? formatNum(figma.projectsCreatedToday ?? 0) : isFigma && usage.error === 'PLAN_REQUIRED' ? '제한됨' : formatNum(usage.requests)}</div>
        </div>
      </div>

      {figma && figmaDelta !== undefined ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-600">
          전일 스냅샷 대비{' '}
          <span className={figmaDelta >= 0 ? 'text-emerald-700' : 'text-red-700'}>
            {figmaDelta >= 0 ? '+' : ''}
            {formatNum(figmaDelta)}
          </span>
          {figma.previousSnapshotDate ? <span className="text-slate-400"> · 기준일 {figma.previousSnapshotDate}</span> : null}
        </div>
      ) : null}

      {usage.errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50/50 p-3 text-xs font-medium leading-relaxed text-red-800">
          {usage.errorMessage}
        </div>
      ) : null}
    </div>
  );
}
