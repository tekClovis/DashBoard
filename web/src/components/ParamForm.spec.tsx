import type { ParamSpec } from '@dashboard/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { initialValues, ParamForm, toParams, validateParams } from './ParamForm.js';

// One fake widget definition exercising enum, integer and pattern params.
const specs: ParamSpec[] = [
  { name: 'unit', type: 'string', enum: ['metric', 'imperial'], required: true, default: 'metric' },
  { name: 'days', type: 'integer', min: 1, max: 7, required: true },
  { name: 'repo', type: 'string', pattern: '^[\\w.-]+/[\\w.-]+$', required: true },
];

function Harness() {
  const [values, setValues] = useState(initialValues(specs));
  return <ParamForm specs={specs} values={values} onChange={setValues} />;
}

afterEach(cleanup);

describe('ParamForm', () => {
  it('renders enum as select, integer as bounded number input, pattern as text', () => {
    render(<Harness />);

    const unit = screen.getByLabelText('unit') as HTMLSelectElement;
    expect(unit.tagName).toBe('SELECT');
    expect(unit.value).toBe('metric');

    const days = screen.getByLabelText('days') as HTMLInputElement;
    expect(days.type).toBe('number');
    expect(days.min).toBe('1');
    expect(days.max).toBe('7');
  });

  it('shows inline validation for an out-of-range integer and a non-matching pattern', () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('days'), { target: { value: '9' } });
    expect(screen.getByText('Must be at most 7')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('repo'), { target: { value: 'nope' } });
    expect(screen.getByLabelText('repo').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/Must match/)).toBeTruthy();
  });

  it('validates and converts to typed params', () => {
    const values = { unit: 'metric', days: '3', repo: 'a/b' };
    expect(validateParams(specs, values)).toBe(true);
    expect(toParams(specs, values)).toEqual({ unit: 'metric', days: 3, repo: 'a/b' });
    expect(validateParams(specs, { ...values, days: '' })).toBe(false);
  });
});
