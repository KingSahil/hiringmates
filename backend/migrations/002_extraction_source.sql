-- Patch for databases created before `source` was added to `extractions`.
--
-- Symptom without it: every extraction write fails with
--   postgrest.exceptions.APIError: Could not find the 'source' column of
--   'extractions' in the schema cache  (code PGRST204)
-- The session then sits at status "pending" forever, because the failure
-- happens in the background task and only surfaces in the server log.
--
-- Run this in the Supabase SQL editor, then restart the backend.

alter table extractions
  add column if not exists source text not null default 'detector';

-- Backfill: anything already stored was produced by the detector.
update extractions set source = 'detector' where source is null;
