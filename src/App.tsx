import { useState } from 'react';
import { BusinessSettings } from './components/BusinessSettings';
import { ClientsView } from './components/ClientsView';
import { InvoicesView } from './components/InvoicesView';
import { TimeTracker } from './components/TimeTracker';
import { Button } from './components/ui';
import { useLocalStorage } from './lib/storage';
import type { BusinessInfo, Client, Invoice, TimeEntry } from './types';

type Tab = 'tracker' | 'clients' | 'invoices';

const TABS: { id: Tab; label: string }[] = [
  { id: 'tracker', label: 'Time Tracker' },
  { id: 'clients', label: 'Clients' },
  { id: 'invoices', label: 'Invoices' },
];

const defaultBusiness: BusinessInfo = { name: 'Your Business', email: '', address: '' };

function App() {
  const [tab, setTab] = useState<Tab>('tracker');
  const [clients, setClients] = useLocalStorage<Client[]>('hti.clients', []);
  const [entries, setEntries] = useLocalStorage<TimeEntry[]>('hti.entries', []);
  const [invoices, setInvoices] = useLocalStorage<Invoice[]>('hti.invoices', []);
  const [business, setBusiness] = useLocalStorage<BusinessInfo>('hti.business', defaultBusiness);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Hours &amp; Invoicing</h1>
            <p className="text-xs text-slate-400">Track time, bill clients, get paid.</p>
          </div>
          <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
            Business settings
          </Button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {tab === 'tracker' && <TimeTracker clients={clients} entries={entries} onChange={setEntries} />}
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

      {settingsOpen && (
        <BusinessSettings business={business} onChange={setBusiness} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

export default App;
