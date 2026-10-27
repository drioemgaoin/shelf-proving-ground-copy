import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('renders the root app container', () => {
    const { container } = render(<App />);
    expect(container.querySelector('#app')).not.toBeNull();
  });
});
