import { useState } from 'react';
import type { BusinessInfo } from '../types';
import { Sheet } from './Sheet';
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
    <Sheet title="Business details" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-500">Shown as the "From" section on your invoices.</p>
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
        <Field label="Payment details">
          <Textarea
            rows={3}
            value={form.paymentDetails ?? ''}
            onChange={(e) => setForm({ ...form, paymentDetails: e.target.value })}
            placeholder={'Bank transfer to J Smith\nSort code 04-00-04\nAccount 12345678'}
          />
          <span className="text-xs font-normal text-slate-500">Printed on unpaid invoices under "Payment", with the invoice number as the reference.</span>
        </Field>
        <Button type="submit" className="mt-1 w-full">
          Save
        </Button>
      </form>
    </Sheet>
  );
}
