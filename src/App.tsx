import { useCallback, useState } from 'react';
import { BusinessSettings } from './components/BusinessSettings';
import { CalendarPage } from './components/CalendarPage';
import { ClientsView } from './components/ClientsView';
import { CalendarIcon, ClockIcon, ReceiptIcon, UsersIcon } from './components/icons';
import { InvoicesView } from './components/InvoicesView';
import { TimeTracker } from './components/TimeTracker';
import { Button } from './components/ui';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useLocalStorage } from './lib/storage';
import type { BusinessInfo, Client, Invoice, TimeEntry } from './types';

type Tab = 'tracker' | 'calendar' | 'clients' | 'invoices';

const TABS: { id: Tab; label: string; icon: (props: { className?: string }) => React.ReactElement }[] = [
  { id: 'tracker', label: 'Time', icon: ClockIcon },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'clients', label: 'Clients', icon: UsersIcon },
  { id: 'invoices', label: 'Invoices', icon: ReceiptIcon },
];

const defaultBusiness: BusinessInfo = { name: 'Your Business', email: '', address: '' };

function App() {
  const [tab, setTab] = useState<Tab>('tracker');
  const [clients, setClients] = useLocalStorage<Client[]>('hti.clients', []);
  const [entries, setEntries] = useLocalStorage<TimeEntry[]>('hti.entries', []);
  const [invoices, setInvoices] = useLocalStorage<Invoice[]>('hti.invoices', []);
  const [business, setBusiness] = useLocalStorage<BusinessInfo>('hti.business', defaultBusiness);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleRefresh = useCallback(() => window.location.reload(), []);
  const { pullDistance, refreshing, threshold } = usePullToRefresh(handleRefresh);
  const indicatorSize = refreshing ? threshold : pullDistance;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center overflow-hidden"
        style={{ height: indicatorSize, transition: indicatorSize === 0 ? 'height 0.2s ease-out' : 'none' }}
      >
        <div className="flex items-end pb-2" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div
            className={`h-5 w-5 rounded-full border-2 border-indigo-200 border-t-indigo-600 ${
              refreshing || pullDistance >= threshold ? 'animate-spin' : ''
            }`}
            style={{ opacity: Math.min(indicatorSize / threshold, 1) }}
          />
        </div>
      </div>

      <div
        className="min-h-screen"
        style={{
          transform: `translateY(${indicatorSize}px)`,
          transition: indicatorSize === 0 ? 'transform 0.2s ease-out' : 'none',
        }}
      >
        <header
          className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
            <div>
              <h1 className="text-base font-semibold text-slate-900 sm:text-lg">Hours &amp; Invoicing</h1>
              <p className="hidden text-xs text-slate-400 sm:block">Track time, bill clients, get paid.</p>
            </div>
            <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
              <span className="sm:hidden">Settings</span>
              <span className="hidden sm:inline">Business settings</span>
            </Button>
          </div>
          <nav className="mx-auto hidden max-w-6xl gap-1 px-6 sm:flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label === 'Time' ? 'Time Tracker' : t.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">
          {tab === 'tracker' && (
            <TimeTracker clients={clients} entries={entries} onChange={setEntries} onClientsChange={setClients} />
          )}
          {tab === 'calendar' && <CalendarPage clients={clients} entries={entries} />}
          {tab === 'clients' && <ClientsView clients={clients} onChange={setClients} />}
          {tab === 'invoices' && (
            <InvoicesView
              clients={clients}
              entries={entries}
              invoices={invoices}
              business={business}
              onEntriesChange={setEntries}
              onInvoicesChange={setInvoices}
            />
          )}
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white/95 backdrop-blur sm:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                  active ? 'text-indigo-600' : 'text-slate-400'
                }`}
              >
                <Icon className="h-6 w-6" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {settingsOpen && (
          <BusinessSettings business={business} onChange={setBusiness} onClose={() => setSettingsOpen(false)} />
        )}
      </div>
    </>
  );
}

export default App;
