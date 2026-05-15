'use client';

import { useState } from 'react';
import type { AccountUsage, AllUsageResponse, FigmaFile, FigmaUsage, ServiceId, ServiceUsage } from '@/lib/types';
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

interface UsageRange {
  start: string;
  end: string;
}

function dateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function initialUsageRange(): UsageRange {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    start: dateInputValue(monthStart),
    end: dateInputValue(today),
  };
}

export function Dashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const [usageRange, setUsageRange] = useState<UsageRange>(initialUsageRange);
  const { data, loading, refreshing, error, lastUpdated, refresh } = useUsageData({
    cursorStart: usageRange.start,
    cursorEnd: usageRange.end,
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
              className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${tab === item
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
                usageRange={usageRange}
                onUsageRangeApply={setUsageRange}
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
        <Metric label="연결된 서비스" value={`${active}/5`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {serviceIds.map((id) => (
          <TokenGauge
            key={id}
            label={serviceNames[id]}
            used={data[id].tokens.total}
            color={colors[id]}
            unit={id === 'figma' ? '파일' : id === 'chatgpt' ? '대화' : '토큰'}
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
  usageRange,
  onUsageRangeApply,
}: {
  usage: ServiceUsage;
  usageRange: UsageRange;
  onUsageRangeApply: (range: UsageRange) => void;
}) {
  const isFigma = usage.service === 'figma';
  const isCursor = usage.service === 'cursor';
  const [selectedCursorAccountIndex, setSelectedCursorAccountIndex] = useState<number | null>(null);
  const [selectedModelName, setSelectedModelName] = useState<string | null>(null);

  const selectedCursorAccount =
    isCursor && selectedCursorAccountIndex !== null ? usage.accounts?.[selectedCursorAccountIndex] : undefined;
  
  const selectedModel =
    selectedModelName ? (selectedCursorAccount?.models ?? usage.models).find((m) => m.model === selectedModelName) : undefined;

  // 지표 계산: 선택된 계정이나 모델이 있으면 해당 데이터를 사용, 없으면 전체 서비스 데이터 사용
  const metrics = {
    requests: selectedModel?.requests ?? selectedCursorAccount?.requests ?? usage.requests,
    inputTokens: selectedModel?.inputTokens ?? selectedCursorAccount?.tokens.input ?? usage.tokens.input,
    outputTokens: selectedModel?.outputTokens ?? selectedCursorAccount?.tokens.output ?? usage.tokens.output,
    totalTokens: (selectedModel ? (selectedModel.inputTokens + selectedModel.outputTokens) : undefined) ?? selectedCursorAccount?.tokens.total ?? usage.tokens.total,
    cost: selectedModel?.cost ?? selectedCursorAccount?.cost.thisMonth ?? usage.cost.thisMonth,
    todayCost: selectedCursorAccount?.cost.today ?? usage.cost.today,
  };

  return (
    <div className="mt-6 space-y-6">
      {isCursor || isFigma || usage.service === 'chatgpt' || usage.service === 'openai' || usage.service === 'gemini' ? (
        <UsageRangeControls range={usageRange} onApply={onUsageRangeApply} />
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        {isCursor ? (
          <>
            <Metric label={selectedModel ? '선택 모델 오늘 추가 요금' : '오늘 추가 요금'} value={formatCurrency(metrics.todayCost)} />
            <Metric label={selectedModel ? '선택 모델 기간 추가 요금' : '선택 기간 추가 요금'} value={formatCurrency(metrics.cost)} />
            <Metric label="선택 기간 총 토큰" value={formatNum(metrics.totalTokens)} />
            <Metric label="선택 기간 요청 수" value={formatNum(metrics.requests)} />
          </>
        ) : isFigma ? null : usage.service === 'chatgpt' ? (
          <>
            <Metric label={selectedModel ? `${selectedModel.model} 요청 수` : '총 요청 수'} value={formatNum(metrics.requests)} />
            <Metric label="총 입력 토큰" value={formatNum(metrics.inputTokens)} />
            <Metric label="총 출력 토큰" value={formatNum(metrics.outputTokens)} />
            <Metric label="요금" value="플랜 포함" />
          </>
        ) : (
          <>
            <Metric label={selectedModel ? `${selectedModel.model} 입력 토큰` : '이번 달 입력 토큰'} value={formatNum(metrics.inputTokens)} />
            <Metric label={selectedModel ? `${selectedModel.model} 출력 토큰` : '이번 달 출력 토큰'} value={formatNum(metrics.outputTokens)} />
            <Metric label={selectedModel ? `${selectedModel.model} 비용` : '이번 달 비용'} value={formatCurrency(metrics.cost)} />
            <Metric label="이번 달 요청 수" value={formatNum(metrics.requests)} />
          </>
        )}
      </div>

      {usage.errorMessage ? <div className="rounded-lg bg-white p-4 text-sm text-slate-600">{usage.errorMessage}</div> : null}

      {isCursor && usage.accounts?.length ? (
        <CursorAccounts
          accounts={usage.accounts}
          selectedIndex={selectedCursorAccountIndex}
          onSelect={(index) => {
            setSelectedCursorAccountIndex(index);
            setSelectedModelName(null); // 계정 변경 시 모델 선택 초기화
          }}
        />
      ) : null}

      {isFigma && usage.figma ? <FigmaFiles figma={usage.figma} /> : null}

      <ModelBreakdown
        models={selectedCursorAccount?.models ?? usage.models}
        serviceId={usage.service}
        error={usage.error}
        selectedModel={selectedModelName}
        onSelectModel={setSelectedModelName}
      />
      
      {usage.error === 'PLAN_REQUIRED' ? null : (
        <DailyChart
          service={selectedCursorAccount || selectedModel ? undefined : usage}
          account={selectedCursorAccount}
          model={selectedModel}
          serviceId={usage.service}
        />
      )}
    </div>
  );
}

function UsageRangeControls({
  range,
  onApply,
}: {
  range: UsageRange;
  onApply: (range: UsageRange) => void;
}) {
  const [draft, setDraft] = useState(range);
  const changed = draft.start !== range.start || draft.end !== range.end;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm text-slate-600">
          시작일
          <input
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950"
            value={draft.start}
            max={draft.end}
            onChange={(event) => setDraft({ ...draft, start: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm text-slate-600">
          종료일
          <input
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950"
            value={draft.end}
            min={draft.start}
            onChange={(event) => setDraft({ ...draft, end: event.target.value })}
          />
        </label>
        <button
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!changed}
          onClick={() => onApply(draft)}
        >
          확인
        </button>
        <button
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => setDraft(initialUsageRange())}
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
  const totalCost = accounts.reduce((sum, a) => sum + a.cost.thisMonth, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-semibold text-slate-900">Cursor 계정별 선택 기간 사용량</h2>
        <div className="text-sm font-medium text-slate-500">
          총 {accounts.length}개 계정
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account, index) => {
          const isSelected = selectedIndex === index;
          const share = totalCost > 0 ? (account.cost.thisMonth / totalCost) * 100 : 0;

          return (
            <div
              key={account.label}
              className={`group relative flex flex-col rounded-2xl border p-6 transition-all cursor-pointer hover:border-slate-300 hover:shadow-md ${
                isSelected ? 'border-amber-500 bg-amber-50/30 ring-1 ring-amber-500' : 'border-slate-200 bg-white'
              }`}
              onClick={() => onSelect(isSelected ? null : index)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-bold text-slate-900" title={account.label}>
                    {account.label}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-500">{formatNum(account.requests)} 요청</span>
                    <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded uppercase tracking-tighter">
                      {share.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-black text-slate-950">{formatCurrency(account.cost.thisMonth)}</div>
                  <div className="text-xs font-medium text-slate-400">선택 기간 비용</div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">오늘 비용</div>
                  <div className="mt-1 text-sm font-semibold text-slate-700">{formatCurrency(account.cost.today)}</div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">총 토큰</div>
                  <div className="mt-1 text-sm font-semibold text-slate-700">{formatNum(account.tokens.total)}</div>
                </div>
              </div>

              {/* Progress Bar for Share */}
              <div className="mt-auto pt-5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full transition-all duration-500 ${isSelected ? 'bg-amber-500' : 'bg-slate-300 group-hover:bg-slate-400'}`}
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

function FigmaFiles({ figma }: { figma: FigmaUsage }) {
  const today = dateInputValue(new Date());
  const createdToday = figma.projectsCreatedToday ?? figma.projects.filter((project) => project.createdAt?.startsWith(today)).length;
  const updatedToday = figma.filesUpdatedToday ?? figma.files.filter((file) => file.lastModified?.startsWith(today)).length;
  const recentlyUpdated = figma.files[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="총 프로젝트" value={formatNum(figma.projectCount)} />
        <Metric label="총 파일" value={formatNum(figma.fileCount)} />
        <Metric label="API 기준 오늘 생성 프로젝트" value={formatNum(createdToday)} />
        <Metric label="접근 가능한 파일 중 오늘 수정" value={formatNum(updatedToday)} />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Figma Files Dashboard</h2>
            <p className="mt-1 text-xs text-slate-500">최근 수정 파일: {recentlyUpdated?.name ?? '-'}</p>
          </div>
          <span className="text-xs font-medium text-slate-500">수정일 최신순</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">파일</th>
                <th className="px-4 py-3">프로젝트</th>
                <th className="px-4 py-3">마지막 수정일</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {figma.files.length ? (
                figma.files.map((file) => <FigmaFileRow key={file.key} file={file} today={today} />)
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={4}>
                    표시할 파일 데이터가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FigmaFileRow({ file, today }: { file: FigmaFile; today: string }) {
  const isUpdatedToday = file.lastModified?.startsWith(today);

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {file.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.thumbnailUrl} alt="" className="h-9 w-12 rounded border border-slate-200 object-cover" />
          ) : (
            <div className="flex h-9 w-12 items-center justify-center rounded border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-400">
              FG
            </div>
          )}
          <div>
            <div className="font-medium text-slate-900">{file.name}</div>
            <div className="text-xs text-slate-400">{file.key}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-700">
        <div>{file.projectName}</div>
        {file.branchName ? <div className="text-xs text-slate-400">{file.branchName}</div> : null}
      </td>
      <td className="px-4 py-3 text-slate-700">{formatIsoDate(file.lastModified)}</td>
      <td className="px-4 py-3">
        {isUpdatedToday ? <StatusBadge tone="blue">오늘 수정</StatusBadge> : <StatusBadge tone="slate">변동 없음</StatusBadge>}
      </td>
    </tr>
  );
}

function StatusBadge({ children, tone }: { children: string; tone: 'green' | 'blue' | 'slate' }) {
  const className = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    blue: 'bg-sky-50 text-sky-700 ring-sky-600/15',
    slate: 'bg-slate-100 text-slate-600 ring-slate-600/10',
  }[tone];

  return <span className={`rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${className}`}>{children}</span>;
}

function formatIsoDate(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
      <div className="text-sm font-medium text-slate-500 group-hover:text-slate-600">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div>
    </div>
  );
}
