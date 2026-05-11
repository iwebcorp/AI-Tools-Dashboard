'use client';

import { useState } from 'react';
import type { AllUsageResponse, ServiceId, ServiceUsage } from '@/lib/types';
import { useUsageData } from '@/hooks/useUsageData';
import { CostChart } from './CostChart';
import { DailyChart } from './DailyChart';
import { formatCurrency, formatDateTime, formatNum } from './format';
import { ModelBreakdown } from './ModelBreakdown';
import { ServiceCard } from './ServiceCard';
import { TokenGauge } from './TokenGauge';

const serviceIds: ServiceId[] = ['openai', 'gemini', 'cursor', 'claude', 'figma'];
const serviceNames: Record<ServiceId, string> = {
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

type Tab = 'overview' | ServiceId;

export function Dashboard() {
  const { data, loading, refreshing, error, lastUpdated, refresh } = useUsageData();
  const [tab, setTab] = useState<Tab>('overview');

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="h-9 w-72 animate-pulse rounded bg-slate-200" />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-32 animate-pulse rounded-lg bg-white" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AI Usage Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">OpenAI, Gemini, Cursor, Claude, Figma usage and cost.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">Updated {formatDateTime(lastUpdated)}</span>
            <button
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </header>

        {error ? <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <nav className="mt-6 flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
          {(['overview', ...serviceIds] as Tab[]).map((item) => (
            <button
              key={item}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                tab === item ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
              onClick={() => setTab(item)}
            >
              {item === 'overview' ? 'Overview' : serviceNames[item]}
            </button>
          ))}
        </nav>

        {data ? (
          tab === 'overview' ? (
            <Overview data={data} />
          ) : (
            <ServiceDetail usage={data[tab]} allData={data} />
          )
        ) : null}
      </div>
    </main>
  );
}

function Overview({ data }: { data: AllUsageResponse }) {
  const services = serviceIds.map((id) => data[id]);
  const totalCost = services.reduce((sum, usage) => sum + usage.cost.thisMonth, 0);
  const totalTokens = services.reduce((sum, usage) => sum + usage.tokens.total, 0);
  const active = services.filter((usage) => usage.connected).length;

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Total cost" value={formatCurrency(totalCost)} />
        <Metric label="Tokens + API calls" value={formatNum(totalTokens)} />
        <Metric label="Active services" value={`${active}/5`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {serviceIds.map((id) => (
          <TokenGauge
            key={id}
            label={serviceNames[id]}
            used={data[id].tokens.total}
            color={colors[id]}
            unit={id === 'figma' ? 'calls' : 'tokens'}
          />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <CostChart data={data} />
        <DailyChart data={data} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {services.map((usage) => (
          <ServiceCard key={usage.service} usage={usage} />
        ))}
      </div>
    </div>
  );
}

function ServiceDetail({ usage }: { usage: ServiceUsage; allData: AllUsageResponse }) {
  const isFigma = usage.service === 'figma';
  const isCursor = usage.service === 'cursor';

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {isCursor ? (
          <>
            <Metric label="Today cost" value={formatCurrency(usage.cost.today)} />
            <Metric label="Month cost" value={formatCurrency(usage.cost.thisMonth)} />
            <Metric label="Total tokens" value={formatNum(usage.tokens.total)} />
            <Metric label="Requests" value={formatNum(usage.requests)} />
          </>
        ) : isFigma ? (
          <>
            <Metric label="API 호출 수" value={formatNum(usage.tokens.total)} />
            <Metric label="Code generation" value={formatNum(usage.models.find((item) => item.model === 'code_generation')?.requests ?? 0)} />
            <Metric label="Month cost" value={formatCurrency(usage.cost.thisMonth)} />
            <Metric label="Events" value={formatNum(usage.requests)} />
          </>
        ) : (
          <>
            <Metric label="Input tokens" value={formatNum(usage.tokens.input)} />
            <Metric label="Output tokens" value={formatNum(usage.tokens.output)} />
            <Metric label="Month cost" value={formatCurrency(usage.cost.thisMonth)} />
            <Metric label="Requests" value={formatNum(usage.requests)} />
          </>
        )}
      </div>

      {usage.errorMessage ? <div className="rounded-lg bg-white p-4 text-sm text-slate-600">{usage.errorMessage}</div> : null}

      <ModelBreakdown models={usage.models} serviceId={usage.service} />
      <DailyChart service={usage} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}
