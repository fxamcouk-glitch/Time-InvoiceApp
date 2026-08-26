export interface Client {
  id: string;
  name: string;
  email: string;
  address: string;
  hourlyRate: number;
  lat?: number;
  lng?: number;
}

export interface EntryLocation {
  lat: number;
  lng: number;
  address: string;
}

export interface TimeEntry {
  id: string;
  clientId: string;
  date: string; // YYYY-MM-DD
  description: string;
  hours: number;
  rate: number;
  invoiceId: string | null;
  location?: EntryLocation;
}

export interface MaterialEntry {
  id: string;
  clientId: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  invoiceId: string | null;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  entryIds: string[];
  materialIds: string[];
  taxRate: number; // percent, e.g. 8.5
  notes: string;
  status: InvoiceStatus;
}

export interface BusinessInfo {
  name: string;
  email: string;
  address: string;
}
