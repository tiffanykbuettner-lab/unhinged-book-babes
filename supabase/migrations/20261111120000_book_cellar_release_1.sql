-- =====================================================================
-- THE BOOK CELLAR — Release 1 database migration
-- Adds: works / editions / owned copies catalog, TBR, Sommelier preferences,
--       TBR discoveries, metadata foundation, Goodreads import, Library sync.
--
-- Safe for existing data:
--   * Additive only. No table is dropped. No Library row is deleted.
--   * On the books table, the ONLY change is a new nullable column work_id,
--     filled in by the one-time bridge in Part 3.
--   * Runs as a single transaction: if any statement fails, nothing is applied.
--
-- Schema in Part 1 is generated from the verified pre-production backup
-- (bookcellar-public-before-goodreads-test-20261025.dump), so it matches
-- what the app was built and tested against.
-- =====================================================================

BEGIN;

-- ===============================================================
-- PART 1 — Schema (from the verified backup)
-- ===============================================================

-- ---------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------
CREATE FUNCTION public.bookcellar_require_omnibus_edition() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if not exists (
    select 1
    from public.book_editions e
    where e.id = new.omnibus_edition_id
      and e.is_omnibus = true
  ) then
    raise exception 'omnibus_edition_id must reference an edition marked is_omnibus = true';
  end if;
  return new;
end;
$$;
CREATE FUNCTION public.bookcellar_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------
REVOKE ALL ON FUNCTION public.bookcellar_require_omnibus_edition() FROM PUBLIC;
GRANT ALL ON FUNCTION public.bookcellar_require_omnibus_edition() TO service_role;
REVOKE ALL ON FUNCTION public.bookcellar_set_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.bookcellar_set_updated_at() TO service_role;

-- ---------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------
CREATE TABLE public.works (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    sort_title text,
    description text,
    series_name text,
    series_position numeric,
    primary_author text,
    authors jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata_source text,
    metadata_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.book_editions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    isbn13 text,
    isbn10 text,
    publisher text,
    publication_year integer,
    format text,
    edition_name text,
    cover_image_url text,
    special_features text,
    metadata_source text,
    metadata_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_omnibus boolean DEFAULT false NOT NULL,
    CONSTRAINT book_editions_format_check CHECK (((format IS NULL) OR (format = ANY (ARRAY['hardcover'::text, 'paperback'::text, 'ebook'::text, 'audiobook'::text, 'other'::text]))))
);
CREATE TABLE public.omnibus_contents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    omnibus_edition_id uuid NOT NULL,
    contained_work_id uuid NOT NULL,
    sequence_number integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT omnibus_contents_sequence_number_check CHECK (((sequence_number IS NULL) OR (sequence_number > 0)))
);
CREATE TABLE public.owned_copies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    work_id uuid,
    edition_id uuid,
    legacy_book_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT owned_copies_edition_requires_work CHECK (((edition_id IS NULL) OR (work_id IS NOT NULL)))
);
CREATE TABLE public.tbr_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    work_id uuid NOT NULL,
    preferred_edition_id uuid,
    status text DEFAULT 'want_to_read'::text NOT NULL,
    priority smallint,
    user_notes text,
    added_via text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tbr_entries_added_via_check CHECK ((added_via = ANY (ARRAY['manual'::text, 'library'::text, 'wishlist'::text, 'goodreads_import'::text, 'sommelier'::text]))),
    CONSTRAINT tbr_entries_priority_check CHECK (((priority IS NULL) OR ((priority >= 1) AND (priority <= 5)))),
    CONSTRAINT tbr_entries_status_check CHECK ((status = ANY (ARRAY['want_to_read'::text, 'currently_reading'::text, 'read'::text, 'paused_dnf'::text])))
);
CREATE TABLE public.sommelier_preferences (
    user_id uuid NOT NULL,
    preferred_genres jsonb DEFAULT '[]'::jsonb NOT NULL,
    preferred_tropes jsonb DEFAULT '[]'::jsonb NOT NULL,
    preferred_moods jsonb DEFAULT '[]'::jsonb NOT NULL,
    spice_preference text,
    content_exclusions jsonb DEFAULT '[]'::jsonb NOT NULL,
    other_preferences text,
    discovery_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    priority_mode text DEFAULT 'surprise'::text NOT NULL,
    preferred_format text DEFAULT 'any'::text NOT NULL,
    CONSTRAINT sommelier_preferences_preferred_format_check CHECK ((preferred_format = ANY (ARRAY['any'::text, 'physical'::text, 'kindle'::text, 'audible'::text]))),
    CONSTRAINT sommelier_preferences_priority_mode_check CHECK ((priority_mode = ANY (ARRAY['surprise'::text, 'owned-first'::text, 'unowned-first'::text]))),
    CONSTRAINT sommelier_preferences_spice_preference_check CHECK (((spice_preference IS NULL) OR (spice_preference = ANY (ARRAY['closed_door'::text, 'mild'::text, 'moderate'::text, 'very_spicy'::text, 'explicit'::text, 'flexible'::text]))))
);
CREATE TABLE public.goodreads_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_name text DEFAULT 'goodreads_csv'::text NOT NULL,
    status text DEFAULT 'uploaded'::text NOT NULL,
    original_filename text,
    row_count integer,
    imported_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT goodreads_imports_row_count_check CHECK (((row_count IS NULL) OR (row_count >= 0))),
    CONSTRAINT goodreads_imports_status_check CHECK ((status = ANY (ARRAY['uploaded'::text, 'reviewing'::text, 'completed'::text, 'cancelled'::text, 'failed'::text])))
);
CREATE TABLE public.goodreads_import_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_id uuid NOT NULL,
    row_number integer NOT NULL,
    raw_row jsonb NOT NULL,
    proposed_work_id uuid,
    proposed_edition_id uuid,
    proposed_status text,
    match_confidence text DEFAULT 'unmatched'::text NOT NULL,
    review_status text DEFAULT 'needs_review'::text NOT NULL,
    resolution_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goodreads_import_rows_match_confidence_check CHECK ((match_confidence = ANY (ARRAY['unmatched'::text, 'low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT goodreads_import_rows_proposed_status_check CHECK (((proposed_status IS NULL) OR (proposed_status = ANY (ARRAY['want_to_read'::text, 'currently_reading'::text, 'read'::text, 'paused_dnf'::text])))),
    CONSTRAINT goodreads_import_rows_review_status_check CHECK ((review_status = ANY (ARRAY['needs_review'::text, 'approved'::text, 'skipped'::text, 'applied'::text])))
);
CREATE TABLE public.tbr_discoveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    author text,
    isbn_10 text,
    isbn_13 text,
    publisher text,
    publication_year integer,
    book_format text,
    cover_image_url text,
    external_source text DEFAULT 'google_books'::text NOT NULL,
    external_id text,
    status text DEFAULT 'want_to_read'::text NOT NULL,
    user_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tbr_discoveries_status_check CHECK ((status = ANY (ARRAY['want_to_read'::text, 'currently_reading'::text, 'read'::text, 'paused_dnf'::text]))),
    CONSTRAINT tbr_discoveries_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0))
);
CREATE TABLE public.metadata_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_name text NOT NULL,
    source_type text NOT NULL,
    source_url text,
    reliability_tier text DEFAULT 'medium'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT metadata_sources_reliability_tier_check CHECK ((reliability_tier = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT metadata_sources_source_name_check CHECK ((length(btrim(source_name)) > 0)),
    CONSTRAINT metadata_sources_source_type_check CHECK ((source_type = ANY (ARRAY['official'::text, 'bibliographic'::text, 'professional_review'::text, 'community'::text, 'user'::text]))),
    CONSTRAINT metadata_sources_url_not_blank CHECK (((source_url IS NULL) OR (length(btrim(source_url)) > 0)))
);
CREATE TABLE public.work_metadata_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    metadata_key text NOT NULL,
    value text NOT NULL,
    source_id uuid NOT NULL,
    source_reference text,
    evidence_note text,
    confidence text DEFAULT 'medium'::text NOT NULL,
    review_status text DEFAULT 'pending'::text NOT NULL,
    verified_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT work_metadata_claims_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT work_metadata_claims_metadata_key_check CHECK ((metadata_key = ANY (ARRAY['genre'::text, 'trope'::text, 'mood'::text, 'spice_level'::text, 'content_warning'::text, 'pacing'::text, 'pov'::text, 'relationship_dynamic'::text, 'tone'::text, 'setting'::text, 'audience'::text, 'other'::text]))),
    CONSTRAINT work_metadata_claims_review_status_check CHECK ((review_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'disputed'::text]))),
    CONSTRAINT work_metadata_claims_source_reference_not_blank CHECK (((source_reference IS NULL) OR (length(btrim(source_reference)) > 0))),
    CONSTRAINT work_metadata_claims_value_check CHECK ((length(btrim(value)) > 0))
);
CREATE TABLE public.work_metadata_coverage (
    work_id uuid NOT NULL,
    metadata_key text NOT NULL,
    coverage_status text DEFAULT 'not_checked'::text NOT NULL,
    source_count integer DEFAULT 0 NOT NULL,
    last_checked_at timestamp with time zone,
    review_note text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT work_metadata_coverage_coverage_status_check CHECK ((coverage_status = ANY (ARRAY['not_checked'::text, 'partial'::text, 'reviewed'::text, 'conflicting'::text]))),
    CONSTRAINT work_metadata_coverage_metadata_key_check CHECK ((metadata_key = ANY (ARRAY['genre'::text, 'trope'::text, 'mood'::text, 'spice_level'::text, 'content_warning'::text, 'pacing'::text, 'pov'::text, 'relationship_dynamic'::text, 'tone'::text, 'setting'::text, 'audience'::text, 'other'::text]))),
    CONSTRAINT work_metadata_coverage_source_count_check CHECK ((source_count >= 0))
);

-- Link legacy Library rows to the new catalog (nullable; existing rows untouched)
ALTER TABLE public.books ADD COLUMN work_id uuid;

-- ---------------------------------------------------------------
-- Primary keys and unique constraints
-- ---------------------------------------------------------------
ALTER TABLE ONLY public.book_editions
    ADD CONSTRAINT book_editions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.goodreads_import_rows
    ADD CONSTRAINT goodreads_import_rows_import_row_unique UNIQUE (import_id, row_number);
ALTER TABLE ONLY public.goodreads_import_rows
    ADD CONSTRAINT goodreads_import_rows_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.goodreads_imports
    ADD CONSTRAINT goodreads_imports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.metadata_sources
    ADD CONSTRAINT metadata_sources_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.omnibus_contents
    ADD CONSTRAINT omnibus_contents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.omnibus_contents
    ADD CONSTRAINT omnibus_contents_unique UNIQUE (omnibus_edition_id, contained_work_id);
ALTER TABLE ONLY public.owned_copies
    ADD CONSTRAINT owned_copies_legacy_book_id_key UNIQUE (legacy_book_id);
ALTER TABLE ONLY public.owned_copies
    ADD CONSTRAINT owned_copies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sommelier_preferences
    ADD CONSTRAINT sommelier_preferences_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.tbr_discoveries
    ADD CONSTRAINT tbr_discoveries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tbr_entries
    ADD CONSTRAINT tbr_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tbr_entries
    ADD CONSTRAINT tbr_entries_user_work_unique UNIQUE (user_id, work_id);
ALTER TABLE ONLY public.work_metadata_claims
    ADD CONSTRAINT work_metadata_claims_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.work_metadata_coverage
    ADD CONSTRAINT work_metadata_coverage_pkey PRIMARY KEY (work_id, metadata_key);
ALTER TABLE ONLY public.works
    ADD CONSTRAINT works_pkey PRIMARY KEY (id);

-- ---------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------
CREATE UNIQUE INDEX book_editions_id_work_id_unique_idx ON public.book_editions USING btree (id, work_id);
CREATE INDEX book_editions_isbn10_idx ON public.book_editions USING btree (isbn10) WHERE (isbn10 IS NOT NULL);
CREATE INDEX book_editions_isbn13_idx ON public.book_editions USING btree (isbn13) WHERE (isbn13 IS NOT NULL);
CREATE INDEX book_editions_work_id_idx ON public.book_editions USING btree (work_id);
CREATE UNIQUE INDEX books_id_owner_id_unique_idx ON public.books USING btree (id, owner_id);
CREATE INDEX books_work_id_idx ON public.books USING btree (work_id);
CREATE INDEX goodreads_import_rows_import_review_idx ON public.goodreads_import_rows USING btree (import_id, review_status);
CREATE INDEX goodreads_imports_user_created_idx ON public.goodreads_imports USING btree (user_id, created_at DESC);
CREATE INDEX metadata_sources_type_tier_idx ON public.metadata_sources USING btree (source_type, reliability_tier);
CREATE INDEX owned_copies_owner_id_idx ON public.owned_copies USING btree (owner_id);
CREATE INDEX owned_copies_work_id_idx ON public.owned_copies USING btree (work_id);
CREATE INDEX tbr_discoveries_user_status_idx ON public.tbr_discoveries USING btree (user_id, status);
CREATE INDEX tbr_entries_user_status_idx ON public.tbr_entries USING btree (user_id, status);
CREATE INDEX tbr_entries_work_id_idx ON public.tbr_entries USING btree (work_id);
CREATE INDEX work_metadata_claims_key_value_status_idx ON public.work_metadata_claims USING btree (metadata_key, lower(value), review_status);
CREATE UNIQUE INDEX work_metadata_claims_source_dedupe_idx ON public.work_metadata_claims USING btree (work_id, metadata_key, lower(value), source_id, COALESCE(source_reference, ''::text));
CREATE INDEX work_metadata_claims_source_id_idx ON public.work_metadata_claims USING btree (source_id);
CREATE INDEX work_metadata_claims_work_key_status_idx ON public.work_metadata_claims USING btree (work_id, metadata_key, review_status);
CREATE INDEX work_metadata_coverage_status_idx ON public.work_metadata_coverage USING btree (metadata_key, coverage_status);

-- ---------------------------------------------------------------
-- updated_at / omnibus triggers
-- ---------------------------------------------------------------
CREATE TRIGGER book_editions_set_updated_at BEFORE UPDATE ON public.book_editions FOR EACH ROW EXECUTE FUNCTION public.bookcellar_set_updated_at();
CREATE TRIGGER omnibus_contents_require_omnibus BEFORE INSERT OR UPDATE OF omnibus_edition_id ON public.omnibus_contents FOR EACH ROW EXECUTE FUNCTION public.bookcellar_require_omnibus_edition();
CREATE TRIGGER owned_copies_set_updated_at BEFORE UPDATE ON public.owned_copies FOR EACH ROW EXECUTE FUNCTION public.bookcellar_set_updated_at();
CREATE TRIGGER sommelier_preferences_set_updated_at BEFORE UPDATE ON public.sommelier_preferences FOR EACH ROW EXECUTE FUNCTION public.bookcellar_set_updated_at();
CREATE TRIGGER tbr_entries_set_updated_at BEFORE UPDATE ON public.tbr_entries FOR EACH ROW EXECUTE FUNCTION public.bookcellar_set_updated_at();
CREATE TRIGGER works_set_updated_at BEFORE UPDATE ON public.works FOR EACH ROW EXECUTE FUNCTION public.bookcellar_set_updated_at();

-- ---------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------
ALTER TABLE ONLY public.book_editions
    ADD CONSTRAINT book_editions_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.books
    ADD CONSTRAINT books_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.goodreads_import_rows
    ADD CONSTRAINT goodreads_import_rows_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.goodreads_imports(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.goodreads_import_rows
    ADD CONSTRAINT goodreads_import_rows_proposed_edition_id_fkey FOREIGN KEY (proposed_edition_id) REFERENCES public.book_editions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.goodreads_import_rows
    ADD CONSTRAINT goodreads_import_rows_proposed_work_id_fkey FOREIGN KEY (proposed_work_id) REFERENCES public.works(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.goodreads_imports
    ADD CONSTRAINT goodreads_imports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.omnibus_contents
    ADD CONSTRAINT omnibus_contents_contained_work_id_fkey FOREIGN KEY (contained_work_id) REFERENCES public.works(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.omnibus_contents
    ADD CONSTRAINT omnibus_contents_omnibus_edition_id_fkey FOREIGN KEY (omnibus_edition_id) REFERENCES public.book_editions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.owned_copies
    ADD CONSTRAINT owned_copies_edition_work_fk FOREIGN KEY (edition_id, work_id) REFERENCES public.book_editions(id, work_id) ON DELETE SET NULL (edition_id);
ALTER TABLE ONLY public.owned_copies
    ADD CONSTRAINT owned_copies_legacy_book_owner_fk FOREIGN KEY (legacy_book_id, owner_id) REFERENCES public.books(id, owner_id) ON DELETE SET NULL (legacy_book_id);
ALTER TABLE ONLY public.owned_copies
    ADD CONSTRAINT owned_copies_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.owned_copies
    ADD CONSTRAINT owned_copies_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.sommelier_preferences
    ADD CONSTRAINT sommelier_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tbr_discoveries
    ADD CONSTRAINT tbr_discoveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tbr_entries
    ADD CONSTRAINT tbr_entries_preferred_edition_work_fk FOREIGN KEY (preferred_edition_id, work_id) REFERENCES public.book_editions(id, work_id) ON DELETE SET NULL (preferred_edition_id);
ALTER TABLE ONLY public.tbr_entries
    ADD CONSTRAINT tbr_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tbr_entries
    ADD CONSTRAINT tbr_entries_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.work_metadata_claims
    ADD CONSTRAINT work_metadata_claims_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.work_metadata_claims
    ADD CONSTRAINT work_metadata_claims_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.metadata_sources(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.work_metadata_claims
    ADD CONSTRAINT work_metadata_claims_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.work_metadata_coverage
    ADD CONSTRAINT work_metadata_coverage_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.works(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------
ALTER TABLE public.book_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goodreads_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goodreads_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omnibus_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owned_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sommelier_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tbr_discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tbr_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_metadata_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_metadata_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------
CREATE POLICY "Authenticated users can read book editions" ON public.book_editions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read omnibus contents" ON public.omnibus_contents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read works" ON public.works FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users manage rows in their own Goodreads imports" ON public.goodreads_import_rows TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.goodreads_imports i
  WHERE ((i.id = goodreads_import_rows.import_id) AND (i.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.goodreads_imports i
  WHERE ((i.id = goodreads_import_rows.import_id) AND (i.user_id = auth.uid())))));
CREATE POLICY "Users manage their own Goodreads imports" ON public.goodreads_imports TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users manage their own Sommelier preferences" ON public.sommelier_preferences TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users manage their own TBR" ON public.tbr_entries TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users manage their own TBR discoveries" ON public.tbr_discoveries TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users manage their own owned copies" ON public.owned_copies TO authenticated USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY metadata_sources_select_authenticated ON public.metadata_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY work_metadata_claims_select_accepted_authenticated ON public.work_metadata_claims FOR SELECT TO authenticated USING ((review_status = 'accepted'::text));
CREATE POLICY work_metadata_coverage_select_authenticated ON public.work_metadata_coverage FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------
-- Table privileges: Supabase gives new public tables broad default grants.
-- Remove them, then grant exactly what the tested schema uses. anon gets nothing.
-- ---------------------------------------------------------------
REVOKE ALL ON TABLE public.works FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.book_editions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.owned_copies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tbr_entries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.omnibus_contents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sommelier_preferences FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.goodreads_imports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.goodreads_import_rows FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tbr_discoveries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.metadata_sources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_metadata_claims FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_metadata_coverage FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.book_editions TO service_role;
GRANT SELECT ON TABLE public.book_editions TO authenticated;
GRANT ALL ON TABLE public.goodreads_import_rows TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.goodreads_import_rows TO authenticated;
GRANT ALL ON TABLE public.goodreads_imports TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.goodreads_imports TO authenticated;
GRANT ALL ON TABLE public.metadata_sources TO service_role;
GRANT SELECT ON TABLE public.metadata_sources TO authenticated;
GRANT ALL ON TABLE public.omnibus_contents TO service_role;
GRANT SELECT ON TABLE public.omnibus_contents TO authenticated;
GRANT ALL ON TABLE public.owned_copies TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.owned_copies TO authenticated;
GRANT ALL ON TABLE public.sommelier_preferences TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sommelier_preferences TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tbr_discoveries TO authenticated;
GRANT ALL ON TABLE public.tbr_discoveries TO service_role;
GRANT ALL ON TABLE public.tbr_entries TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tbr_entries TO authenticated;
GRANT ALL ON TABLE public.work_metadata_claims TO service_role;
GRANT SELECT ON TABLE public.work_metadata_claims TO authenticated;
GRANT ALL ON TABLE public.work_metadata_coverage TO service_role;
GRANT SELECT ON TABLE public.work_metadata_coverage TO authenticated;
GRANT ALL ON TABLE public.works TO service_role;
GRANT SELECT ON TABLE public.works TO authenticated;

-- ===============================================================
-- PART 2 — Catalog helpers
-- One book (same cleaned title + author) always gets the same work id,
-- whether it arrives from the Library or from Goodreads. That is what
-- lets a Goodreads TBR book become "Owned" the moment you buy it.
-- ===============================================================

-- Removes a Goodreads series suffix: "Haunting Adeline (Cat and Mouse Duet, #1)" -> "Haunting Adeline"
CREATE FUNCTION public.bookcellar_clean_title(p_title text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s*\([^()]*#\s*[0-9][^()]*\)\s*$', '')), '')
$$;

-- Comparison key: lowercase, punctuation and curly quotes ignored.
CREATE FUNCTION public.bookcellar_text_key(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT btrim(regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

CREATE FUNCTION public.bookcellar_title_key(p_title text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT public.bookcellar_text_key(public.bookcellar_clean_title(p_title))
$$;

-- Deterministic id for a work, from cleaned title + author.
CREATE FUNCTION public.bookcellar_work_uuid(p_title text, p_author text) RETURNS uuid
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT (substr(h,1,8)||'-'||substr(h,9,4)||'-'||substr(h,13,4)||'-'||substr(h,17,4)||'-'||substr(h,21,12))::uuid
  FROM (SELECT md5('bookcellar-work:' || public.bookcellar_title_key(p_title) || '|' || public.bookcellar_text_key(p_author)) AS h) x
$$;

-- Deterministic id for the edition that mirrors one Library row.
CREATE FUNCTION public.bookcellar_edition_uuid(p_book_id uuid) RETURNS uuid
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT (substr(h,1,8)||'-'||substr(h,9,4)||'-'||substr(h,13,4)||'-'||substr(h,17,4)||'-'||substr(h,21,12))::uuid
  FROM (SELECT md5('bookcellar-legacy-edition:' || p_book_id::text) AS h) x
$$;

-- Parses "(Series Name, #2)" into series name / position (NULLs when absent).
CREATE FUNCTION public.bookcellar_series_from_title(p_title text, OUT series_name text, OUT series_position numeric)
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT nullif(btrim(m[1]), ''),
         CASE WHEN m[2] ~ '^[0-9]+(\.[0-9]+)?$' THEN m[2]::numeric END
  FROM (SELECT regexp_match(coalesce(p_title, ''), '\(([^()]*?),?\s*#\s*([0-9]+(?:\.[0-9]+)?)[^()]*\)\s*$') AS m) x
$$;

REVOKE ALL ON FUNCTION public.bookcellar_clean_title(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bookcellar_text_key(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bookcellar_title_key(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bookcellar_work_uuid(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bookcellar_edition_uuid(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bookcellar_series_from_title(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookcellar_clean_title(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bookcellar_text_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bookcellar_title_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bookcellar_work_uuid(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bookcellar_edition_uuid(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bookcellar_series_from_title(text) TO authenticated, service_role;


-- ===============================================================
-- PART 3 — One-time bridge: copy existing Library books into the catalog
-- Only books.work_id is written on the books table. Nothing else in
-- books (ownership, read_status, covers, notes) is changed or deleted.
-- Several copies of the same book (e.g. special editions) share one work,
-- each with its own edition and owned copy.
-- ===============================================================

INSERT INTO public.works (id, title, sort_title, primary_author, authors, series_name, series_position, metadata_source)
SELECT DISTINCT ON (public.bookcellar_work_uuid(b.title, b.author))
  public.bookcellar_work_uuid(b.title, b.author),
  btrim(b.title),
  lower(btrim(b.title)),
  nullif(btrim(b.author), ''),
  CASE WHEN nullif(btrim(b.author), '') IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(btrim(b.author)) END,
  nullif(btrim(b.series), ''),
  CASE WHEN nullif(btrim(b.volume_number), '') ~ '^[0-9]+(\.[0-9]+)?$' THEN btrim(b.volume_number)::numeric END,
  'legacy_library_bridge'
FROM public.books b
WHERE b.work_id IS NULL
ORDER BY public.bookcellar_work_uuid(b.title, b.author), b.created_at NULLS LAST, b.id
ON CONFLICT (id) DO NOTHING;

UPDATE public.books b
SET work_id = public.bookcellar_work_uuid(b.title, b.author)
WHERE b.work_id IS NULL;

INSERT INTO public.book_editions (id, work_id, isbn13, isbn10, publisher, publication_year, format,
                                  edition_name, cover_image_url, special_features, metadata_source)
SELECT
  public.bookcellar_edition_uuid(b.id),
  b.work_id,
  CASE WHEN regexp_replace(coalesce(b.isbn, ''), '[^0-9Xx]', '', 'g') ~ '^[0-9]{13}$'
       THEN regexp_replace(b.isbn, '[^0-9Xx]', '', 'g') END,
  CASE WHEN regexp_replace(coalesce(b.isbn, ''), '[^0-9Xx]', '', 'g') ~ '^[0-9]{9}[0-9Xx]$'
       THEN upper(regexp_replace(b.isbn, '[^0-9Xx]', '', 'g')) END,
  nullif(btrim(b.publisher), ''),
  b.publication_year,
  b.format,
  nullif(btrim(b.edition_name), ''),
  nullif(btrim(b.cover_image_url), ''),
  nullif(btrim(b.special_features), ''),
  'legacy_library_bridge'
FROM public.books b
WHERE b.work_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.owned_copies (owner_id, work_id, edition_id, legacy_book_id)
SELECT b.owner_id, b.work_id, public.bookcellar_edition_uuid(b.id), b.id
FROM public.books b
WHERE b.work_id IS NOT NULL
ON CONFLICT (legacy_book_id) DO NOTHING;


-- ===============================================================
-- PART 4 — Keep the catalog in sync with the Library going forward
-- Adding, editing or deleting a Library book updates its catalog copy,
-- so "Owned" in TBR and the Sommelier never goes stale.
-- ===============================================================

-- Before a new Library book is saved: find or create its work.
CREATE FUNCTION public.bookcellar_books_assign_work() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_work uuid;
BEGIN
  IF NEW.work_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_work := public.bookcellar_work_uuid(NEW.title, NEW.author);

  INSERT INTO public.works (id, title, sort_title, primary_author, authors, series_name, series_position, metadata_source)
  VALUES (
    v_work,
    btrim(NEW.title),
    lower(btrim(NEW.title)),
    nullif(btrim(NEW.author), ''),
    CASE WHEN nullif(btrim(NEW.author), '') IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(btrim(NEW.author)) END,
    nullif(btrim(NEW.series), ''),
    CASE WHEN nullif(btrim(NEW.volume_number), '') ~ '^[0-9]+(\.[0-9]+)?$' THEN btrim(NEW.volume_number)::numeric END,
    'library'
  )
  ON CONFLICT (id) DO NOTHING;

  NEW.work_id := v_work;
  RETURN NEW;
END;
$$;

-- After a new Library book is saved: create its edition and owned copy.
CREATE FUNCTION public.bookcellar_books_create_copy() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  INSERT INTO public.book_editions (id, work_id, isbn13, isbn10, publisher, publication_year, format,
                                    edition_name, cover_image_url, special_features, metadata_source)
  VALUES (
    public.bookcellar_edition_uuid(NEW.id),
    NEW.work_id,
    CASE WHEN regexp_replace(coalesce(NEW.isbn, ''), '[^0-9Xx]', '', 'g') ~ '^[0-9]{13}$'
         THEN regexp_replace(NEW.isbn, '[^0-9Xx]', '', 'g') END,
    CASE WHEN regexp_replace(coalesce(NEW.isbn, ''), '[^0-9Xx]', '', 'g') ~ '^[0-9]{9}[0-9Xx]$'
         THEN upper(regexp_replace(NEW.isbn, '[^0-9Xx]', '', 'g')) END,
    nullif(btrim(NEW.publisher), ''),
    NEW.publication_year,
    NEW.format,
    nullif(btrim(NEW.edition_name), ''),
    nullif(btrim(NEW.cover_image_url), ''),
    nullif(btrim(NEW.special_features), ''),
    'library'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.owned_copies (owner_id, work_id, edition_id, legacy_book_id)
  VALUES (NEW.owner_id, NEW.work_id, public.bookcellar_edition_uuid(NEW.id), NEW.id)
  ON CONFLICT (legacy_book_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- After a Library book is edited: keep its edition details (cover, format, ISBN...) current.
-- Title/author edits keep the existing work link in this release.
CREATE FUNCTION public.bookcellar_books_update_copy() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  UPDATE public.book_editions e
  SET isbn13 = CASE WHEN regexp_replace(coalesce(NEW.isbn, ''), '[^0-9Xx]', '', 'g') ~ '^[0-9]{13}$'
                    THEN regexp_replace(NEW.isbn, '[^0-9Xx]', '', 'g') END,
      isbn10 = CASE WHEN regexp_replace(coalesce(NEW.isbn, ''), '[^0-9Xx]', '', 'g') ~ '^[0-9]{9}[0-9Xx]$'
                    THEN upper(regexp_replace(NEW.isbn, '[^0-9Xx]', '', 'g')) END,
      publisher = nullif(btrim(NEW.publisher), ''),
      publication_year = NEW.publication_year,
      format = NEW.format,
      edition_name = nullif(btrim(NEW.edition_name), ''),
      cover_image_url = nullif(btrim(NEW.cover_image_url), ''),
      special_features = nullif(btrim(NEW.special_features), '')
  WHERE e.id = public.bookcellar_edition_uuid(NEW.id);
  RETURN NEW;
END;
$$;

-- Before a Library book is deleted: remove its owned copy and mirrored edition,
-- so the book stops showing as "Owned". The work and any TBR entry stay.
CREATE FUNCTION public.bookcellar_books_delete_copy() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  DELETE FROM public.owned_copies WHERE legacy_book_id = OLD.id;
  DELETE FROM public.book_editions e
  WHERE e.id = public.bookcellar_edition_uuid(OLD.id)
    AND NOT EXISTS (SELECT 1 FROM public.owned_copies c WHERE c.edition_id = e.id);
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.bookcellar_books_assign_work() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bookcellar_books_create_copy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bookcellar_books_update_copy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bookcellar_books_delete_copy() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER books_assign_work BEFORE INSERT ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.bookcellar_books_assign_work();
CREATE TRIGGER books_create_copy AFTER INSERT ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.bookcellar_books_create_copy();
CREATE TRIGGER books_update_copy AFTER UPDATE OF isbn, publisher, publication_year, format, edition_name,
                                                cover_image_url, special_features ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.bookcellar_books_update_copy();
CREATE TRIGGER books_delete_copy BEFORE DELETE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.bookcellar_books_delete_copy();


-- ===============================================================
-- PART 5 — Goodreads import (the only client-facing database function)
-- Processes rows you approved in Goodreads Review:
--   * row linked to a Library book  -> adds that book to your TBR
--   * row not linked                -> creates the book in the catalog, then adds it to your TBR
--   * already in TBR                -> left exactly as it is (status unchanged)
--   * anything it can't safely do   -> row goes back to "Needs review" with the reason
-- Never edits Library books or ownership.
-- ===============================================================

CREATE FUNCTION public.import_goodreads_reading_batch(p_import_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_row         record;
  v_title       text;
  v_author      text;
  v_clean_title text;
  v_work_id     uuid;
  v_work_title  text;
  v_entry_id    uuid;
  v_series      record;
  v_reason      text;
  v_added       integer := 0;
  v_existing    integer := 0;
  v_new_books   integer := 0;
  v_skipped     jsonb   := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.goodreads_imports gi
    WHERE gi.id = p_import_id AND gi.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Import not found or not owned by the signed-in user';
  END IF;

  FOR v_row IN
    SELECT gir.id, gir.row_number, gir.raw_row, gir.proposed_status, gir.proposed_work_id, gir.resolution_notes
    FROM public.goodreads_import_rows gir
    WHERE gir.import_id = p_import_id
      AND gir.review_status = 'approved'
    ORDER BY gir.row_number
    FOR UPDATE
  LOOP
    v_reason := NULL;
    v_work_id := NULL;
    v_entry_id := NULL;

    SELECT max(j.value) FILTER (WHERE lower(j.key) = 'title'),
           max(j.value) FILTER (WHERE lower(j.key) = 'author')
    INTO v_title, v_author
    FROM jsonb_each_text(coalesce(v_row.raw_row, '{}'::jsonb)) j;

    v_author := nullif(btrim(v_author), '');
    v_clean_title := public.bookcellar_clean_title(v_title);

    IF v_clean_title IS NULL THEN
      v_reason := 'Missing title';
    ELSIF v_row.proposed_status IS NULL THEN
      v_reason := 'No reading status (custom Goodreads shelf)';
    ELSIF v_row.proposed_work_id IS NOT NULL THEN
      SELECT w.id, w.title INTO v_work_id, v_work_title
      FROM public.works w WHERE w.id = v_row.proposed_work_id;

      IF v_work_id IS NULL THEN
        v_reason := 'The matched Library book no longer exists';
      ELSIF public.bookcellar_title_key(v_work_title) <> public.bookcellar_title_key(v_title) THEN
        v_reason := 'Title does not match the linked Library book';
        v_work_id := NULL;
      END IF;
    ELSE
      v_work_id := public.bookcellar_work_uuid(v_title, v_author);
      SELECT * INTO v_series FROM public.bookcellar_series_from_title(v_title);

      INSERT INTO public.works (id, title, sort_title, primary_author, authors, series_name, series_position, metadata_source)
      VALUES (
        v_work_id,
        v_clean_title,
        lower(v_clean_title),
        v_author,
        CASE WHEN v_author IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_author) END,
        v_series.series_name,
        v_series.series_position,
        'goodreads_import'
      )
      ON CONFLICT (id) DO NOTHING;

      IF FOUND THEN
        v_new_books := v_new_books + 1;
      END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      UPDATE public.goodreads_import_rows
      SET review_status = 'needs_review',
          resolution_notes = 'Import skipped: ' || v_reason
            || coalesce(' | ' || nullif(regexp_replace(coalesce(v_row.resolution_notes, ''), '^Import skipped: [^|]*( \| )?', ''), ''), '')
      WHERE id = v_row.id;

      v_skipped := v_skipped || jsonb_build_object(
        'row_number', v_row.row_number,
        'title', coalesce(v_title, '(untitled)'),
        'reason', v_reason);
      CONTINUE;
    END IF;

    INSERT INTO public.tbr_entries (user_id, work_id, status, added_via)
    VALUES (v_user_id, v_work_id, v_row.proposed_status, 'goodreads_import')
    ON CONFLICT (user_id, work_id) DO NOTHING
    RETURNING id INTO v_entry_id;

    IF v_entry_id IS NULL THEN
      v_existing := v_existing + 1;
    ELSE
      v_added := v_added + 1;
    END IF;

    UPDATE public.goodreads_import_rows
    SET review_status = 'applied',
        proposed_work_id = v_work_id
    WHERE id = v_row.id;
  END LOOP;

  UPDATE public.goodreads_imports gi
  SET imported_count = gi.imported_count + v_added,
      skipped_count  = jsonb_array_length(v_skipped),
      status = CASE
                 WHEN NOT EXISTS (SELECT 1 FROM public.goodreads_import_rows r
                                  WHERE r.import_id = p_import_id
                                    AND r.review_status IN ('needs_review', 'approved'))
                 THEN 'completed' ELSE gi.status END,
      completed_at = CASE
                 WHEN NOT EXISTS (SELECT 1 FROM public.goodreads_import_rows r
                                  WHERE r.import_id = p_import_id
                                    AND r.review_status IN ('needs_review', 'approved'))
                 THEN now() ELSE gi.completed_at END
  WHERE gi.id = p_import_id;

  RETURN jsonb_build_object(
    'added', v_added,
    'already_in_tbr', v_existing,
    'new_books', v_new_books,
    'skipped', jsonb_array_length(v_skipped),
    'skipped_rows', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.import_goodreads_reading_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_goodreads_reading_batch(uuid) TO authenticated, service_role;

COMMIT;
