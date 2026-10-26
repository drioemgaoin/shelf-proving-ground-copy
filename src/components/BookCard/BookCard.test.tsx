import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookCard } from './BookCard';
import type { Book } from '../../api';

const base: Book = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'The Left Hand of Darkness',
  author: 'Ursula K. Le Guin',
  status: 'reading',
};

describe('BookCard', () => {
  it('renders the book title', () => {
    render(<BookCard book={base} />);
    expect(screen.getByText('The Left Hand of Darkness')).toBeInTheDocument();
  });

  it('renders the book author when present', () => {
    render(<BookCard book={base} />);
    expect(screen.getByText('Ursula K. Le Guin')).toBeInTheDocument();
  });

  it('does not render an author element when author is absent', () => {
    const noAuthor: Book = { ...base, author: undefined };
    render(<BookCard book={noAuthor} />);
    expect(screen.queryByText('Ursula K. Le Guin')).not.toBeInTheDocument();
    // The title should still render
    expect(screen.getByText('The Left Hand of Darkness')).toBeInTheDocument();
  });

  it('renders "To Read" label for to-read status', () => {
    render(<BookCard book={{ ...base, status: 'to-read' }} />);
    expect(screen.getByText('To Read')).toBeInTheDocument();
  });

  it('renders "Reading" label for reading status', () => {
    render(<BookCard book={{ ...base, status: 'reading' }} />);
    expect(screen.getByText('Reading')).toBeInTheDocument();
  });

  it('renders "Finished" label for finished status', () => {
    render(<BookCard book={{ ...base, status: 'finished' }} />);
    expect(screen.getByText('Finished')).toBeInTheDocument();
  });
});
