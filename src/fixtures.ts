// Static seed data for each fixture profile. The API reads a profile once at
// module init (or via initApi in tests) and copies it into the in-memory store.
//
// All UUIDs here are hardcoded (not generated) so screenshots and tests stay
// deterministic across runs. Runtime-created books get a real UUID from
// crypto.randomUUID() in api.ts — only seed data is frozen.
import type { Book, Fixture, Status } from './types';

export type { Fixture, Behavior, FixtureName } from './types';

const STATUS_CYCLE: Status[] = ['to-read', 'reading', 'finished'];

// Default seed: a small, warm reading list. 6 books, hardcoded UUIDs, all three
// statuses represented, newest-first order (as an author would see it).
const SEED_BOOKS: Book[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'The Left Hand of Darkness',
    author: 'Ursula K. Le Guin',
    status: 'reading',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Piranesi',
    author: 'Susanna Clarke',
    status: 'to-read',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Braiding Sweetgrass',
    author: 'Robin Wall Kimmerer',
    status: 'finished',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    title: 'A Psalm for the Wild-Built',
    author: 'Becky Chambers',
    status: 'to-read',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    title: 'The Overstory',
    author: 'Richard Powers',
    status: 'finished',
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    title: 'Tomorrow, and Tomorrow, and Tomorrow',
    author: 'Gabrielle Zevin',
    status: 'reading',
  },
];

// Long fixture: handpicked truncation-stress strings — one very long unbroken
// word (no wrap points), many short words, and a multi-author list.
const LONG_BOOKS: Book[] = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    title:
      'Pneumonoultramicroscopicsilicovolcanoconiosisandotherlungafflictionsofthemodernminingera',
    author: 'Antidisestablishmentarianistically-Named-Author-Von-Longnamesteinbergwaldheim',
    status: 'to-read',
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    title:
      'A Very Long Title Made Of Many Small Words That Just Keeps Going On And On And On Well Past Two Lines',
    author: 'Jane Smith, John Doe, Alex Rivera, Priya Patel, Chen Wei, and Fatima Al-Sayed',
    status: 'reading',
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000003',
    title: 'Supercalifragilisticexpialidociousandthenevensomemoreletterspiledrightontop',
    author: 'M.',
    status: 'finished',
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000004',
    title: 'Short One',
    author:
      'Translated By An Absurdly Long Committee Of Contributors Editors And Assorted Advisors',
    status: 'to-read',
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000005',
    title: 'The Book With No Author Field At All Which Is Perfectly Allowed Here',
    status: 'reading',
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000006',
    title:
      'Loremipsumdolorsitametconsecteturadipiscingelitseddoeiusmodtemporincididuntutlaboreetdolore',
    author: 'Ada Lovelace, Grace Hopper, Katherine Johnson, Radia Perlman',
    status: 'finished',
  },
];

/** Build the 200-book stress fixture with deterministic IDs and cycling statuses. */
function buildManyBooks(): Book[] {
  const books: Book[] = [];
  for (let i = 0; i < 200; i++) {
    const n = i + 1;
    books.push({
      id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      title: `Book ${String(n).padStart(3, '0')}`,
      author: `Author ${String(n).padStart(3, '0')}`,
      status: STATUS_CYCLE[i % 3],
    });
  }
  return books;
}

/**
 * Resolve a fixture profile by name. Unknown or missing names fall back to the
 * default seed, so a garbled ?fixture= value never breaks the app.
 */
export function getFixture(name?: string): Fixture {
  switch (name) {
    case 'empty':
      return { behavior: 'ok', books: [] };
    case 'error':
      return { behavior: 'error', books: [] };
    case 'slow':
      return { behavior: 'slow', books: SEED_BOOKS };
    case 'long':
      return { behavior: 'ok', books: LONG_BOOKS };
    case 'many':
      return { behavior: 'ok', books: buildManyBooks() };
    default:
      return { behavior: 'ok', books: SEED_BOOKS };
  }
}
