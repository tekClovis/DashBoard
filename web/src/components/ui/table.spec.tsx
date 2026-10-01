import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './table.js';

afterEach(cleanup);

describe('Table', () => {
  it('renders a semantic table with caption, column headers and cells', () => {
    render(
      <Table>
        <TableCaption>Users</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Email</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>ada@example.com</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const table = screen.getByRole('table', { name: 'Users' });
    expect(table.parentElement?.className).toContain('overflow-x-auto');
    expect(screen.getByRole('columnheader', { name: 'Email' }).className).toContain('h-9');
    expect(screen.getByRole('cell', { name: 'ada@example.com' }).className).toContain('h-11');
  });
});
