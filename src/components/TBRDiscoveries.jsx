
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'

const statuses = [
  { value: 'want_to_read', label: 'Want to read' },
  { value: 'currently_reading', label: 'Currently reading' },
  { value: 'read', label: 'Read' },
  { value: 'paused_dnf', label: 'Paused / DNF' },
]

const inputStyle = {
  padding: '11px 13px',
  borderRadius: '10px',
  border: `1px solid ${T.goldBorder}`,
  background: T.surface,
  color: T.white,
  fontSize: '14px',
}

const buttonStyle = {
  padding: '10px 14px',
  borderRadius: '9px',
  border: `1px solid ${T.goldBorder}`,
  background: T.surface,
  color: T.goldLight,
  cursor: 'pointer',
  fontSize: '13px',
}

function getIsbn(volumeInfo, type) {
  return volumeInfo.industryIdentifiers?.find(item => item.type === type)?.identifier || null
}

function getYear(publishedDate) {
  const match = publishedDate?.match(/^\d{4}/)
  return match ? Number(match[0]) : null
}

function scoreBookResult(item, searchTerm) {
  const volume = item.volumeInfo ?? {}
  const normalize = value =>
    (value ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

  const term = normalize(searchTerm)
  const title = normalize(volume.title)
  const authors = normalize((volume.authors ?? []).join(' '))
  const words = term.split(' ').filter(Boolean)

  let score = 0

  if (title === term) score += 100
  else if (title.startsWith(term)) score += 60
  else if (title.includes(term)) score += 40
  else {
    const matchedWords = words.filter(word => title.includes(word)).length
    score += matchedWords * 8
  }

  if (authors.includes(term)) score += 35
  else if (words.some(word => authors.includes(word))) score += 5

  // Prefer standalone books over box sets, collections, and companion items.
  if (/\b(box set|collection|boxed set|omnibus|coloring book|tarot|companion guide|workbook)\b/i.test(volume.title ?? '')) {
    score -= 35
  }

  return score
}


export default function TBRDiscoveries() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [discoveries, setDiscoveries] = useState([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [loadingSaved, setLoadingSaved] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadDiscoveries() {
    setLoadingSaved(true)
    setError('')

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!authData?.user) throw new Error('Please sign in to view your discoveries.')

      const { data, error: queryError } = await supabase
        .from('tbr_discoveries')
        .select('*')
        .eq('user_id', authData.user.id)
        .order('created_at', { ascending: false })

      if (queryError) throw queryError
      setDiscoveries(data ?? [])
    } catch (err) {
      setError(err?.message || 'Could not load your discoveries.')
    } finally {
      setLoadingSaved(false)
    }
  }

  useEffect(() => {
    loadDiscoveries()
  }, [])

  
  async function searchBooks(event) {
    event.preventDefault()
    const term = query.trim()
    if (!term) return

    setLoadingSearch(true)
    setError('')
    setNotice('')
    setResults([])

    try {
      let foundBooks = []
      let searchSource = 'google_books'

      // Try Google Books first.
      try {
        const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(term)}&maxResults=12&printType=books`
        const response = await fetch(url)

        if (response.ok) {
          const data = await response.json()
          foundBooks = (data.items ?? []).map(item => ({
            ...item,
            source: 'google_books',
          }))
        }
      } catch {
        // Try the fallback below.
      }

      // Fall back to Open Library if Google Books is unavailable
      // or returns no results.
      if (foundBooks.length === 0) {
        searchSource = 'open_library'

        const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(term)}&fields=key,title,author_name,first_publish_year,publisher,isbn,cover_i,edition_key&limit=12`
        const response = await fetch(url)

        if (!response.ok) {
          throw new Error('Both book search providers are temporarily unavailable. Please try again later.')
        }

        const data = await response.json()

        foundBooks = (data.docs ?? []).map(book => {
          const identifiers = (book.isbn ?? []).map(isbn => ({
            type: /^\d{13}$/.test(isbn) ? 'ISBN_13' : 'ISBN_10',
            identifier: isbn,
          }))

          return {
            id: `openlibrary:${book.key}`,
            source: 'open_library',
            volumeInfo: {
              title: book.title,
              authors: book.author_name ?? [],
              publisher: book.publisher?.[0] ?? null,
              publishedDate: book.first_publish_year
                ? String(book.first_publish_year)
                : null,
              industryIdentifiers: identifiers,
              printType: 'BOOK',
              imageLinks: book.cover_i
                ? {
                    thumbnail: `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`,
                  }
                : undefined,
            },
          }
        })
      }

      const rankedBooks = foundBooks
  	.map((item, index) => ({
    	  item,
    	  index,
    	  score: scoreBookResult(item, term),
  	}))
  	.sort((a, b) => b.score - a.score || a.index - b.index)
  	.map(result => result.item)

      setResults(rankedBooks)

      if (foundBooks.length > 0) {
        setNotice(
          searchSource === 'open_library'
            ? 'Showing results from Open Library because Google Books was unavailable or had no matches.'
            : ''
        )
      } else {
        setNotice('No matches found. Try a different title or author.')
      }
    } catch (err) {
      setError(err?.message || 'Could not search for books. Please try again.')
    } finally {
      setLoadingSearch(false)
    }
  }


  async function saveDiscovery(item) {
    const volume = item.volumeInfo ?? {}
    const title = volume.title?.trim()
    if (!title) {
      setError('This search result has no title and cannot be saved.')
      return
    }

    setBusyId(item.id)
    setError('')
    setNotice('')

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      const user = authData?.user
      if (!user) throw new Error('Please sign in before saving a discovery.')

      const { data: existing, error: existingError } = await supabase
        .from('tbr_discoveries')
        .select('id, title')
        .eq('user_id', user.id)
        .eq('external_source', item.source || 'google_books')
        .eq('external_id', item.id)
        .maybeSingle()

      if (existingError) throw existingError
      if (existing) {
        setNotice(`"${existing.title}" is already in your discoveries.`)
        return
      }

      const cover = volume.imageLinks?.thumbnail?.replace(/^http:/, 'https:') || null
      const payload = {
        user_id: user.id,
        title,
        author: volume.authors?.join(', ') || null,
        isbn_10: getIsbn(volume, 'ISBN_10'),
        isbn_13: getIsbn(volume, 'ISBN_13'),
        publisher: volume.publisher || null,
        publication_year: getYear(volume.publishedDate),
        book_format: volume.printType?.toLowerCase() || null,
        cover_image_url: cover,
        external_source: item.source || 'google_books',
        external_id: item.id,
        status: 'want_to_read',
      }

      const { data, error: insertError } = await supabase
        .from('tbr_discoveries')
        .insert(payload)
        .select('*')
        .single()

      if (insertError) throw insertError
      setDiscoveries(current => [data, ...current])
      setNotice(`Added "${title}" to your TBR discoveries. It has not been added to your Library.`)
    } catch (err) {
      setError(err?.message || 'Could not save this discovery.')
    } finally {
      setBusyId(null)
    }
  }

  async function updateStatus(book, nextStatus) {
    setBusyId(book.id)
    setError('')
    setNotice('')

    try {
      const { data, error: updateError } = await supabase
        .from('tbr_discoveries')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', book.id)
        .select('*')
        .single()

      if (updateError) throw updateError
      setDiscoveries(current => current.map(item => item.id === data.id ? data : item))
      setNotice(`Updated "${book.title}" to ${statuses.find(item => item.value === nextStatus)?.label || nextStatus}.`)
    } catch (err) {
      setError(err?.message || 'Could not update the reading status.')
    } finally {
      setBusyId(null)
    }
  }

  async function removeDiscovery(book) {
    if (!window.confirm(`Remove "${book.title}" from your TBR discoveries? Your Library will not be changed.`)) return

    setBusyId(book.id)
    setError('')
    setNotice('')

    try {
      const { error: deleteError } = await supabase
        .from('tbr_discoveries')
        .delete()
        .eq('id', book.id)

      if (deleteError) throw deleteError
      setDiscoveries(current => current.filter(item => item.id !== book.id))
      setNotice(`Removed "${book.title}" from your discoveries. Your Library is unchanged.`)
    } catch (err) {
      setError(err?.message || 'Could not remove this discovery.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section style={{ marginTop: '36px' }}>
      <div style={{ marginBottom: '18px' }}>
        <p style={{ color: T.gold, letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: '12px' }}>
          For your next bookish obsession
        </p>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '27px', color: T.white, margin: '6px 0' }}>
          Find a Book
        </h2>
        <p style={{ color: T.muted, lineHeight: 1.6, maxWidth: '650px' }}>
          Search titles or authors, review the editions, and save books you want to read.
          These discoveries stay separate from your owned Library.
        </p>
      </div>

      {error && (
        <div role="alert" style={{ padding: '12px 14px', marginBottom: '14px', border: '1px solid #b66a6a', borderRadius: '10px', color: '#ffb8b8' }}>
          {error}
        </div>
      )}
      {notice && (
        <div role="status" style={{ padding: '12px 14px', marginBottom: '14px', border: `1px solid ${T.goldBorder}`, borderRadius: '10px', color: T.goldLight }}>
          {notice}
        </div>
      )}

      <form onSubmit={searchBooks} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
        <input
          aria-label="Search Google Books by title or author"
          placeholder="Search a title or author..."
          value={query}
          onChange={event => setQuery(event.target.value)}
          style={{ ...inputStyle, flex: '1 1 260px', minWidth: 0 }}
        />
        <button type="submit" disabled={loadingSearch || !query.trim()} style={buttonStyle}>
          {loadingSearch ? 'Searching…' : 'Search books'}
        </button>
      </form>

      {results.length > 0 && (
        <>
          <h3 style={{ color: T.goldLight, fontFamily: 'Georgia, serif', fontSize: '20px' }}>
            Review search results
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
            {results.map(item => {
              const volume = item.volumeInfo ?? {}
              const alreadySaved = discoveries.some(book =>
  		book.external_source === (item.source || 'google_books') &&
  		book.external_id === item.id
	      )

              return (
                <article key={item.id} style={{ display: 'flex', flexDirection: 'column', background: T.surface, border: `1px solid ${T.goldBorder}`, borderRadius: '13px', overflow: 'hidden' }}>
                  {volume.imageLinks?.thumbnail ? (
                    <img
                      src={volume.imageLinks.thumbnail.replace(/^http:/, 'https:')}
                      alt={`Cover of ${volume.title || 'book'}`}
                      loading="lazy"
                      style={{ width: '100%', height: '170px', objectFit: 'contain', padding: '10px', boxSizing: 'border-box', background: 'rgba(0,0,0,0.12)' }}
                    />
                  ) : (
                    <div aria-hidden="true" style={{ height: '80px', display: 'grid', placeItems: 'center', fontSize: '30px' }}>📖</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px', flex: 1 }}>
                    <h4 style={{ color: T.white, fontFamily: 'Georgia, serif', fontSize: '17px', lineHeight: 1.3, margin: 0 }}>
                      {volume.title || 'Untitled book'}
                    </h4>
                    <p style={{ color: T.muted, fontSize: '13px', margin: 0 }}>
                      {volume.authors?.join(', ') || 'Author not listed'}
                    </p>
                    {volume.publisher && <p style={{ color: T.subtle, fontSize: '12px', margin: 0 }}>{volume.publisher}</p>}
                    {volume.publishedDate && <p style={{ color: T.subtle, fontSize: '12px', margin: 0 }}>Published {volume.publishedDate}</p>}
                    {volume.industryIdentifiers?.slice(0, 2).map(identifier => (
 		      <p key={`${identifier.type}-${identifier.identifier}`} style={{ color: T.subtle, fontSize: '11px', margin: 0 }}>
    			{identifier.type.replace('_', ' ')}: {identifier.identifier}
  		      </p>
		    ))}
                    <button
                      type="button"
                      disabled={busyId === item.id || alreadySaved}
                      onClick={() => saveDiscovery(item)}
                      style={{ ...buttonStyle, marginTop: 'auto', opacity: alreadySaved ? 0.65 : 1 }}
                    >
                      {alreadySaved
  			? 'Added to your TBR'
  			: busyId === item.id
   			  ? 'Saving…'
   			  : '+ Add to My TBR'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

      <div style={{ marginTop: '32px' }}>
        <h3 style={{ color: T.goldLight, fontFamily: 'Georgia, serif', fontSize: '22px' }}>
          My unowned discoveries
        </h3>
        {loadingSaved ? (
          <p style={{ color: T.muted }}>Loading your discoveries…</p>
        ) : discoveries.length === 0 ? (
          <p style={{ color: T.muted }}>No discoveries saved yet. Search above to find your next read.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
            {discoveries.map(book => (
              <article key={book.id} style={{ display: 'flex', flexDirection: 'column', background: T.surface, border: `1px solid ${T.goldBorder}`, borderRadius: '13px', overflow: 'hidden' }}>
                {book.cover_image_url ? (
                  <img src={book.cover_image_url} alt={`Cover of ${book.title}`} loading="lazy" style={{ width: '100%', height: '170px', objectFit: 'contain', padding: '10px', boxSizing: 'border-box', background: 'rgba(0,0,0,0.12)' }} />
                ) : (
                  <div aria-hidden="true" style={{ height: '80px', display: 'grid', placeItems: 'center', fontSize: '30px' }}>📖</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px', flex: 1 }}>
                  <h4 style={{ color: T.white, fontFamily: 'Georgia, serif', fontSize: '17px', lineHeight: 1.3, margin: 0 }}>{book.title}</h4>
                  {book.author && <p style={{ color: T.muted, fontSize: '13px', margin: 0 }}>{book.author}</p>}
                  {book.publisher && <p style={{ color: T.subtle, fontSize: '12px', margin: 0 }}>{book.publisher}</p>}
                  {book.publication_year && <p style={{ color: T.subtle, fontSize: '12px', margin: 0 }}>Published {book.publication_year}</p>}
                  <span style={{ color: T.goldLight, fontSize: '12px' }}>Not owned yet</span>
                  <label style={{ color: T.muted, fontSize: '12px' }}>
                    Reading status
                    <select
                      aria-label={`Reading status for ${book.title}`}
                      value={book.status}
                      disabled={busyId === book.id}
                      onChange={event => updateStatus(book, event.target.value)}
                      style={{ ...inputStyle, width: '100%', marginTop: '6px', boxSizing: 'border-box' }}
                    >
                      {statuses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={busyId === book.id} onClick={() => removeDiscovery(book)} style={{ ...buttonStyle, marginTop: 'auto', color: T.muted }}>
                    {busyId === book.id ? 'Saving…' : 'Remove discovery'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
