import type { ServiceUsage } from '@/lib/types';
import { formatCurrency, formatNum } from './format';

const serviceNames: Record<ServiceUsage['service'], string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  cursor: 'Cursor',
  claude: 'Claude',
  figma: 'Figma',
};

export function ServiceCard({ usage }: { usage: ServiceUsage }) {
  const isFigma = usage.service === 'figma';
  const dot = usage.connected ? 'bg-emerald-500' : usage.error === 'NOT_CONFIGURED' ? 'bg-slate-400' : 'bg-red-500';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
            <h3 className="text-base font-semibold text-slate-950">{serviceNames[usage.service]}</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">{usage.connected ? '연결됨' : usage.error ?? '연결 안 됨'}</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-slate-950">{formatCurrency(usage.cost.thisMonth)}</div>
          <div className="text-xs text-slate-500">이번 달</div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-slate-500">{isFigma ? 'API 호출 수' : '총 토큰'}</div>
          <div className="font-semibold text-slate-900">{formatNum(usage.tokens.total)}</div>
        </div>
        <div>
          <div className="text-slate-500">요청 수</div>
          <div className="font-semibold text-slate-900">{formatNum(usage.requests)}</div>
        </div>
      </div>
      {usage.errorMessage ? (
        <div className="mt-4 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600">{usage.errorMessage}</div>
      ) : null}
    </div>
  );
}
