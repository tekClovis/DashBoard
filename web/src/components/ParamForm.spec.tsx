import type { ParamSpec } from '@dashboard/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { initialValues, ParamForm, toParams, validateParam, validateParams } from './ParamForm.js';

// One fake widget definition exercising enum, integer and pattern params.
const specs: ParamSpec[] = [
  { name: 'unit', type: 'string', enum: ['metric', 'imperial'], required: true, default: 'metric' },
  { name: 'days', type: 'integer', min: 1, max: 7, required: true },
  { name: 'repo', type: 'string', pattern: '^[\\w.-]+/[\\w.-]+$', required: true },
];

function Harness({ showErrors = false, list = specs }: { showErrors?: boolean; list?: ParamSpec[] }) {
  const [values, setValues] = useState(initialValues(list));
  return <ParamForm specs={list} values={values} onChange={setValues} showErrors={showErrors} />;
}

afterEach(cleanup);

describe('search params', () => {
  const city: ParamSpec = { name: 'city', type: 'string', required: true, label: 'City', search: 'weather.city' };

  it('asks for a pick, not free text, when a required search param is empty', () => {
    expect(validateParam(city, '')).toBe('Pick a city from the results.');
    expect(validateParam(city, 'Paris')).toBeNull();
  });

  it('renders no field for hidden companion params', () => {
    const list: ParamSpec[] = [
      { name: 'latitude', type: 'string', hidden: true },
      { name: 'note', type: 'string', label: 'Note' },
    ];
    render(<Harness list={list} />);

    expect(screen.queryByLabelText(/latitude/)).toBeNull();
    expect(screen.getByLabelText('Note (optional)')).toBeTruthy();
  });
});

describe('ParamForm', () => {
  it('renders enum as select, integer as bounded number input with a range hint, pattern as text', () => {
    render(<Harness />);

    const unit = screen.getByLabelText('unit') as HTMLSelectElement;
    expect(unit.tagName).toBe('SELECT');
    expect(unit.value).toBe('metric');

    const days = screen.getByLabelText('days') as HTMLInputElement;
    expect(days.type).toBe('number');
    expect(days.min).toBe('1');
    expect(days.max).toBe('7');
    expect(days.getAttribute('aria-describedby')).toBe('param-days-hint');
    expect(document.getElementById('param-days-hint')?.textContent).toBe('1 to 7');
  });

  it('marks optional params in the label', () => {
    render(<Harness list={[{ name: 'note', type: 'string', label: 'Note' }]} />);
    expect(screen.getByLabelText('Note (optional)')).toBeTruthy();
  });

  it('shows an error only once a field is left, then updates it live', () => {
    render(<Harness />);
    const days = screen.getByLabelText('days');

    fireEvent.change(days, { target: { value: '9' } });
    expect(screen.queryByText('Enter a number from 1 to 7.')).toBeNull();
    fireEvent.blur(days);
    expect(screen.getByText('Enter a number from 1 to 7.')).toBeTruthy();
    expect(days.getAttribute('aria-invalid')).toBe('true');
    expect(days.getAttribute('aria-describedby')).toBe('param-days-hint param-days-err');

    fireEvent.change(days, { target: { value: '3' } });
    expect(screen.queryByText('Enter a number from 1 to 7.')).toBeNull();
    expect(days.getAttribute('aria-invalid')).toBeNull();
  });

  it('shows every error when asked, including empty required fields', () => {
    render(<Harness showErrors />);
    expect(screen.getAllByText('Required.')).toHaveLength(2);
  });

  it('uses the mock copy for each failure', () => {
    const repo = specs[2]!;
    expect(validateParam(repo, 'acme telemetry')).toBe('Use owner/name, with no spaces.');
    expect(validateParam({ name: 'region', type: 'string', pattern: '^[A-Z]{2}$' }, 'fr')).toBe(
      'This value isn’t in the expected format.',
    );
    expect(validateParam({ name: 'app_id', type: 'integer', min: 1 }, '0')).toBe('Enter 1 or more.');
    expect(validateParam(specs[1]!, '2.5')).toBe('Enter a whole number.');
  });

  it('validates and converts to typed params', () => {
    const values = { unit: 'metric', days: '3', repo: 'a/b' };
    expect(validateParams(specs, values)).toBe(true);
    expect(toParams(specs, values)).toEqual({ unit: 'metric', days: 3, repo: 'a/b' });
    expect(validateParams(specs, { ...values, days: '' })).toBe(false);
  });
});
