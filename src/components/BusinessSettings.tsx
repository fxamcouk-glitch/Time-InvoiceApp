import { useState } from 'react';
import type { BusinessInfo } from '../types';
import { Button, Field, Input, Textarea } from './ui';

interface Props {
  business: BusinessInfo;
  onChange: (business: BusinessInfo) => void;
  onClose: () => void;
}

export function BusinessSettings({ business, onChange, onClose }: Props) {
  const [form, setForm] = useState(business);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onChange(form);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Your business details</h2>
        <p className="mb-4 text-xs text-slate-400">Shown as the "From" section on generated invoices.</p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Business / your name">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Address">
            <Textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
