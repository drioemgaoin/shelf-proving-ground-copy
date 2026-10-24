import { beforeEach, describe, expect, it } from 'vitest';
import { addBook, deleteBook, getBooks, initApi, updateStatus, type Status } from './api';

const STATUSES: Status[] = ['to-read', 'reading', 'finished'];

// UUID v4 shape, e.g. 12345678-1234-4123-8123-1234567890ab
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('api — default seed', () => {
  beforeEach(() => initApi());

  it('returns 5–8 seed books with all three statuses and hardcoded UUIDs', async () => {
    const books = await getBooks();
    expect(books.length).toBeGreaterThanOrEqual(5);
    expect(books.length).toBeLessThanOrEqual(8);
    for (const b of books) expect(b.id).toMatch(UUID_RE);
    const statuses = new Set(books.map((b) => b.status));
    for (const s of STATUSES) expect(statuses.has(s)).toBe(true);
  });

  it('is deterministic across re-inits', async () => {
    const first = await getBooks();
    initApi();
    const second = await getBooks();
    expect(second).toEqual(first);
  });
});

describe('api — mutations', () => {
  beforeEach(() => initApi('empty'));

  it('getBooks returns [] for the empty fixture', async () => {
    expect(await getBooks()).toEqual([]);
  });

  it('addBook prepends, defaults status to "to-read", and returns the Book', async () => {
    const book = await addBook('Dune', 'Frank Herbert');
    expect(book.title).toBe('Dune');
    expect(book.author).toBe('Frank Herbert');
    expect(book.status).toBe('to-read');
    expect(book.id).toMatch(UUID_RE);

    const books = await getBooks();
    expect(books[0].id).toBe(book.id);
    expect(books).toHaveLength(1);
  });

  it('addBook makes author optional', async () => {
    const book = await addBook('Untitled');
    expect(book.author).toBeUndefined();
  });

  it('addBook returns books newest-first after multiple adds', async () => {
    await addBook('First');
    await addBook('Second');
    await addBook('Third');
    const titles = (await getBooks()).map((b) => b.title);
    expect(titles).toEqual(['Third', 'Second', 'First']);
  });

  it('addBook throws for an empty title', async () => {
    await expect(addBook('')).rejects.toThrow();
  });

  it('addBook throws for a whitespace-only title', async () => {
    await expect(addBook('   ')).rejects.toThrow();
  });

  it('updateStatus returns the updated Book', async () => {
    const added = await addBook('Book');
    const updated = await updateStatus(added.id, 'reading');
    expect(updated.id).toBe(added.id);
    expect(updated.status).toBe('reading');
    expect((await getBooks())[0].status).toBe('reading');
  });

  it('updateStatus throws for an unknown id', async () => {
    await expect(updateStatus('nope', 'reading')).rejects.toThrow();
  });

  it('deleteBook removes the book and returns void', async () => {
    const added = await addBook('Book');
    const result = await deleteBook(added.id);
    expect(result).toBeUndefined();
    expect(await getBooks()).toEqual([]);
  });

  it('deleteBook throws for an unknown id', async () => {
    await expect(deleteBook('nope')).rejects.toThrow();
  });
});

describe('api — initApi reset', () => {
  it('resets mutated state back to a clean fixture', async () => {
    initApi('empty');
    await addBook('Scratch');
    expect(await getBooks()).toHaveLength(1);
    initApi('empty');
    expect(await getBooks()).toEqual([]);
  });
});

describe('api — error fixture', () => {
  beforeEach(() => initApi('error'));

  it('throws for every API call', async () => {
    await expect(getBooks()).rejects.toThrow();
    await expect(addBook('x')).rejects.toThrow();
    await expect(updateStatus('id', 'reading')).rejects.toThrow();
    await expect(deleteBook('id')).rejects.toThrow();
  });
});

describe('api — slow fixture', () => {
  beforeEach(() => initApi('slow'));

  it('resolves getBooks after roughly a 2s delay', async () => {
    const start = Date.now();
    await getBooks();
    expect(Date.now() - start).toBeGreaterThanOrEqual(1800);
  });
});

describe('api — long fixture', () => {
  beforeEach(() => initApi('long'));

  it('returns 5–8 truncation-stress books', async () => {
    const books = await getBooks();
    expect(books.length).toBeGreaterThanOrEqual(5);
    expect(books.length).toBeLessThanOrEqual(8);
    for (const b of books) expect(b.id).toMatch(UUID_RE);
    // At least one absurdly long single unbroken word (truncation stress).
    const longestWord = Math.max(
      ...books.map((b) => Math.max(...b.title.split(/\s+/).map((w) => w.length))),
    );
    expect(longestWord).toBeGreaterThanOrEqual(40);
  });
});

describe('api — many fixture', () => {
  beforeEach(() => initApi('many'));

  it('returns 200 books with deterministic IDs and cycling statuses', async () => {
    const books = await getBooks();
    expect(books).toHaveLength(200);
    expect(books[0].id).toBe('00000000-0000-4000-8000-000000000001');
    expect(books[0].title).toBe('Book 001');
    expect(books[199].id).toBe('00000000-0000-4000-8000-000000000200');
    expect(books[199].title).toBe('Book 200');
    // Statuses cycle deterministically so filter counts are predictable.
    for (let i = 0; i < books.length; i++) {
      expect(books[i].status).toBe(STATUSES[i % 3]);
    }
  });
});
