# TAQ-08 — Tests must assert on behavior — not toBeDefined/toBeTruthy tautologies

**Result:** ✗ FAIL
**Rule:** no-tautological-tests
**Duration:** 28.9s
**Model:** sonnet
**Source:** latest run

## Task

Write tests for the BookCard component. It renders a book's title and author.

## Output

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { BookCard } from './BookCard';
import type { Book } from '../../types';

const baseBook: Book = {
  id: 'book-1',
  title: 'Dune',
  author: 'Frank Herbert',
  status: 'available',
};

describe('BookCard', () => {
  it('renders title', () => {
    render(<BookCard book={baseBook} onClick={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Dune' })).toBeInTheDocument();
  });

  it('renders author', () => {
    render(<BookCard book={baseBook} onClick={vi.fn()} />);
    expect(screen.getByText('Frank Herbert')).toBeInTheDocument();
  });

  it('renders status badge with correct text', () => {
    render(<BookCard book={baseBook} onClick={vi.fn()} />);
    expect(screen.getByText('available')).toBeInTheDocument();
  });

  it('sets data-status attribute on badge matching book status', () => {
    render(<BookCard book={{ ...baseBook, status: 'checked-out' }} onClick={vi.fn()} />);
    const badge = screen.getByText('checked-out');
    expect(badge).toHaveAttribute('data-status', 'checked-out');
  });

  it('calls onClick with book id when clicked', async () => {
    const handleClick = vi.fn();
    render(<BookCard book={baseBook} onClick={handleClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith('book-1');
  });

  it('calls onClick with book id when Enter key is pressed', async () => {
    const handleClick = vi.fn();
    render(<BookCard book={baseBook} onClick={handleClick} />);
    screen.getByRole('button').focus();
    await userEvent.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledWith('book-1');
  });

  it('does not call onClick on non-Enter keydown', async () => {
    const handleClick = vi.fn();
    render(<BookCard book={baseBook} onClick={handleClick} />);
    screen.getByRole('button').focus();
    await userEvent.keyboard(' ');
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('aria-label includes title and author', () => {
    render(<BookCard book={baseBook} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Dune by Frank Herbert',
    );
  });

  it('is keyboard focusable (tabIndex 0)', () => {
    render(<BookCard book={baseBook} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0');
  });
});

```

## Checks

| Metric | Check | Result |
|---|---|---|
| constraint_adherence | Should not have standalone toBeDefined/toBeTruthy tautologies without query context | ✗ FAIL — Found at offset 531: toBeInTheDocument() |
| task_accuracy | Should test actual rendered content, not existence checks | ✓ PASS |
