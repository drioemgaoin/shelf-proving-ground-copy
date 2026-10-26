import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChipBar } from './ChipBar';

describe('ChipBar', () => {
  it('renders all four chips inside an accessible group', () => {
    render(<ChipBar />);
    expect(screen.getByRole('group', { name: 'Filter by status' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'To Read' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reading' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finished' })).toBeTruthy();
  });

  it('"All" is pressed on initial render; status chips are unpressed', () => {
    render(<ChipBar />);
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'To Read' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Reading' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Finished' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a status chip presses it and unpresses "All"', () => {
    render(<ChipBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Reading' }));
    expect(screen.getByRole('button', { name: 'Reading' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking an already-pressed status chip toggles it off and restores "All"', () => {
    render(<ChipBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Reading' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reading' }));
    expect(screen.getByRole('button', { name: 'Reading' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('multiple status chips can be pressed simultaneously; "All" stays unpressed', () => {
    render(<ChipBar />);
    fireEvent.click(screen.getByRole('button', { name: 'To Read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finished' }));
    expect(screen.getByRole('button', { name: 'To Read' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Finished' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Reading' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking "All" resets all pressed status chips', () => {
    render(<ChipBar />);
    fireEvent.click(screen.getByRole('button', { name: 'To Read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reading' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'To Read' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Reading' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking "All" when already selected keeps "All" pressed', () => {
    render(<ChipBar />);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });
});
