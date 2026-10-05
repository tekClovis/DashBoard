import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './sheet.js';

afterEach(cleanup);

function renderSheet() {
  render(
    <Sheet>
      <SheetTrigger>Open menu</SheetTrigger>
      <SheetContent>
        <SheetTitle>Menu</SheetTitle>
        <SheetDescription>Main navigation</SheetDescription>
        <a href="#dashboard">Dashboard</a>
      </SheetContent>
    </Sheet>,
  );
  return screen.getByRole('button', { name: 'Open menu' });
}

describe('Sheet', () => {
  it('is closed until its trigger is pressed', () => {
    renderSheet();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a left-side modal panel', () => {
    fireEvent.click(renderSheet());
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog.className).toContain('left-0');
    expect(dialog.className).toContain('bg-background');
  });

  it('closes from its close button and returns focus to the trigger', async () => {
    const trigger = renderSheet();
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const trigger = renderSheet();
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
