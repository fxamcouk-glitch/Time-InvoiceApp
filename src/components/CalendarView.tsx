import { useMemo, useState } from 'react';
import { colorForClient } from '../lib/colors';
import { formatCurrency, formatDate, formatMonthLabel, today } from '../lib/format';
import type { Client, TimeEntry } from '../types';
import { Button } from './ui';

interface Props {
  entries: TimeEntry[];
  clients: Client[];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function isoOf(year: number, month0: number, day: number): string {
  const date = new Date(year, month0, day);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthCursorOf(iso: string): string {
  return iso.slice(0, 7);
}

function shiftMonth(cursor: string, delta: number): string {
  const [year, month] = cursor.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function gridDays(cursor: string): string[] {
  const [year, month] = cursor.split('-').map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const leadingBlanks = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(isoOf(year, month - 1, 1 - leadingBlanks + i));
  }
  return days;
}

export function CalendarView({ entries, clients }: Props) {
  const [cursor, setCursor] = useState(() => monthCursorOf(today()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.date) ?? [];
      list.push(entry);
      map.set(entry.date, list);
    }
    return map;
  }, [entries]);

  const clientsInMonth = useMemo(() => {
    const ids = new Set<string>();
    for (const [date, list] of entriesByDate) {
      if (monthCursorOf(date) === cursor) list.forEach((e) => ids.add(e.clientId));
    }
    return [...ids].map((id) => clientMap.get(id)).filter((c): c is Client => !!c);
  }, [entriesByDate, cursor, clientMap]);

  const days = useMemo(() => gridDays(cursor), [cursor]);
  const todayIso = today();
  const selectedEntries = selectedDate ? (entriesByDate.get(selectedDate) ?? []) : [];

  return (
    <div>
      <div className="flex items-center justify-between px-5 py-3">
        <Button variant="ghost" onClick={() => setCursor((c) => shiftMonth(c, -1))} aria-label="Previous month">
          ‹
        </Button>
        <h3 className="text-sm font-semibold text-slate-800">{formatMonthLabel(cursor)}</h3>
        <Button variant="ghost" onClick={() => setCursor((c) => shiftMonth(c, 1))} aria-label="Next month">
          ›
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 px-3 text-center text-xs font-medium text-slate-400">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 p-3">
        {days.map((date) => {
          const inMonth = monthCursorOf(date) === cursor;
          const dayEntries = entriesByDate.get(date) ?? [];
          const dayClientIds = [...new Set(dayEntries.map((e) => e.clientId))];
          const dayHours = dayEntries.reduce((sum, e) => sum + e.hours, 0);
          const isToday = date === todayIso;
          const isSelected = date === selectedDate;

          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelectedDate(dayEntries.length > 0 ? date : null)}
              className={`flex aspect-square flex-col items-start gap-1 rounded-md p-1 text-left transition-colors ${
                isSelected ? 'bg-indigo-50 ring-2 ring-indigo-500' : 'hover:bg-slate-50'
              }`}
            >
              <span className={`text-xs ${inMonth ? 'text-slate-700' : 'text-slate-300'} ${isToday ? 'font-bold text-indigo-600' : ''}`}>
                {Number(date.slice(8, 10))}
              </span>
              {dayEntries.length > 0 && <span className="text-[10px] leading-none text-slate-400">{dayHours}h</span>}
              {dayClientIds.length > 0 && (
                <div className="mt-auto flex h-1.5 w-full overflow-hidden rounded-full">
                  {dayClientIds.map((id) => (
                    <span key={id} style={{ background: colorForClient(id), flex: 1 }} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {clientsInMonth.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          {clientsInMonth.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: colorForClient(c.id) }} />
              {c.name}
            </span>
          ))}
        </div>
      )}

      {selectedDate && (
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">{formatDate(selectedDate)}</h4>
            <span className="text-sm text-slate-500">
              {selectedEntries.reduce((sum, e) => sum + e.hours, 0).toFixed(2)}h ·{' '}
              {formatCurrency(selectedEntries.reduce((sum, e) => sum + e.hours * e.rate, 0))}
            </span>
          </div>
          <ul className="space-y-2">
            {selectedEntries.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorForClient(e.clientId) }} />
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {clientMap.get(e.clientId)?.name ?? 'Unknown client'}
                  {e.description && ` · ${e.description}`}
                </span>
                <span className="shrink-0 text-slate-500">{e.hours}h</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
