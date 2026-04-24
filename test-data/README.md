# Test Data — CSV Fixtures for Manual Testing

Ready-to-upload CSVs for exercising the import + bulk update flows.

## Providers

| File | Rows | Purpose |
|---|---|---|
| `providers-small.csv` | 3 | Quick smoke test — 3 different provider types across Austin/Denver/Boston |
| `providers-medium.csv` | 10 | Exercises progress polling + pagination — 10 providers across 10 cities with NPI numbers and websites |
| `providers-with-chain.csv` | 5 | **Edge cases:** missing email, blank phone, missing required field (should skip), special chars (apostrophes, commas in quoted fields) |
| `providers-bulk-update.csv` | 3 | Updates status + notes on the 3 providers from `providers-small.csv`. Use via **Import → Bulk Update (CSV)** (not the plain Import). |

## Law Firms

| File | Rows | Purpose |
|---|---|---|
| `law-firms-small.csv` | 5 | Quick test — 5 firms of different sizes (solo/small/medium/large) across different cities |

## How to use

### Provider CSV Import (admin)
1. Sign in as admin
2. Go to `/providers`
3. Click **Import → Import Providers (CSV)**
4. Upload one of the `providers-*.csv` files above
5. Review the field mapping → click Start
6. Watch the progress bar — background job runs on FastAPI
7. On complete: rows appear in the list

### Provider Bulk Update (admin)
1. Import `providers-small.csv` first (so the 3 rows exist)
2. Click **Import → Bulk Update (CSV)**
3. Upload `providers-bulk-update.csv`
4. Matches by `business_name` → updates status + notes on existing rows

### Law Firm CSV Import
1. Go to `/law-firms`
2. Click **Import → Import Law Firms (CSV)**
3. Upload `law-firms-small.csv`

## Expected behavior by file

- **providers-small.csv** → 3 imported, 0 skipped
- **providers-medium.csv** → 10 imported, 0 skipped (progress bar visible since job is larger)
- **providers-with-chain.csv** → 4 imported, 1 skipped (the one with blank `business_name`)
- **providers-bulk-update.csv** → 3 updated, 0 not found (after running providers-small first)
- **law-firms-small.csv** → 5 imported, 0 skipped

## Geocoding note

All addresses are real — the backend calls Google Places API to geocode them.
After import, check the **Map** page (`/map`) — new providers should appear as pins at their correct locations.
