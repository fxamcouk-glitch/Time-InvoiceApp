# Hours & Invoicing

A simple hours tracker and invoice generator. Track time against clients, then turn unbilled hours into a professional PDF invoice with a couple of clicks. All data is stored locally in your browser (`localStorage`) — no account or backend required.

## Features

- **Clients** — keep a list of clients with contact info and a default hourly rate.
- **Time Tracker** — log hours against a client with a date, description, hours, and rate; filter entries by client and see your unbilled total.
- **Invoices** — select unbilled entries for a client, set a tax rate/due date/notes, and generate an invoice. Download it as a PDF, track its status (draft/sent/paid), or delete it (its entries become unbilled again).
- **Business settings** — set the "from" details shown on invoices.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in your browser.

## Build

```bash
npm run build
```

## Tech

React + TypeScript + Vite, Tailwind CSS for styling, and jsPDF for invoice PDF generation.
