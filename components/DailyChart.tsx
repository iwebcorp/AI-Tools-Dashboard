'use client';

import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AccountUsage, AllUsageResponse, ModelUsage, ServiceId, ServiceUsage } from '@/lib/types';
import { formatCurrency, formatNum } from './format';

const serviceIds: ServiceId[] = ['openai', 'gemini', 'cursor', 'figma', 'chatgpt'];

const names: Record<ServiceId, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  cursor: 'Cursor',
  figma: 'Figma',
  chatgpt: 'ChatGPT',
};

const colors: Record<ServiceId, string> = {
  openai: '#639922',
  gemini: '#185FA5',
  cursor: '#BA7517',
  figma: '#D85A30',
  chatgpt: '#10A37F',
};

interface DailyChartProps {
  data?: AllUsageResponse;
  service?: ServiceUsage;
  account?: AccountUsage;
  model?: ModelUsage;
  serviceId?: ServiceId;
}

export function DailyChart({ data, service, account, model, serviceId }: DailyChartProps) {
  const [metric, setMetric] = useState<'tokens' | 'cost'>('tokens');
  const [visible, setVisible] = useState<Record<ServiceId, boolean>>({
    openai: true,
    gemini: true,
    cursor: true,
    figma: true,
    chatgpt: true,
  });

  const rows = useMemo(() => {
    const byDate = new Map<string, Record<string, any>>();
    const add = (id: ServiceId, usage: Pick<ServiceUsage, 'dailyHistory'>) => {
      for (const day of usage.dailyHistory) {
        const row = byDate.get(day.date) ?? { date: day.date.slice(5).replace('-', '/') };
        row[id] = metric === 'cost' ? day.cost : day.inputTokens + day.outputTokens || day.requests;
        byDate.set(day.date, row);
      }
    };

    const sid = serviceId || service?.service || 'chatgpt';

    if (model?.dailyHistory) add(sid, { dailyHistory: model.dailyHistory });
    if (account?.dailyHistory) add('cursor', account);
    if (service && !account && !model) add(service.service, service);
    if (data) serviceIds.forEach((id) => add(id, data[id]));

    if (byDate.size === 0) return [];

    const sortedDates = [...byDate.keys()].sort();
    const [startYear, startMonth, startDay] = sortedDates[0].split('-').map(Number);
    const [endYear, endMonth, endDay] = sortedDates[sortedDates.length - 1].split('-').map(Number);
    
    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);
    
    const result = [];
    const current = new Date(start);
    const activeIds = model ? ([sid] as const) : account ? (['cursor'] as const) : service ? ([service.service] as const) : serviceIds;

    while (current <= end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;
      
      const row = byDate.get(dateKey) || { date: dateKey.slice(5).replace('-', '/') };
      activeIds.forEach((id) => {
        if (row[id] === undefined) row[id] = 0;
      });
      result.push(row);
      current.setDate(current.getDate() + 1);
    }
    return result;
  }, [account, data, metric, model, service, serviceId]);

  const activeServices = model ? [serviceId || service?.service || ('chatgpt' as const)] : account ? ['cursor' as const] : service ? [service.service] : serviceIds.filter((id) => visible[id]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-950">
          {model ? `${model.model} 일별 추이` : account ? `${account.label} 일별 추이` : '일별 추이'}
        </h3>
        <div className="flex rounded-md border border-slate-200 p-1 text-sm">
          <button
            className={`rounded px-3 py-1 ${metric === 'tokens' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
            onClick={() => setMetric('tokens')}
          >
            토큰
          </button>
          <button
            className={`rounded px-3 py-1 ${metric === 'cost' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
            onClick={() => setMetric('cost')}
          >
            비용
          </button>
        </div>
      </div>
      {!service && !account && !model ? (
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {serviceIds.map((id) => (
            <label key={id} className="flex items-center gap-2 text-slate-600">
              <input
                type="checkbox"
                checked={visible[id]}
                onChange={(event) => setVisible((current) => ({ ...current, [id]: event.target.checked }))}
              />
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[id] }} />
              {names[id]}
            </label>
          ))}
        </div>
      ) : null}
      <div className="mt-4 h-72">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md bg-slate-50 text-sm text-slate-500">
            표시할 데이터가 없습니다
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => (metric === 'cost' ? `$${value}` : formatNum(Number(value)))}
              />
              <Tooltip formatter={(value) => (metric === 'cost' ? formatCurrency(Number(value)) : formatNum(Number(value)))} />
              {activeServices.map((id) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  stroke={colors[id]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
