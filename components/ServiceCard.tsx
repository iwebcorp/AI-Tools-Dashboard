import type { ServiceUsage } from '@/lib/types';
import { formatCurrency, formatDateTime, formatNum } from './format';

const serviceNames: Record<ServiceUsage['service'], string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  cursor: 'Cursor',
  figma: 'Figma',
  chatgpt: 'ChatGPT',
};

const serviceColors: Record<ServiceUsage['service'], string> = {
  openai: '#639922',
  gemini: '#185FA5',
  cursor: '#BA7517',
  figma: '#D85A30',
  chatgpt: '#10A37F',
};

export function ServiceCard({ usage }: { usage: ServiceUsage }) {
  const isFigma = usage.service === 'figma';
  const figma = usage.figma;
  const figmaDelta = figma?.projectDeltaFromPreviousSnapshot;
  
  const isConnected = usage.connected;
  const isError = usage.error && usage.error !== 'NOT_CONFIGURED';
  const isNotConfigured = usage.error === 'NOT_CONFIGURED';

  const statusColor = isConnected
    ? 'bg-emerald-500'
    : isNotConfigured
      ? 'bg-slate-300'
      : 'bg-red-500';

  return (
    <div className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg">
      {/* Top Section: Header & Status */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div 
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm"
            style={{ backgroundColor: serviceColors[usage.service] }}
          >
            <span className="text-xs font-black uppercase tracking-tighter">
              {usage.service.slice(0, 2)}
            </span>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">{serviceNames[usage.service]}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`h-2 w-2 rounded-full ${statusColor}`} />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-tight">
                {isConnected ? 'Connected' : isNotConfigured ? 'Pending' : 'Error'}
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-black text-slate-950">{formatCurrency(usage.cost.thisMonth)}</div>
          <div className="text-xs font-medium text-slate-400">
            {usage.service === 'cursor' ? '추가 사용 요금' : '이번 달 비용'}
          </div>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-50 pt-6">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {figma ? '프로젝트' : isFigma ? '파일' : '총 토큰'}
          </div>
          <div className="mt-1.5 text-base font-bold text-slate-700">
            {figma ? formatNum(figma.projectCount) : formatNum(usage.tokens.total)}
          </div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {figma ? '오늘 생성' : '요청 수'}
          </div>
          <div className="mt-1.5 text-base font-bold text-slate-700">
            {figma ? formatNum(figma.projectsCreatedToday ?? 0) : formatNum(usage.requests)}
          </div>
        </div>
      </div>

      {/* Secondary Info (Figma Delta / Session / Error) */}
      <div className="mt-auto pt-5">
        {figma && figmaDelta !== undefined ? (
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <span className="text-xs font-medium text-slate-500">전일 대비</span>
            <span className={`text-xs font-bold ${figmaDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {figmaDelta >= 0 ? '+' : ''}{formatNum(figmaDelta)}
            </span>
          </div>
        ) : usage.session?.active ? (
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <span className="text-xs font-medium text-slate-500">Session</span>
            <span className="text-xs font-bold text-emerald-600 uppercase">Active</span>
          </div>
        ) : isError ? (
          <div className="rounded-xl bg-red-50 px-3 py-2">
            <p className="line-clamp-1 text-xs font-medium text-red-700" title={usage.errorMessage}>
              {usage.errorMessage}
            </p>
          </div>
        ) : (
          <div className="h-[34px]" /> /* Spacer to keep cards balanced */
        )}
      </div>
    </div>
  );
}
