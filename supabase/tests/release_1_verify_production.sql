-- THE BOOK CELLAR — read-only checks to run in the Supabase SQL editor
-- right AFTER the Release 1 migration. Changes nothing.
-- Expected: library_books = (your count before, e.g. 483), unlinked_books = 0,
--           books_missing_owned_copy = 0, and every security row says ok.

SELECT 'library_books'            AS check_name, count(*)::text AS value FROM public.books
UNION ALL
SELECT 'unlinked_books',           count(*)::text FROM public.books WHERE work_id IS NULL
UNION ALL
SELECT 'catalog_works',            count(*)::text FROM public.works
UNION ALL
SELECT 'owned_copies',             count(*)::text FROM public.owned_copies
UNION ALL
SELECT 'books_missing_owned_copy', count(*)::text
  FROM public.books b LEFT JOIN public.owned_copies c ON c.legacy_book_id = b.id WHERE c.id IS NULL
UNION ALL
SELECT 'anon_can_run_import',      CASE WHEN has_function_privilege('anon', 'public.import_goodreads_reading_batch(uuid)', 'EXECUTE') THEN 'PROBLEM' ELSE 'ok' END
UNION ALL
SELECT 'signed_in_can_run_import', CASE WHEN has_function_privilege('authenticated', 'public.import_goodreads_reading_batch(uuid)', 'EXECUTE') THEN 'ok' ELSE 'PROBLEM' END
UNION ALL
SELECT 'anon_can_read_tbr',        CASE WHEN has_table_privilege('anon', 'public.tbr_entries', 'SELECT') THEN 'PROBLEM' ELSE 'ok' END
UNION ALL
SELECT 'users_can_write_catalog',  CASE WHEN has_table_privilege('authenticated', 'public.works', 'INSERT') THEN 'PROBLEM' ELSE 'ok' END
UNION ALL
SELECT 'rls_on_new_tables',        CASE WHEN bool_and(c.relrowsecurity) THEN 'ok' ELSE 'PROBLEM' END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('works','book_editions','owned_copies','tbr_entries','sommelier_preferences',
        'goodreads_imports','goodreads_import_rows','tbr_discoveries','omnibus_contents','metadata_sources',
        'work_metadata_claims','work_metadata_coverage');
