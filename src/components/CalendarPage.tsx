import { useState } from 'react';
import type { Client, TimeEntry } from '../types';
import { CalendarView } from './CalendarView';
import { Card, EmptyState, Select } from './ui';

interface Props {
  clients: Client[];
  entries: TimeEntry[];
}

export function CalendarPage({ clients, entries }: Props) {
  const [filterClientId, setFilterClientId] = useState('all');

  if (clients.length === 0) {
    return <EmptyState title="Add a client first" description="You need at least one client before you have anything to see on the calendar." />;
  }

  const visibleEntries = entries.filter((e) => filterClientId === 'all' || e.clientId === filterClientId);

  return (
    <Card>
      <div className="border-b border-slate-100 px-5 py-3">
        <Select value={filterClientId} onChange={(e) => setFilterClientId(e.target.value)} className="w-40 sm:w-48">
          <option value="all">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <CalendarView entries={visibleEntries} clients={clients} />
    </Card>
  );
}
