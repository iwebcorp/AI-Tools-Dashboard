'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AllUsageResponse, ServiceId } from '@/lib/types';
import { formatCurrency, formatNum } from './format';

const names: Record<ServiceId, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  cursor: 'Cursor',
  claude: 'Claude',
  figma: 'Figma',
};

const colors: Record<ServiceId, string> = {
  openai: '#639922',
  gemini: '#185FA5',
  cursor: '#BA7517',
  claude: '#7F77DD',
  figma: '#D85A30',
};

export function CostChart({ data }: { data: AllUsageResponse }) {
  const rows = (Object.keys(names) as ServiceId[]).map((service) => ({
    service: names[service],
    cost: data[service].cost.thisMonth,
    tokens: data[service].tokens.total,
    fill: colors[service],
    unit: service === 'figma' ? '호출' : '토큰',
  }));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-950">서비스별 이번 달 비용</h3>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="service" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
            <Tooltip
              formatter={(value, name) => {
                if (name === 'cost') return [formatCurrency(Number(value)), '비용'];
                return [value, name];
              }}
              labelFormatter={(label, payload) => {
                const row = payload?.[0]?.payload as { tokens?: number; unit?: string } | undefined;
                return `${label} · ${formatNum(row?.tokens ?? 0)} ${row?.unit ?? '토큰'}`;
              }}
            />
            <Bar dataKey="cost" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
