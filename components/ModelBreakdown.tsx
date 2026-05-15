import type { ErrorCode, ModelUsage, ServiceId } from '@/lib/types';
import { formatCurrency, formatNum } from './format';

export function ModelBreakdown({
  models,
  serviceId,
  error,
  selectedModel,
  onSelectModel,
}: {
  models: ModelUsage[];
  serviceId: ServiceId;
  error?: ErrorCode;
  selectedModel?: string | null;
  onSelectModel?: (model: string | null) => void;
}) {
  if (models.length === 0) {
    return (
      <div className="flex min-h-[100px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        데이터 없음
      </div>
    );
  }

  const sorted = [...models].sort((a, b) => (serviceId === 'figma' ? b.requests - a.requests : b.cost - a.cost));
  const total = sorted.reduce((sum, item) => sum + (serviceId === 'figma' ? item.requests : item.cost), 0);
  const totalRequests = sorted.reduce((sum, item) => sum + item.requests, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-base font-semibold text-slate-900">
          {serviceId === 'figma' ? (error === 'PLAN_REQUIRED' ? '데이터 종류별 요약' : '이벤트 타입별 요약') : '모델별 상세 내역'}
        </h3>
        <div className="text-xs font-medium text-slate-500">
          총 {sorted.length}개 {serviceId === 'figma' ? '분류' : '모델'}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((item) => {
          const value = serviceId === 'figma' ? item.requests : item.cost;
          const share = total > 0 ? (value / total) * 100 : 0;
          const isSelected = selectedModel === item.model;

          return (
            <div
              key={item.model}
              className={`group relative flex flex-col rounded-2xl border p-5 transition-all ${
                onSelectModel ? 'cursor-pointer hover:border-slate-300 hover:shadow-md' : 'border-slate-200'
              } ${isSelected ? 'border-emerald-500 bg-emerald-50/30 ring-1 ring-emerald-500' : 'border-slate-200 bg-white'}`}
              onClick={() => onSelectModel?.(isSelected ? null : item.model)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-900" title={item.model}>
                    {item.model}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">{formatNum(item.requests)} 요청</span>
                    {serviceId !== 'figma' && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                        {share.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
                {serviceId !== 'figma' && (
                  <div className="text-right">
                    <div className="text-sm font-black text-slate-950">{formatCurrency(item.cost)}</div>
                    <div className="text-[10px] font-medium text-slate-400">이번 달 사용액</div>
                  </div>
                )}
              </div>

              {serviceId !== 'figma' && (
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">입력/캐시</div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-700">{formatNum(item.inputTokens)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">출력</div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-700">{formatNum(item.outputTokens)}</div>
                  </div>
                </div>
              )}

              {/* Progress Bar for Share */}
              <div className="mt-auto pt-4">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full transition-all duration-500 ${isSelected ? 'bg-emerald-500' : 'bg-slate-300 group-hover:bg-slate-400'}`}
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
