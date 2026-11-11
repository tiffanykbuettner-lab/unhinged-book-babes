// Goodreads ↔ Library matching rules, shared by Goodreads Import and Goodreads Review.
// Kept in its own file so both pages use exactly the same rules.

export function valueFor(raw, name) {
  const key = Object.keys(raw).find(item => item.toLowerCase() === name.toLowerCase())
  return key ? (raw[key] ?? '') : ''
}

export function cleanISBN(value) {
  return (value ?? '').replace(/^="?|"?$/g, '').replace(/[^0-9x]/gi, '')
}

export function normalizeText(value) {
  return (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Goodreads adds the series to the title: "Haunting Adeline (Cat and Mouse Duet, #1)".
// Your Library stores just "Haunting Adeline", so the suffix is removed before matching.
// The database uses the same rule (bookcellar_clean_title).
export function cleanGoodreadsTitle(value) {
  return (value ?? '').replace(/\s*\([^()]*#\s*[0-9][^()]*\)\s*$/, '').trim()
}

export function findCatalogMatch(raw, catalog) {
  const title = normalizeText(cleanGoodreadsTitle(valueFor(raw, 'Title')))
  const author = normalizeText(valueFor(raw, 'Author'))
  const isbns = [cleanISBN(valueFor(raw, 'ISBN13')), cleanISBN(valueFor(raw, 'ISBN'))].filter(Boolean)

  if (!title) return { confidence: 'unmatched', book: null, reason: 'Missing title' }

  const candidates = (catalog || []).map(book => {
    const sameTitle = title === normalizeText(cleanGoodreadsTitle(book.title))
    const bookAuthor = normalizeText(book.author)
    const sameAuthor = !!author && !!bookAuthor && author === bookAuthor
    const authorConflict = !!author && !!bookAuthor && author !== bookAuthor
    const bookISBN = cleanISBN(book.isbn)
    const sameISBN = !!bookISBN && isbns.includes(bookISBN)
    return { book, sameTitle, sameAuthor, authorConflict, sameISBN }
  })

  const exact = candidates.find(m => m.sameTitle && m.sameAuthor && m.sameISBN)
  if (exact) return { confidence: 'high', book: exact.book, reason: 'Title, author and ISBN match' }

  const titleAuthor = candidates.find(m => m.sameTitle && m.sameAuthor)
  if (titleAuthor) return {
    confidence: 'high',
    book: titleAuthor.book,
    reason: titleAuthor.sameISBN ? 'Title, author and ISBN match' : 'Title and author match'
  }

  const conflictingAuthor = candidates.find(m => m.sameTitle && m.authorConflict)
  if (conflictingAuthor) return {
    confidence: 'low',
    book: conflictingAuthor.book,
    reason: conflictingAuthor.sameISBN
      ? 'Title and ISBN match, but author differs — manual verification required'
      : 'Title matches, but author differs — possible different book; manual verification required'
  }

  const titleOnly = candidates.find(m => m.sameTitle)
  if (titleOnly) return {
    confidence: 'low',
    book: titleOnly.book,
    reason: 'Title matches, but author information is incomplete — manual verification required'
  }

  return { confidence: 'unmatched', book: null, reason: 'No likely Library match' }
}
