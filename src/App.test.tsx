import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('renders the shelf with its filter chips', async () => {
    render(<App />);
    expect(
      await screen.findByRole('group', { name: 'Filter by status' }),
    ).toBeInTheDocument();
  });
});
