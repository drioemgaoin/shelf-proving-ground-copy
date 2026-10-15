import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Book } from './api';

// The empty-filter state ("No books match this filter.") is unreachable through
// the browser with any shipped fixture — every fixture represents all three
// statuses, and no mutation UI exists yet to remove one. This component test
// mocks the API to a single-status list so the branch can be exercised
// deterministically. Behavioral chip tests live in e2e/acceptance/shelf-grid.spec.ts.
const readingOnly: Book[] = [
  { id: 'a', title: 'Book A', author: 'Author A', status: 'reading' },
  { id: 'b', title: 'Book B', author: 'Author B', status: 'reading' },
];

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getBooks: () => Promise.resolve(readingOnly),
  };
});

const { App } = await import('./App');

afterEach(() => {
  vi.clearAllMocks();
});

describe('Shelf grid: empty filtered state', () => {
  it('shows a muted message when books exist but none match the filter', async () => {
    render(<App />);

    // Both reading books render under the default "All" filter.
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));

    // Filtering to a status with no matching books shows the empty message.
    fireEvent.click(screen.getByRole('button', { name: 'Finished' }));

    expect(screen.getByText('No books match this filter.')).not.toBeNull();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
