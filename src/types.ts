export interface Client {
  id: string;
  name: string;
  email: string;
  address: string;
  hourlyRate: number;
  lat?: number;
  lng?: number;
  /** Hex colour used on the calendar; assigned to be distinct from other clients. */
  color?: string;
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
  /** True when a receipt photo is stored for this entry (see src/lib/photos.ts). */
  hasPhoto?: boolean;
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
  /** ISO yyyy-mm-dd; set when marked paid. */
  paidDate?: string;
}

export interface BusinessInfo {
  name: string;
  email: string;
  address: string;
  /** How clients should pay (sort code, account number, etc.); printed on invoices. */
  paymentDetails?: string;
}
