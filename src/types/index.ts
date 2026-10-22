export type Status = 'to-read' | 'reading' | 'finished';

export interface Book {
  id: string;
  title: string;
  author?: string;
  status: Status;
}

export type Behavior = 'ok' | 'error' | 'slow';

export type FixtureName = 'empty' | 'error' | 'slow' | 'long' | 'many';

export interface Fixture {
  behavior: Behavior;
  books: Book[];
}
