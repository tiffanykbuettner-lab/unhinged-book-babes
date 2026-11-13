// Helpers for the book-tagging server function.
// Files in api/_lib are not web addresses; only api/tag-books.js is.

import { TAG_VOCABULARY } from '../../src/lib/tagVocabulary.js'

export const TAG_TOOL_NAME = 'save_book_tags'

const listOf = values => ({ type: 'array', items: { type: 'string', enum: values } })

// The AI must answer by "filling in this form", so every answer has the same
// shape and can only use tags from the list.
export function tagTool() {
  return {
    name: TAG_TOOL_NAME,
    description: 'Save reader-facing tags for each book in the batch.',
    input_schema: {
      type: 'object',
      properties: {
        books: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ref: { type: 'integer', description: 'The ref number given for the book.' },
              knows_book: { type: 'boolean', description: 'True only if you genuinely recognise this specific book.' },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              genres: listOf(TAG_VOCABULARY.genre),
              tropes: listOf(TAG_VOCABULARY.trope),
              moods: listOf(TAG_VOCABULARY.mood),
              seasons: listOf(TAG_VOCABULARY.season),
              content_warnings: listOf(TAG_VOCABULARY.content_warning),
              spice: { type: ['integer', 'null'], minimum: 0, maximum: 5 },
              note: { type: 'string', description: 'One short sentence on what the tags are based on.' },
            },
            required: ['ref', 'knows_book', 'confidence', 'genres', 'tropes', 'moods', 'seasons', 'content_warnings', 'spice', 'note'],
          },
        },
      },
      required: ['books'],
    },
  }
}

export const SYSTEM_PROMPT = `You tag books for a private reading app owned by a romance-loving reader.
For each book, choose tags ONLY from the allowed lists in the form.

Rules:
- Base tags on what you actually know about this specific book (title + author), plus the description if one is given.
- If you do not genuinely recognise the book, set knows_book=false and confidence="low", tag only what the description clearly supports, and set spice to null. Never invent details.
- spice: 0 closed door, 1 kissing only, 2 mild, 3 open door, 4 spicy, 5 very explicit "smut". Use null when unsure.
- seasons and seasonal tropes (christmas, spooky season, fall / autumn, holiday): only when the book is set in or strongly tied to that season.
- content_warnings: include each one that applies; they are shown to the reader as trigger warnings, so be thorough but accurate. "cliffhanger ending" and "unfinished series" are useful reader warnings too.
- Prefer the 1-2 most fitting genres and the 2-6 most defining tropes; don't list every loosely related tag.
- note: one short sentence, e.g. "Well-known 2023 hockey romance" or "Unfamiliar book; tagged from description only".`

export function buildUserPrompt(books) {
  const lines = books.map((book, index) => {
    const parts = [
      `ref ${index}: "${book.title}"${book.primary_author ? ` by ${book.primary_author}` : ''}`,
      book.series_name ? `  series: ${book.series_name}${book.series_position != null ? ` #${book.series_position}` : ''}` : '',
      book.description ? `  description: ${String(book.description).replace(/\s+/g, ' ').slice(0, 1200)}` : '  description: (none available)',
    ]
    return parts.filter(Boolean).join('\n')
  })
  return `Tag these ${books.length} books:\n\n${lines.join('\n\n')}`
}

const onlyAllowed = (values, allowed) =>
  [...new Set((Array.isArray(values) ? values : []).filter(value => allowed.includes(value)))]

// Turns the AI's answer into one save-ready record per book.
// Books the AI skipped are returned as "unsure" so they aren't retried forever.
export function parseTagResponse(apiResponse, books) {
  const block = (apiResponse?.content || []).find(item => item.type === 'tool_use' && item.name === TAG_TOOL_NAME)
  const answers = Array.isArray(block?.input?.books) ? block.input.books : []
  const byRef = new Map(answers.map(answer => [Number(answer.ref), answer]))

  return books.map((book, index) => {
    const answer = byRef.get(index)
    if (!answer) {
      return { book, tags: { genre: [], trope: [], mood: [], season: [], content_warning: [], spice_level: null },
               confidence: 'low', note: 'unsure: the AI did not return tags for this book', knows: false }
    }
    const knows = answer.knows_book === true
    const confidence = ['high', 'medium', 'low'].includes(answer.confidence) ? answer.confidence : 'low'
    const spice = Number.isInteger(answer.spice) && answer.spice >= 0 && answer.spice <= 5 ? String(answer.spice) : null
    const note = String(answer.note || '').trim().slice(0, 300) || (knows ? 'AI tagged' : 'Tagged from description only')
    return {
      book,
      knows,
      confidence: knows ? confidence : 'low',
      note: knows ? note : `unsure: ${note}`,
      tags: {
        genre: onlyAllowed(answer.genres, TAG_VOCABULARY.genre),
        trope: onlyAllowed(answer.tropes, TAG_VOCABULARY.trope),
        mood: onlyAllowed(answer.moods, TAG_VOCABULARY.mood),
        season: onlyAllowed(answer.seasons, TAG_VOCABULARY.season),
        content_warning: onlyAllowed(answer.content_warnings, TAG_VOCABULARY.content_warning),
        spice_level: knows ? spice : null,
      },
    }
  })
}

// Looks up a book description from Google Books (free, no key needed for light use).
// Returns '' if nothing useful is found or the lookup is slow.
export async function fetchDescription(book, fetchImpl = fetch) {
  const query = book.isbn
    ? `isbn:${book.isbn}`
    : `intitle:${book.title}${book.primary_author ? `+inauthor:${book.primary_author}` : ''}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetchImpl(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3&printType=books`,
      { signal: controller.signal })
    if (!response.ok) return ''
    const data = await response.json()
    const withText = (data.items || []).map(item => item.volumeInfo?.description || '').find(text => text.length > 80)
    return withText ? withText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000) : ''
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}
