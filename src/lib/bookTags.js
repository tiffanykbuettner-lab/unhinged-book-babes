// Loads every book's Sommelier tags and groups them by book.
// Your own corrections (when added later) win over the AI's tags.

import { supabase } from './supabase'
import { fetchAll } from './fetchAll'
import { MY_TAG_SOURCE_ID } from './tagVocabulary'

const emptyTags = () => ({ genre: [], trope: [], mood: [], season: [], content_warning: [], spice_level: null })

export async function loadBookTags() {
  const { data, error } = await fetchAll(() => supabase
    .from('work_metadata_claims')
    .select('id, work_id, metadata_key, value, source_id, confidence')
    .in('metadata_key', ['genre', 'trope', 'mood', 'season', 'content_warning', 'spice_level'])
    .order('id', { ascending: true }))

  if (error) return { tagsByWork: new Map(), error }

  // If you've corrected a tag type for a book, only your version of that type is used.
  const correctedKeys = new Set(
    (data || []).filter(row => row.source_id === MY_TAG_SOURCE_ID).map(row => `${row.work_id}|${row.metadata_key}`))

  const tagsByWork = new Map()
  for (const row of data || []) {
    if (row.source_id !== MY_TAG_SOURCE_ID && correctedKeys.has(`${row.work_id}|${row.metadata_key}`)) continue
    if (!tagsByWork.has(row.work_id)) tagsByWork.set(row.work_id, emptyTags())
    const tags = tagsByWork.get(row.work_id)
    if (row.metadata_key === 'spice_level') tags.spice_level = Number(row.value)
    else if (!tags[row.metadata_key].includes(row.value)) tags[row.metadata_key].push(row.value)
  }
  return { tagsByWork, error: null }
}
