import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Alert, AlertContent, AlertDescription, AlertTitle } from './alert.js';

afterEach(cleanup);

describe('Alert', () => {
  it('renders the default tone as a status with title and description', () => {
    render(
      <Alert>
        <AlertContent>
          <AlertTitle>Check your inbox</AlertTitle>
          <AlertDescription>Nothing yet? Check spam.</AlertDescription>
        </AlertContent>
      </Alert>,
    );
    const alert = screen.getByRole('status');
    expect(alert.dataset.tone).toBe('default');
    expect(screen.getByText('Check your inbox').parentElement?.className).toContain('flex-1');
    expect(screen.getByText('Nothing yet? Check spam.').className).toContain('text-muted-foreground');
  });

  it.each([
    ['warning', 'bg-warning/8'],
    ['destructive', 'bg-destructive/7'],
  ] as const)('tints the %s tone at 10%% or less', (tone, bg) => {
    render(<Alert tone={tone}>x</Alert>);
    const alert = screen.getByText('x');
    expect(alert.dataset.tone).toBe(tone);
    expect(alert.className).toContain(bg);
    expect(alert.className).toContain(`[&>svg]:text-${tone}`);
  });

  it('announces the destructive tone assertively', () => {
    render(<Alert tone="destructive">Couldn’t load users</Alert>);
    expect(screen.getByRole('alert').textContent).toBe('Couldn’t load users');
  });

  it('colours only the icon for the success tone', () => {
    render(<Alert tone="success">Email confirmed</Alert>);
    const alert = screen.getByRole('status');
    expect(alert.className).toContain('[&>svg]:text-success');
    expect(alert.className).not.toContain('bg-success');
  });
});
