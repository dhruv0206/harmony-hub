-- Enables extensions needed for scalable search and indexing.
-- Safe: idempotent via IF NOT EXISTS.
-- Rollback: DROP EXTENSION pg_trgm; DROP EXTENSION unaccent; DROP EXTENSION btree_gin;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gin;
