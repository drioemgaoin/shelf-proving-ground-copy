import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('renders the filter chip group', () => {
    render(<App />);
    expect(screen.getByRole('group', { name: 'Filter by status' })).toBeTruthy();
  });
});
