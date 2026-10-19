import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('renders the shelf page with a filter chip bar', () => {
    render(<App />);
    expect(screen.getByRole('group', { name: 'Filter by status' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'All' })).not.toBeNull();
  });

  it('marks the "All" chip pressed on load', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Reading' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});
