import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Card, CardContent, CardHeader, CardTitle } from './card.js';

afterEach(cleanup);

describe('Card', () => {
  it('renders a bordered panel with a header strip and body', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>ada@example.com</CardContent>
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card.className).toContain('bg-card');
    expect(card.className).toContain('rounded-lg');
    expect(screen.getByRole('heading', { name: 'Account' }).tagName).toBe('H2');
    expect(screen.getByText('Account').parentElement?.className).toContain('border-b');
    expect(screen.getByText('ada@example.com').className).toContain('p-4');
  });
});
