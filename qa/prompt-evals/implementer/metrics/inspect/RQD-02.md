# RQD-02 — Loading rows in a data table — must not use aria-hidden

**Result:** ✓ PASS
**Rule:** role-query-diagnostic
**Duration:** 66.7s
**Model:** sonnet
**Source:** latest run

## Task

Write a DataTable component. It receives `rows: Row[]` and `loading: boolean`. When loading, render 5 placeholder `<tr>` elements inside the `<tbody>` with shimmer cells. When loaded, render the real rows. The table has role="table" with proper semantic markup. Use tokens for all styling. Include the CSS file.

## Output

```tsx
import './DataTable.css';

export interface Row {
  id: string;
  [key: string]: string;
}

interface DataTableProps {
  rows: Row[];
  loading: boolean;
}

const SKELETON_ROW_COUNT = 5;
const SKELETON_CELL_COUNT = 4;

export function DataTable({ rows, loading }: DataTableProps): JSX.Element {
  const columns = rows.length > 0
    ? Object.keys(rows[0]).filter((k) => k !== 'id')
    : [];

  if (loading) {
    return (
      <table role="table" className="data-table">
        <thead>
          <tr>
            {Array.from({ length: SKELETON_CELL_COUNT }).map((_, i) => (
              <th key={i} scope="col">
                <span className="data-table-skeleton-header" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, rowIdx) => (
            <tr key={rowIdx} className="data-table-row data-table-row--placeholder">
              {Array.from({ length: SKELETON_CELL_COUNT }).map((_, cellIdx) => (
                <td key={cellIdx}>
                  <span className="data-table-skeleton-cell" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <table role="table" className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col} scope="col" className="data-table-header">
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="data-table-row">
            {columns.map((col) => (
              <td key={col} className="data-table-cell">
                {row[col]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

```

## Checks

| Metric | Check | Result |
|---|---|---|
| output_compliance | Model produced component code with exports/imports | ✓ PASS |
| constraint_adherence | No aria-hidden on placeholder rows — they must participate in the accessible tree for role-based locators | ✓ PASS |
| constraint_adherence | Named exports only — no default exports | ✓ PASS |
| task_accuracy | Must render a tbody element for placeholder rows | ✓ PASS |
