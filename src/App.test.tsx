import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('renders the shelf main landmark', async () => {
    render(<App />);
    expect(await screen.findByRole('main')).not.toBeNull();
  });
});
