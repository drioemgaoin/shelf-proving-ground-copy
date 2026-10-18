import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('renders the filter chip group with an "All" default', async () => {
    render(<App />);
    const group = screen.getByRole('group', { name: 'Filter by status' });
    expect(group).not.toBeNull();
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    // Let the initial data load settle so no state update escapes the test.
    await screen.findByText('The Left Hand of Darkness');
  });

  it('renders a list region for the shelf grid', async () => {
    render(<App />);
    expect(screen.getByRole('list')).not.toBeNull();
    await screen.findByText('The Left Hand of Darkness');
  });
});
