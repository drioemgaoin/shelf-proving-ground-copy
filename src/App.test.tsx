import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('renders the main shelf region', () => {
    render(<App />);
    expect(screen.getByRole('main').tagName).toBe('MAIN');
  });
});
