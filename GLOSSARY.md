# Shelf

A personal reading-list app where a reader manages a single list of books.

## Language

**Book**:
A title–author pair on the reader's shelf. Not a physical object or edition — just something they want to track.
_Avoid_: Item, entry, record

**Shelf**:
The single, global list of all the reader's books. There is only one per session.
_Avoid_: Library, collection, bookshelf

**Status**:
A book's reading progress: *to read*, *reading*, or *finished*. Transitions are unconstrained — a book can move in any direction.
_Avoid_: State, stage, progress

**Reader**:
The single anonymous user of the app. There are no accounts or identities.
_Avoid_: User, account, profile

**Card**:
The visual representation of a book in the grid. Shows title (truncated), author (if present), and a status badge.
_Avoid_: Tile, item, row

**Drawer**:
The detail panel for a single book. Right-side on desktop, bottom sheet on mobile. Operates in one of two modes: Add mode or Detail mode.
_Avoid_: Panel, sidebar, modal, detail view

**Add mode**:
The Drawer state for creating a new book. Shows empty title and author fields. Submitting adds the book with *to read* status.
_Avoid_: Create mode, new-book dialog

**Detail mode**:
The Drawer state for viewing and editing an existing book. Shows pre-filled fields, a status segmented control, and a delete action.
_Avoid_: Edit mode, view mode

**Fixture**:
A deterministic data-and-behavior profile that the in-memory API loads at boot. Selected via the `?fixture=` URL parameter or the `initApi()` test seam. Valid names: `empty`, `error`, `slow`, `long`, `many`. No parameter means the default seed.
_Avoid_: Mock, stub, scenario
