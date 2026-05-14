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
  const dot = usage.connected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : usage.error === 'NOT_CONFIGURED' ? 'bg-slate-400' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';

  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">{serviceNames[usage.service]}</h3>
          </div>
          <p className="mt-1.5 text-xs font-medium text-slate-500">{usage.connected ? '정상 연결됨' : usage.error ?? '연결 안 됨'}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-tight text-slate-900">{formatCurrency(usage.cost.thisMonth)}</div>
          <div className="text-xs font-medium text-slate-500">이번 달 누적</div>
        </div>
      </div>
      
      <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-slate-50/50 p-4">
        <div>
          <div className="text-xs font-medium text-slate-500">{isFigma ? (usage.error === 'PLAN_REQUIRED' ? '총 파일 수' : 'API 호출 수') : '총 사용 토큰'}</div>
          <div className="mt-1 text-lg font-bold text-slate-800">{formatNum(usage.tokens.total)}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500">{isFigma && usage.error === 'PLAN_REQUIRED' ? 'API 상세 정보' : '총 요청 수'}</div>
          <div className="mt-1 text-lg font-bold text-slate-800">{isFigma && usage.error === 'PLAN_REQUIRED' ? '제한됨' : formatNum(usage.requests)}</div>
        </div>
      </div>
      
      {usage.errorMessage ? (
        <div className="mt-4 rounded-xl bg-red-50/50 border border-red-100 p-3 text-xs font-medium leading-relaxed text-red-800">
          {usage.errorMessage}
        </div>
      ) : null}
    </div>
  );
}
