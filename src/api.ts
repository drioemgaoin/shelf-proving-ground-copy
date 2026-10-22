// In-memory data layer for the reading list. Plain async functions over a
// module-scoped store — no hooks, no classes, no persistence. The active
// fixture (chosen once from ?fixture= at boot, or via initApi in tests)
// decides both the seed data and the behavior profile (ok / error / slow).
import type { Book, Status, Behavior, Fixture } from './types';

export type { Book, Status } from './types';

const SLOW_DELAY_MS = 2000;

// The single source of truth for book state during a session.
let books: Book[] = [];
let behavior: Behavior = 'ok';

// Deep-copies fixture data into the store so mutations never leak back.
export function initApi(fixture: Fixture): void {
  books = fixture.books.map((book) => ({ ...book }));
  behavior = fixture.behavior;
}

/** Read ?fixture= once from the URL. Returns undefined outside a browser. */
export function fixtureFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get('fixture') ?? undefined;
}

/**
 * Apply the active behavior profile before any operation: the error fixture
 * throws on every call, the slow fixture delays every call by 2s.
 */
async function applyBehavior(): Promise<void> {
  if (behavior === 'error') throw new Error('Failed to load the shelf. Please try again.');
  if (behavior === 'slow') await new Promise((resolve) => setTimeout(resolve, SLOW_DELAY_MS));
}

/** All books, newest-first by construction. */
export async function getBooks(): Promise<Book[]> {
  await applyBehavior();
  return books.map((book) => ({ ...book }));
}

/**
 * Create a book with status "to-read" and prepend it (newest-first).
 * Title is required (non-empty after trimming); author is optional.
 */
export async function addBook(title: string, author?: string): Promise<Book> {
  await applyBehavior();
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error('A title is required.');

  const book: Book = {
    id: crypto.randomUUID(),
    title: trimmedTitle,
    status: 'to-read',
  };
  const trimmedAuthor = author?.trim();
  if (trimmedAuthor) book.author = trimmedAuthor;

  books = [book, ...books];
  return { ...book };
}

/** Change a book's status in place and return the updated book. */
export async function updateStatus(id: string, status: Status): Promise<Book> {
  await applyBehavior();
  const book = books.find((b) => b.id === id);
  if (!book) throw new Error(`No book with id "${id}".`);
  book.status = status;
  return { ...book };
}

/** Remove a book from the store. */
export async function deleteBook(id: string): Promise<void> {
  await applyBehavior();
  const index = books.findIndex((b) => b.id === id);
  if (index === -1) throw new Error(`No book with id "${id}".`);
  books.splice(index, 1);
}

