import { formatNum } from './format';

interface TokenGaugeProps {
  used: number;
  limit?: number;
  label: string;
  color: string;
  unit?: string;
}

export function TokenGauge({ used, limit, label, color, unit = 'tokens' }: TokenGaugeProps) {
  const percent = limit && limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const barColor = percent >= 95 ? '#dc2626' : percent >= 80 ? '#d97706' : color;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 break-words text-sm font-medium leading-tight text-slate-700">{label}</span>
        <span className="shrink-0 text-right text-sm text-slate-500">{formatNum(used)} {unit}</span>
      </div>
      {limit ? (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: barColor }} />
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {formatNum(used)} / {formatNum(limit)} {unit}
          </div>
        </div>
      ) : (
        <div className="mt-3 h-2 rounded-full" style={{ backgroundColor: color }} />
      )}
    </div>
  );
}
