// Supabase returns at most 1,000 rows per request by default. Anything past that
// is silently left out. fetchAll keeps asking for the next 1,000 until it has
// every row, so large catalogs (e.g. after a big Goodreads import) load completely.
//
// Usage:
//   const { data, error } = await fetchAll(() =>
//     supabase.from('works').select('id, title').order('title').order('id'))
//
// Pass a function that builds a fresh query each time, and always include a
// unique final .order(...) (like 'id') so pages never overlap or skip rows.

const PAGE_SIZE = 1000

export async function fetchAll(buildQuery) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return { data: rows, error: null }
}
