import type { ModelUsage, ServiceId } from '@/lib/types';
import { formatCurrency, formatNum } from './format';

export function ModelBreakdown({ models, serviceId }: { models: ModelUsage[]; serviceId: ServiceId }) {
  if (models.length === 0) {
    return <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">데이터 없음</div>;
  }

  const sorted = [...models].sort((a, b) => (serviceId === 'figma' ? b.requests - a.requests : b.cost - a.cost));
  const total = sorted.reduce((sum, item) => sum + (serviceId === 'figma' ? item.requests : item.cost), 0);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">{serviceId === 'figma' ? '이벤트 타입' : '모델명'}</th>
            {serviceId === 'figma' ? (
              <>
                <th className="px-4 py-3 text-right">호출 수</th>
                <th className="px-4 py-3 text-right">비중</th>
              </>
            ) : (
              <>
                <th className="px-4 py-3 text-right">입력 토큰</th>
                <th className="px-4 py-3 text-right">출력 토큰</th>
                <th className="px-4 py-3 text-right">비용</th>
                <th className="px-4 py-3 text-right">비중</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((item) => {
            const value = serviceId === 'figma' ? item.requests : item.cost;
            const share = total > 0 ? (value / total) * 100 : 0;
            return (
              <tr key={item.model}>
                <td className="px-4 py-3 font-medium text-slate-900">{item.model}</td>
                {serviceId === 'figma' ? (
                  <>
                    <td className="px-4 py-3 text-right text-slate-700">{formatNum(item.requests)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{share.toFixed(1)}%</td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-right text-slate-700">{formatNum(item.inputTokens)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatNum(item.outputTokens)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(item.cost)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{share.toFixed(1)}%</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
