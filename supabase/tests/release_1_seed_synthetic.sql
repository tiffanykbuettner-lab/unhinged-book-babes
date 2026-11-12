-- THE BOOK CELLAR — synthetic "before" data for testing Release 1.
-- Run on a DISPOSABLE database that has the production schema but no real data.
-- Never run against production.

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'reader-a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'reader-b@example.test');

INSERT INTO public.profiles (id, display_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Reader A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Reader B');

-- Reader A's Library: 6 rows, two of them copies of the same book.
INSERT INTO public.books (id, owner_id, title, author, series, volume_number, isbn, format, edition_name, cover_image_url, read_status) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fourth Wing', 'Rebecca Yarros', 'The Empyrean', '1', '9781649374042', 'hardcover', NULL, 'https://example.test/fw.jpg', 'owned'),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fourth Wing', 'Rebecca Yarros', 'The Empyrean', '1', NULL, 'hardcover', 'Special edition', NULL, 'read'),
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Haunting Adeline', 'H.D. Carlton', 'Cat and Mouse Duet', '1', NULL, 'paperback', NULL, NULL, 'owned'),
  ('a0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Don’t Let Go', 'Test Author', NULL, NULL, NULL, 'ebook', NULL, NULL, 'unread'),
  ('a0000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Icebreaker', 'Hannah Grace', 'Maple Hills', '1', NULL, 'paperback', NULL, NULL, 'owned'),
  ('a0000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'The Housemaid', 'Freida McFadden', NULL, NULL, NULL, 'audiobook', NULL, NULL, 'read');

-- Reader B's Library: 1 row.
INSERT INTO public.books (id, owner_id, title, author, format) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Reader B Book', 'Someone', 'paperback');

-- Snapshot of the Library before the migration, so the tests can prove nothing changed.
CREATE SCHEMA testkit;
CREATE TABLE testkit.books_before AS SELECT * FROM public.books;

COMMIT;
