-- =====================================================================
-- THE BOOK CELLAR — Release 2a: AI book tagging
-- Small, additive update to the existing metadata tables:
--   * tags can come from an AI source, and a new "season" tag type
--   * two fixed sources: Claude (AI tagging) and My corrections
--   * two helper functions used ONLY by the server (service role):
--       sommelier_tagging_queue  -> which of my books still need tags
--       sommelier_save_tags      -> save one book's tags in one step
-- No existing rows are changed or deleted. Runs as one transaction.
-- =====================================================================

BEGIN;

-- Allow AI as a tag source
ALTER TABLE public.metadata_sources DROP CONSTRAINT metadata_sources_source_type_check;
ALTER TABLE public.metadata_sources ADD CONSTRAINT metadata_sources_source_type_check
  CHECK (source_type = ANY (ARRAY['official', 'bibliographic', 'professional_review', 'community', 'user', 'ai']));

-- Add "season" as a tag type
ALTER TABLE public.work_metadata_claims DROP CONSTRAINT work_metadata_claims_metadata_key_check;
ALTER TABLE public.work_metadata_claims ADD CONSTRAINT work_metadata_claims_metadata_key_check
  CHECK (metadata_key = ANY (ARRAY['genre', 'trope', 'mood', 'season', 'spice_level', 'content_warning', 'pacing', 'pov',
                                   'relationship_dynamic', 'tone', 'setting', 'audience', 'other']));

ALTER TABLE public.work_metadata_coverage DROP CONSTRAINT work_metadata_coverage_metadata_key_check;
ALTER TABLE public.work_metadata_coverage ADD CONSTRAINT work_metadata_coverage_metadata_key_check
  CHECK (metadata_key = ANY (ARRAY['genre', 'trope', 'mood', 'season', 'spice_level', 'content_warning', 'pacing', 'pov',
                                   'relationship_dynamic', 'tone', 'setting', 'audience', 'other']));

-- Fixed sources (ids are referenced by the app)
INSERT INTO public.metadata_sources (id, source_name, source_type, reliability_tier) VALUES
  ('5e1ec7ed-0000-4000-8000-00000000a1a1', 'Claude (AI tagging)', 'ai', 'medium'),
  ('5e1ec7ed-0000-4000-8000-00000000b2b2', 'My corrections', 'user', 'high')
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------
-- Which of a reader's books (owned or on their TBR) still need tags.
-- TBR books come first. Also returns the overall counts.
-- A book counts as "tagged" once the AI has looked at it, even if it
-- wasn't sure about the book (that's recorded in review_note).
-- ---------------------------------------------------------------
CREATE FUNCTION public.sommelier_tagging_queue(p_user_id uuid, p_limit integer)
RETURNS TABLE (work_id uuid, title text, primary_author text, series_name text, series_position numeric,
               description text, isbn text, total_count bigint, tagged_count bigint, unsure_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  WITH mine AS (
    SELECT c.work_id, false AS in_tbr FROM public.owned_copies c WHERE c.owner_id = p_user_id
    UNION ALL
    SELECT t.work_id, true AS in_tbr FROM public.tbr_entries t WHERE t.user_id = p_user_id
  ),
  books AS (
    SELECT m.work_id, bool_or(m.in_tbr) AS in_tbr,
           (SELECT cv.review_note FROM public.work_metadata_coverage cv
             WHERE cv.work_id = m.work_id AND cv.metadata_key = 'genre' AND cv.last_checked_at IS NOT NULL) AS note,
           EXISTS (SELECT 1 FROM public.work_metadata_coverage cv
                    WHERE cv.work_id = m.work_id AND cv.metadata_key = 'genre' AND cv.last_checked_at IS NOT NULL) AS tagged
    FROM mine m
    GROUP BY m.work_id
  ),
  counts AS (
    SELECT count(*) AS total_count,
           count(*) FILTER (WHERE tagged) AS tagged_count,
           count(*) FILTER (WHERE tagged AND note LIKE 'unsure%') AS unsure_count
    FROM books
  ),
  queue AS (
    SELECT b.work_id, b.in_tbr FROM books b WHERE NOT b.tagged
  )
  SELECT w.id, w.title, w.primary_author, w.series_name, w.series_position, w.description,
         (SELECT coalesce(e.isbn13, e.isbn10) FROM public.book_editions e
           WHERE e.work_id = w.id AND coalesce(e.isbn13, e.isbn10) IS NOT NULL
           ORDER BY e.id LIMIT 1),
         counts.total_count, counts.tagged_count, counts.unsure_count
  FROM counts
  LEFT JOIN queue q ON true
  LEFT JOIN public.works w ON w.id = q.work_id
  ORDER BY q.in_tbr DESC NULLS LAST, w.title NULLS LAST, w.id
  LIMIT greatest(p_limit, 1)
$$;


-- ---------------------------------------------------------------
-- Save one book's AI tags in one step: replaces that book's previous
-- AI tags (never touches your own corrections) and marks it as tagged.
-- p_tags = {"genre":[...], "trope":[...], "mood":[...], "season":[...],
--           "content_warning":[...], "spice_level":"3" or null}
-- ---------------------------------------------------------------
CREATE FUNCTION public.sommelier_save_tags(p_work_id uuid, p_tags jsonb, p_confidence text, p_note text)
RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_ai_source constant uuid := '5e1ec7ed-0000-4000-8000-00000000a1a1';
  v_key   text;
  v_count integer := 0;
BEGIN
  IF p_confidence NOT IN ('high', 'medium', 'low') THEN
    RAISE EXCEPTION 'Invalid confidence %', p_confidence;
  END IF;

  DELETE FROM public.work_metadata_claims
  WHERE work_id = p_work_id AND source_id = v_ai_source;

  FOREACH v_key IN ARRAY ARRAY['genre', 'trope', 'mood', 'season', 'content_warning'] LOOP
    INSERT INTO public.work_metadata_claims (work_id, metadata_key, value, source_id, confidence, review_status, evidence_note)
    SELECT p_work_id, v_key, btrim(v.value), v_ai_source, p_confidence, 'accepted', p_note
    FROM jsonb_array_elements_text(coalesce(p_tags -> v_key, '[]'::jsonb)) AS v(value)
    WHERE btrim(v.value) <> ''
    ON CONFLICT DO NOTHING;
    v_count := v_count + (SELECT count(*) FROM public.work_metadata_claims
                          WHERE work_id = p_work_id AND source_id = v_ai_source AND metadata_key = v_key);
  END LOOP;

  IF p_tags ->> 'spice_level' ~ '^[0-5]$' THEN
    INSERT INTO public.work_metadata_claims (work_id, metadata_key, value, source_id, confidence, review_status, evidence_note)
    VALUES (p_work_id, 'spice_level', p_tags ->> 'spice_level', v_ai_source, p_confidence, 'accepted', p_note);
    v_count := v_count + 1;
  END IF;

  INSERT INTO public.work_metadata_coverage (work_id, metadata_key, coverage_status, source_count, last_checked_at, review_note, updated_at)
  SELECT p_work_id, k, 'partial', 1, now(), p_note, now()
  FROM unnest(ARRAY['genre', 'trope', 'mood', 'season', 'spice_level', 'content_warning']) AS k
  ON CONFLICT (work_id, metadata_key) DO UPDATE
    SET coverage_status = 'partial', last_checked_at = now(), review_note = excluded.review_note, updated_at = now();

  RETURN v_count;
END;
$$;

-- Server-only: the browser can never call these.
REVOKE ALL ON FUNCTION public.sommelier_tagging_queue(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sommelier_save_tags(uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sommelier_tagging_queue(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.sommelier_save_tags(uuid, jsonb, text, text) TO service_role;

COMMIT;
