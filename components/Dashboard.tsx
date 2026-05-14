'use client';

import { useState } from 'react';
import type { AccountUsage, AllUsageResponse, ServiceId, ServiceUsage } from '@/lib/types';
import { useUsageData } from '@/hooks/useUsageData';
import { CostChart } from './CostChart';
import { DailyChart } from './DailyChart';
import { formatCurrency, formatDateTime, formatNum } from './format';
import { ModelBreakdown } from './ModelBreakdown';
import { ServiceCard } from './ServiceCard';
import { TokenGauge } from './TokenGauge';

const serviceIds: ServiceId[] = ['openai', 'gemini', 'cursor', 'figma', 'chatgpt'];
const serviceNames: Record<ServiceId, string> = {
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

type Tab = 'overview' | ServiceId;

interface CursorRange {
  start: string;
  end: string;
}

function dateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function initialCursorRange(): CursorRange {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    start: dateInputValue(monthStart),
    end: dateInputValue(today),
  };
}

export function Dashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const [cursorRange, setCursorRange] = useState<CursorRange>(initialCursorRange);
  const { data, loading, refreshing, error, lastUpdated, refresh } = useUsageData({
    cursorStart: cursorRange.start,
    cursorEnd: cursorRange.end,
  });

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
    <main className="min-h-screen bg-slate-50/50 text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 px-4 py-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">AI Usage Dashboard</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">OpenAI, Gemini, Cursor, Figma, ChatGPT 통합 모니터링</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-500">
              마지막 업데이트 <span className="text-slate-700">{formatDateTime(lastUpdated)}</span>
            </span>
            <button
              className="flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              {refreshing ? '새로고침 중...' : '데이터 새로고침'}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:px-8">
        {error ? (
          <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm ring-1 ring-inset ring-red-600/10">
            {error}
          </div>
        ) : null}

        <nav className="mb-8 flex gap-2 overflow-x-auto rounded-xl border border-slate-200/60 bg-white/60 p-1.5 shadow-sm backdrop-blur-sm">
          {(['overview', ...serviceIds] as Tab[]).map((item) => (
            <button
              key={item}
              className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                tab === item 
                  ? 'bg-slate-900 text-white shadow-md' 
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              onClick={() => setTab(item)}
            >
              {item === 'overview' ? '전체 요약' : serviceNames[item]}
            </button>
          ))}
        </nav>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {data ? (
            tab === 'overview' ? (
              <Overview data={data} />
            ) : (
              <ServiceDetail
                usage={data[tab]}
                cursorRange={cursorRange}
                onCursorRangeChange={setCursorRange}
              />
            )
          ) : null}
        </div>
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
        <Metric label="이번 달 총 비용" value={formatCurrency(totalCost)} />
        <Metric label="총 토큰/API 호출" value={formatNum(totalTokens)} />
        <Metric label="활성 서비스" value={`${active}/6`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {serviceIds.map((id) => (
          <TokenGauge
            key={id}
            label={serviceNames[id]}
            used={data[id].tokens.total}
            color={colors[id]}
            unit={id === 'figma' ? '호출' : id === 'chatgpt' ? '대화' : '토큰'}
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

function ServiceDetail({
  usage,
  cursorRange,
  onCursorRangeChange,
}: {
  usage: ServiceUsage;
  cursorRange: CursorRange;
  onCursorRangeChange: (range: CursorRange) => void;
}) {
  const isFigma = usage.service === 'figma';
  const isCursor = usage.service === 'cursor';
  const isChatgpt = usage.service === 'chatgpt';
  const [selectedCursorAccountIndex, setSelectedCursorAccountIndex] = useState<number | null>(null);
  const [selectedChatgptModel, setSelectedChatgptModel] = useState<string | null>(null);
  const selectedCursorAccount =
    isCursor && selectedCursorAccountIndex !== null ? usage.accounts?.[selectedCursorAccountIndex] : undefined;
  const selectedChatgptModelUsage =
    isChatgpt && selectedChatgptModel ? usage.models.find((model) => model.model === selectedChatgptModel) : undefined;

  return (
    <div className="mt-6 space-y-6">
      {(isCursor || isFigma || isChatgpt) ? <CursorRangeControls range={cursorRange} onChange={onCursorRangeChange} /> : null}

      <div className="grid gap-4 md:grid-cols-4">
        {isCursor ? (
          <>
            <Metric label="오늘 사용액" value={formatCurrency(usage.cost.today)} />
            <Metric label="선택 기간 사용액" value={formatCurrency(usage.cost.thisMonth)} />
            <Metric label="선택 기간 총 토큰" value={formatNum(usage.tokens.total)} />
            <Metric label="선택 기간 요청 수" value={formatNum(usage.requests)} />
          </>
        ) : isFigma ? (
          usage.error === 'PLAN_REQUIRED' ? (
            <>
              <Metric label="읽어온 총 파일 수" value={formatNum(usage.tokens.total)} />
              <Metric label="플랜" value="Professional (추정)" />
              <Metric label="API 호출 수" value="조회 불가 (Enterprise 전용)" />
              <Metric label="이번 달 비용" value="조회 불가" />
            </>
          ) : (
            <>
              <Metric label="이번 달 API 호출 수" value={formatNum(usage.tokens.total)} />
              <Metric label="코드 생성 호출 수" value={formatNum(usage.models.find((item) => item.model === 'code_generation')?.requests ?? 0)} />
              <Metric label="이번 달 비용" value={formatCurrency(usage.cost.thisMonth)} />
              <Metric label="요청 수" value={formatNum(usage.requests)} />
            </>
          )
        ) : usage.service === 'chatgpt' ? (
          <>
            <Metric label="총 대화 수" value={formatNum(usage.requests)} />
            <Metric label="최근 대화 횟수" value={formatNum(usage.dailyHistory.find(d => d.date === new Date().toISOString().slice(0, 10))?.requests ?? 0)} />
            <Metric label="플랜" value="ChatGPT Plus" />
            <Metric label="비용" value="구독 포함" />
          </>
        ) : (
          <>
            <Metric label="이번 달 입력 토큰" value={formatNum(usage.tokens.input)} />
            <Metric label="이번 달 출력 토큰" value={formatNum(usage.tokens.output)} />
            <Metric label="이번 달 비용" value={formatCurrency(usage.cost.thisMonth)} />
            <Metric label="이번 달 요청 수" value={formatNum(usage.requests)} />
          </>
        )}
      </div>

      {usage.errorMessage ? <div className="rounded-lg bg-white p-4 text-sm text-slate-600">{usage.errorMessage}</div> : null}

      {isCursor && usage.accounts?.length ? (
        <CursorAccounts
          accounts={usage.accounts}
          selectedIndex={selectedCursorAccountIndex}
          onSelect={setSelectedCursorAccountIndex}
        />
      ) : null}

      <ModelBreakdown
        models={selectedCursorAccount?.models ?? usage.models}
        serviceId={usage.service}
        error={usage.error}
        selectedModel={isChatgpt ? selectedChatgptModel : undefined}
        onSelectModel={isChatgpt ? setSelectedChatgptModel : undefined}
      />
      {usage.error === 'PLAN_REQUIRED' ? null : (
        <DailyChart
          service={selectedCursorAccount || selectedChatgptModelUsage ? undefined : usage}
          account={selectedCursorAccount}
          model={selectedChatgptModelUsage}
        />
      )}
    </div>
  );
}

function CursorRangeControls({
  range,
  onChange,
}: {
  range: CursorRange;
  onChange: (range: CursorRange) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm text-slate-600">
          시작일
          <input
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950"
            value={range.start}
            max={range.end}
            onChange={(event) => onChange({ ...range, start: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm text-slate-600">
          종료일
          <input
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950"
            value={range.end}
            min={range.start}
            onChange={(event) => onChange({ ...range, end: event.target.value })}
          />
        </label>
        <button
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => onChange(initialCursorRange())}
        >
          이번 달
        </button>
        <p className="text-sm text-slate-500">선택한 기간을 기준으로 사용량 및 표, 일별 추이를 다시 계산합니다.</p>
      </div>
    </div>
  );
}

function CursorAccounts({
  accounts,
  selectedIndex,
  onSelect,
}: {
  accounts: AccountUsage[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-950">Cursor 계정별 선택 기간 사용량</h2>
        {selectedIndex !== null ? (
          <button className="text-sm font-medium text-slate-600 hover:text-slate-950" onClick={() => onSelect(null)}>
            전체 보기
          </button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">계정</th>
              <th className="px-4 py-3 text-right">오늘 사용액</th>
              <th className="px-4 py-3 text-right">선택 기간 사용액</th>
              <th className="px-4 py-3 text-right">선택 기간 총 토큰</th>
              <th className="px-4 py-3 text-right">입력/캐시 토큰</th>
              <th className="px-4 py-3 text-right">출력 토큰</th>
              <th className="px-4 py-3 text-right">요청 수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.map((account, index) => {
              const selected = selectedIndex === index;
              return (
                <tr
                  key={account.label}
                  className={`cursor-pointer ${selected ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                  onClick={() => onSelect(selected ? null : index)}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{account.label}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(account.cost.today)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(account.cost.thisMonth)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatNum(account.tokens.total)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatNum(account.tokens.input)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatNum(account.tokens.output)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatNum(account.requests)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
      <div className="text-sm font-medium text-slate-500 group-hover:text-slate-600">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div>
    </div>
  );
}
