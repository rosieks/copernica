// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AlertDialog, Callout, Dialog, Field, IconButton, toastDuration, TooltipProvider } from './index';

afterEach(cleanup);

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Example">
        <input aria-label="Inside" />
      </Dialog>
    </>
  );
}

function AlertHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Delete
      </button>
      <AlertDialog open={open} onOpenChange={setOpen} title="Delete it?" confirmLabel="Delete" onConfirm={() => {}} />
    </>
  );
}

function withTooltips(ui: React.ReactNode) {
  return <TooltipProvider>{ui}</TooltipProvider>;
}

describe('ui wrappers', () => {
  it('Dialog returns focus to its trigger on Escape', async () => {
    render(withTooltips(<DialogHarness />));
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Example' });
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape', code: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('AlertDialog focuses the safe choice first', async () => {
    render(withTooltips(<AlertHarness />));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await screen.findByRole('alertdialog', { name: 'Delete it?' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('IconButton uses its label as accessible name', () => {
    render(withTooltips(<IconButton label="Open navigation" icon={<svg />} />));
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeTruthy();
  });

  it('Field wires the error to aria-describedby and aria-invalid', () => {
    render(<Field label="Change description" hint="Shown in history" error="Describe your change." />);
    const input = screen.getByLabelText('Change description');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent);
    expect(described.join(' ')).toContain('Describe your change.');
    expect(described.join(' ')).toContain('Shown in history');
  });

  it('danger Callout is an alert, others a status', () => {
    render(
      <>
        <Callout tone="danger" title="Rejected" />
        <Callout tone="warning" title="Outdated" />
      </>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Rejected');
    expect(screen.getByRole('status').textContent).toContain('Outdated');
  });

  it('toasts stay at least 5 seconds', () => {
    expect(toastDuration({ tone: 'success', duration: 1000 })).toBe(5000);
    expect(toastDuration({ tone: 'success' })).toBe(6000);
    expect(toastDuration({ tone: 'info' })).toBe(8000);
  });
});
