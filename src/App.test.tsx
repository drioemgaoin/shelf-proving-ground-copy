import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('renders the shelf page landmark', async () => {
    render(<App />);
    expect(await screen.findByRole('main')).toBeInTheDocument();
  });
});
