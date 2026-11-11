-- THE BOOK CELLAR — Release 1 test script.
-- Run AFTER release_1_seed_synthetic.sql and the release migration, on a DISPOSABLE database.
-- Everything runs in one transaction that is ROLLED BACK at the end, so the database is left as it was.
-- Output: one PASS/FAIL line per check, then a summary. Any FAIL = do not release.

\set ON_ERROR_STOP 1
\pset footer off
\o /dev/null
BEGIN;

CREATE TABLE testkit.results (n serial, label text, passed boolean, detail text);
GRANT USAGE ON SCHEMA testkit TO anon, authenticated, service_role;
GRANT ALL ON testkit.results TO anon, authenticated, service_role;
GRANT ALL ON SEQUENCE testkit.results_n_seq TO anon, authenticated, service_role;

CREATE FUNCTION testkit.check(p_ok boolean, p_label text, p_detail text DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$ INSERT INTO testkit.results (label, passed, detail) VALUES (p_label, coalesce(p_ok, false), p_detail) $$;
GRANT EXECUTE ON FUNCTION testkit.check(boolean, text, text) TO anon, authenticated, service_role;

-- Fixed ids for readability
--   Reader A = aaaaaaaa-...-0001, Reader B = bbbbbbbb-...-0002

-- =====================================================================
-- 1. Existing Library is preserved
-- =====================================================================
SELECT testkit.check(
  (SELECT count(*) FROM public.books) = (SELECT count(*) FROM testkit.books_before),
  'Library: same number of books as before the migration');

SELECT testkit.check(
  NOT EXISTS (
    SELECT id, owner_id, title, author, series, volume_number, edition_name, isbn, publisher, publication_year,
           format, cover_image_url, special_features, notes, read_status, created_at FROM testkit.books_before
    EXCEPT
    SELECT id, owner_id, title, author, series, volume_number, edition_name, isbn, publisher, publication_year,
           format, cover_image_url, special_features, notes, read_status, created_at FROM public.books),
  'Library: every original field (incl. read_status and covers) is unchanged');

SELECT testkit.check((SELECT count(*) FROM public.books WHERE work_id IS NULL) = 0,
  'Bridge: every Library book is linked to a catalog work');

SELECT testkit.check(
  (SELECT count(*) FROM public.owned_copies WHERE legacy_book_id IS NOT NULL) = (SELECT count(*) FROM public.books),
  'Bridge: one owned copy per Library book');

SELECT testkit.check(
  (SELECT count(DISTINCT work_id) FROM public.books WHERE title = 'Fourth Wing') = 1
  AND (SELECT count(*) FROM public.owned_copies c JOIN public.books b ON b.id = c.legacy_book_id WHERE b.title = 'Fourth Wing') = 2,
  'Bridge: two copies of the same book share one work and keep two owned copies');

SELECT testkit.check(
  (SELECT e.cover_image_url FROM public.book_editions e WHERE e.id = public.bookcellar_edition_uuid('a0000000-0000-0000-0000-000000000001')) = 'https://example.test/fw.jpg',
  'Bridge: edition keeps the Library cover image');

-- =====================================================================
-- 2. Permissions (as an anonymous visitor)
-- =====================================================================
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);

DO $$ BEGIN
  PERFORM public.import_goodreads_reading_batch(gen_random_uuid());
  PERFORM testkit.check(false, 'Security: anonymous visitor cannot run the Goodreads import');
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM testkit.check(true, 'Security: anonymous visitor cannot run the Goodreads import');
END $$;

DO $$ BEGIN
  PERFORM 1 FROM public.tbr_entries LIMIT 1;
  PERFORM testkit.check(false, 'Security: anonymous visitor cannot read TBR entries');
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM testkit.check(true, 'Security: anonymous visitor cannot read TBR entries');
END $$;

RESET ROLE;

-- =====================================================================
-- 3. Signed in, but with no user id
-- =====================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'authenticated', true);

DO $$ BEGIN
  PERFORM public.import_goodreads_reading_batch(gen_random_uuid());
  PERFORM testkit.check(false, 'Security: call without a signed-in user is rejected');
EXCEPTION WHEN raise_exception THEN
  PERFORM testkit.check(SQLERRM = 'Authentication required', 'Security: call without a signed-in user is rejected', SQLERRM);
END $$;

-- =====================================================================
-- 4. Reader A: Library sync + Goodreads import
-- =====================================================================
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

DO $$ BEGIN
  INSERT INTO public.works (title) VALUES ('Sneaky direct insert');
  PERFORM testkit.check(false, 'Security: users cannot write to the shared catalog directly');
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM testkit.check(true, 'Security: users cannot write to the shared catalog directly');
END $$;

DO $$ BEGIN
  PERFORM public.bookcellar_books_create_copy();
  PERFORM testkit.check(false, 'Security: users cannot call internal sync functions');
EXCEPTION WHEN insufficient_privilege OR feature_not_supported OR object_not_in_prerequisite_state THEN
  PERFORM testkit.check(true, 'Security: users cannot call internal sync functions');
END $$;

-- Library sync: add a new book through the normal Library insert
INSERT INTO public.books (id, owner_id, title, author, format, cover_image_url)
VALUES ('a0000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Brand New Purchase', 'New Author', 'hardcover', 'https://example.test/new.jpg');

SELECT testkit.check(
  EXISTS (SELECT 1 FROM public.owned_copies c JOIN public.works w ON w.id = c.work_id
          WHERE c.legacy_book_id = 'a0000000-0000-0000-0000-0000000000a1' AND w.title = 'Brand New Purchase'),
  'Library sync: a newly added Library book appears in the catalog as owned');

UPDATE public.books SET cover_image_url = 'https://example.test/new-v2.jpg' WHERE id = 'a0000000-0000-0000-0000-0000000000a1';
SELECT testkit.check(
  (SELECT cover_image_url FROM public.book_editions WHERE id = public.bookcellar_edition_uuid('a0000000-0000-0000-0000-0000000000a1')) = 'https://example.test/new-v2.jpg',
  'Library sync: editing a Library cover updates the catalog edition');

DELETE FROM public.books WHERE id = 'a0000000-0000-0000-0000-0000000000a1';
SELECT testkit.check(
  NOT EXISTS (SELECT 1 FROM public.owned_copies WHERE legacy_book_id = 'a0000000-0000-0000-0000-0000000000a1'),
  'Library sync: deleting a Library book removes its owned copy');

-- Existing TBR entry that must NOT be changed by the import
INSERT INTO public.tbr_entries (user_id, work_id, status, added_via, user_notes)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', work_id, 'currently_reading', 'manual', 'my own note'
FROM public.books WHERE id = 'a0000000-0000-0000-0000-000000000003';

-- A Goodreads import with one row per scenario
INSERT INTO public.goodreads_imports (id, user_id, status, original_filename, row_count)
VALUES ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'reviewing', 'synthetic.csv', 10);

INSERT INTO public.goodreads_import_rows (import_id, row_number, raw_row, proposed_status, match_confidence, review_status, proposed_work_id) VALUES
  -- r1 approved, linked to owned Fourth Wing, Goodreads title carries a series suffix
  ('11111111-0000-0000-0000-000000000001', 1, '{"Title":"Fourth Wing (The Empyrean, #1)","Author":"Rebecca Yarros"}', 'read', 'high', 'approved',
     (SELECT work_id FROM public.books WHERE id = 'a0000000-0000-0000-0000-000000000001')),
  -- r2 skipped by the reader
  ('11111111-0000-0000-0000-000000000001', 2, '{"Title":"Icebreaker (Maple Hills, #1)","Author":"Hannah Grace"}', 'want_to_read', 'high', 'skipped',
     (SELECT work_id FROM public.books WHERE id = 'a0000000-0000-0000-0000-000000000005')),
  -- r3 still waiting for review (low confidence)
  ('11111111-0000-0000-0000-000000000001', 3, '{"Title":"The Housemaid","Author":"Someone Else"}', 'read', 'low', 'needs_review',
     (SELECT work_id FROM public.books WHERE id = 'a0000000-0000-0000-0000-000000000006')),
  -- r4 approved, NOT owned: should create a new catalog book with series info
  ('11111111-0000-0000-0000-000000000001', 4, '{"Title":"Onyx Storm (The Empyrean, #2)","Author":"Rebecca Yarros"}', 'want_to_read', 'unmatched', 'approved', NULL),
  -- r5 approved but linked to the wrong book (title mismatch)
  ('11111111-0000-0000-0000-000000000001', 5, '{"Title":"Totally Different Title","Author":"Freida McFadden"}', 'read', 'high', 'approved',
     (SELECT work_id FROM public.books WHERE id = 'a0000000-0000-0000-0000-000000000006')),
  -- r6 approved but on a custom shelf (no reading status)
  ('11111111-0000-0000-0000-000000000001', 6, '{"Title":"Shelf Mystery","Author":"Anon"}', NULL, 'unmatched', 'approved', NULL),
  -- r7 approved, already in TBR as currently_reading: must stay currently_reading
  ('11111111-0000-0000-0000-000000000001', 7, '{"Title":"Haunting Adeline (Cat and Mouse Duet, #1)","Author":"H.D. Carlton"}', 'want_to_read', 'high', 'approved',
     (SELECT work_id FROM public.books WHERE id = 'a0000000-0000-0000-0000-000000000003')),
  -- r8 approved, straight apostrophe vs curly apostrophe in the Library
  ('11111111-0000-0000-0000-000000000001', 8, '{"Title":"Don''t Let Go","Author":"Test Author"}', 'want_to_read', 'high', 'approved',
     (SELECT work_id FROM public.books WHERE id = 'a0000000-0000-0000-0000-000000000004')),
  -- r9 approved as "unmatched" but it IS an owned book: must reuse the owned work, not duplicate it
  ('11111111-0000-0000-0000-000000000001', 9, '{"Title":"The Housemaid","Author":"Freida McFadden"}', 'read', 'unmatched', 'approved', NULL);

-- Reader B tries to run Reader A's import
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
DO $$ BEGIN
  PERFORM public.import_goodreads_reading_batch('11111111-0000-0000-0000-000000000001');
  PERFORM testkit.check(false, 'Security: another user cannot run my import');
EXCEPTION WHEN raise_exception THEN
  PERFORM testkit.check(true, 'Security: another user cannot run my import', SQLERRM);
END $$;
SELECT testkit.check((SELECT count(*) FROM public.goodreads_import_rows) = 0,
  'Security: another user cannot see my import rows');
SELECT testkit.check((SELECT count(*) FROM public.tbr_entries) = 0,
  'Security: another user cannot see my TBR');

-- Reader A runs the import
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
CREATE TEMP TABLE run1 AS SELECT public.import_goodreads_reading_batch('11111111-0000-0000-0000-000000000001') AS r;

SELECT testkit.check((SELECT (r->>'added')::int FROM run1) = 4, 'Import: 4 books added (rows 1, 4, 8, 9)', (SELECT r::text FROM run1));
SELECT testkit.check((SELECT (r->>'already_in_tbr')::int FROM run1) = 1, 'Import: 1 book already in TBR (row 7)');
SELECT testkit.check((SELECT (r->>'skipped')::int FROM run1) = 2, 'Import: 2 rows skipped with a reason (rows 5, 6)');
SELECT testkit.check((SELECT (r->>'new_books')::int FROM run1) = 1, 'Import: exactly 1 new catalog book created (Onyx Storm)');

SELECT testkit.check(
  EXISTS (SELECT 1 FROM public.tbr_entries t JOIN public.books b ON b.work_id = t.work_id
          WHERE b.id = 'a0000000-0000-0000-0000-000000000001' AND t.status = 'read' AND t.added_via = 'goodreads_import'),
  'Import: approved match on an owned book is added to TBR with the Goodreads status');

SELECT testkit.check(
  EXISTS (SELECT 1 FROM public.tbr_entries t JOIN public.works w ON w.id = t.work_id
          WHERE w.title = 'Onyx Storm' AND w.series_name = 'The Empyrean' AND w.series_position = 2 AND t.status = 'want_to_read'),
  'Import: unowned Goodreads book is created (clean title + series) and added to TBR');

SELECT testkit.check(
  NOT EXISTS (SELECT 1 FROM public.owned_copies c JOIN public.works w ON w.id = c.work_id WHERE w.title = 'Onyx Storm'),
  'Import: unowned Goodreads book is NOT marked as owned');

SELECT testkit.check(
  (SELECT t.status || '|' || t.user_notes || '|' || t.added_via FROM public.tbr_entries t JOIN public.books b ON b.work_id = t.work_id
   WHERE b.id = 'a0000000-0000-0000-0000-000000000003') = 'currently_reading|my own note|manual',
  'Import: existing TBR entry keeps its status, notes and origin');

SELECT testkit.check(
  (SELECT count(*) FROM public.tbr_entries t JOIN public.books b ON b.work_id = t.work_id
   WHERE b.id = 'a0000000-0000-0000-0000-000000000003') = 1,
  'Import: no duplicate TBR entry is created');

SELECT testkit.check(
  EXISTS (SELECT 1 FROM public.tbr_entries t JOIN public.books b ON b.work_id = t.work_id WHERE b.id = 'a0000000-0000-0000-0000-000000000004'),
  'Import: curly vs straight apostrophe still matches');

SELECT testkit.check(
  (SELECT count(*) FROM public.works WHERE bookcellar_title_key(title) = 'the housemaid') = 1
  AND EXISTS (SELECT 1 FROM public.tbr_entries t JOIN public.books b ON b.work_id = t.work_id WHERE b.id = 'a0000000-0000-0000-0000-000000000006'),
  'Import: an owned book arriving as "unmatched" reuses the owned work (no duplicate)');

SELECT testkit.check(
  NOT EXISTS (SELECT 1 FROM public.tbr_entries t JOIN public.books b ON b.work_id = t.work_id WHERE b.id = 'a0000000-0000-0000-0000-000000000005'),
  'Import: a skipped row adds nothing');

SELECT testkit.check(
  (SELECT review_status FROM public.goodreads_import_rows WHERE row_number = 3) = 'needs_review',
  'Import: a row still awaiting review is left alone');

SELECT testkit.check(
  (SELECT review_status = 'needs_review' AND resolution_notes LIKE 'Import skipped: Title does not match%' FROM public.goodreads_import_rows WHERE row_number = 5),
  'Import: wrong-book link is refused and sent back to review with the reason');

SELECT testkit.check(
  (SELECT review_status = 'needs_review' AND resolution_notes LIKE 'Import skipped: No reading status%' FROM public.goodreads_import_rows WHERE row_number = 6),
  'Import: custom-shelf row is sent back to review with the reason');

SELECT testkit.check(
  (SELECT count(*) FROM public.goodreads_import_rows WHERE review_status = 'applied') = 5,
  'Import: only successfully processed rows are marked applied');

SELECT testkit.check(
  (SELECT status FROM public.goodreads_imports WHERE id = '11111111-0000-0000-0000-000000000001') = 'reviewing',
  'Import: batch stays open while rows still need review');

CREATE TEMP TABLE run2 AS SELECT public.import_goodreads_reading_batch('11111111-0000-0000-0000-000000000001') AS r;
SELECT testkit.check((SELECT (r->>'added')::int + (r->>'skipped')::int FROM run2) = 0,
  'Import: running it again changes nothing');

RESET ROLE;

SELECT testkit.check(
  NOT EXISTS (
    SELECT id, owner_id, title, author, format, cover_image_url, read_status FROM testkit.books_before
    EXCEPT SELECT id, owner_id, title, author, format, cover_image_url, read_status FROM public.books),
  'Library: still unchanged after sync tests and Goodreads import');

\o
-- =====================================================================
-- Summary
-- =====================================================================
SELECT CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, label, detail
FROM testkit.results ORDER BY n;

SELECT count(*) FILTER (WHERE passed) AS passed, count(*) FILTER (WHERE NOT passed) AS failed
FROM testkit.results;

ROLLBACK;
