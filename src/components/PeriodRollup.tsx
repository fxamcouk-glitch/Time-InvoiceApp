import { useMemo } from 'react';
import { formatCurrency, formatDate, formatMonthLabel, formatWeekLabel, monthKey, weekKey } from '../lib/format';
import type { Client, TimeEntry } from '../types';
import { EmptyState } from './ui';

export type Granularity = 'day' | 'week' | 'month';

interface Props {
  entries: TimeEntry[];
  clients: Client[];
  granularity: Granularity;
}

function periodKeyFor(date: string, granularity: Granularity): string {
  if (granularity === 'day') return date;
  if (granularity === 'week') return weekKey(date);
  return monthKey(date);
}

function periodLabelFor(key: string, granularity: Granularity): string {
  if (granularity === 'day') return formatDate(key);
  if (granularity === 'week') return formatWeekLabel(key);
  return formatMonthLabel(key);
}

export function PeriodRollup({ entries, clients, granularity }: Props) {
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const { periods, grandTotalAmount, grandTotalHours } = useMemo(() => {
    const byPeriod = new Map<
      string,
      { amount: number; hours: number; byClient: Map<string, { amount: number; hours: number }> }
    >();

    for (const entry of entries) {
      const key = periodKeyFor(entry.date, granularity);
      const amount = entry.hours * entry.rate;
      let period = byPeriod.get(key);
      if (!period) {
        period = { amount: 0, hours: 0, byClient: new Map() };
        byPeriod.set(key, period);
      }
      period.amount += amount;
      period.hours += entry.hours;

      const clientTotals = period.byClient.get(entry.clientId) ?? { amount: 0, hours: 0 };
      clientTotals.amount += amount;
      clientTotals.hours += entry.hours;
      period.byClient.set(entry.clientId, clientTotals);
    }

    const periods = [...byPeriod.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, totals]) => ({
        key,
        label: periodLabelFor(key, granularity),
        amount: totals.amount,
        hours: totals.hours,
        clients: [...totals.byClient.entries()]
          .map(([clientId, t]) => ({ clientId, name: clientMap.get(clientId)?.name ?? 'Unknown client', ...t }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }));

    const grandTotalAmount = entries.reduce((sum, e) => sum + e.hours * e.rate, 0);
    const grandTotalHours = entries.reduce((sum, e) => sum + e.hours, 0);

    return { periods, grandTotalAmount, grandTotalHours };
  }, [entries, granularity, clientMap]);

  if (periods.length === 0) {
    return <EmptyState title="No time entries" description="Log your first entry to see totals here." />;
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
        <span className="text-sm font-semibold text-slate-700">Total</span>
        <span className="text-sm font-semibold text-slate-800">
          {formatCurrency(grandTotalAmount)} · {grandTotalHours.toFixed(2)}h
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {periods.map((period) => (
          <details key={period.key} open className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-emerald-50 px-5 py-2.5 text-sm marker:content-none">
              <span className="font-medium text-emerald-900">{period.label}</span>
              <span className="text-emerald-800">
                {formatCurrency(period.amount)} · {period.hours.toFixed(2)}h
              </span>
            </summary>
            <ul className="divide-y divide-slate-100">
              {period.clients.map((c) => (
                <li key={c.clientId} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
                  <span className="truncate text-slate-700">{c.name}</span>
                  <span className="shrink-0 text-slate-500">
                    {formatCurrency(c.amount)} · {c.hours.toFixed(2)}h
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}
