import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'
import BarcodeScanner from '../components/BarcodeScanner'
import CoverUpload from '../components/CoverUpload'
import Autocomplete from '../components/Autocomplete'

export default function Library() {
  const [books, setBooks] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showBulkScanner, setShowBulkScanner] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)
  const [user, setUser] = useState(null)
  const [search, setSearch] = useState('')
  const [formatFilter, setFormatFilter] = useState('all')
  const [editionFilter, setEditionFilter] = useState('all')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      fetchBooks(user.id)
    })
  }, [])

  useEffect(() => {
    let result = books
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(b =>
        b.title?.toLowerCase().includes(q) ||
        b.author?.toLowerCase().includes(q) ||
        b.series?.toLowerCase().includes(q) ||
        b.edition_name?.toLowerCase().includes(q)
      )
    }
    if (formatFilter !== 'all') {
      if (formatFilter === 'physical') {
        result = result.filter(b => b.format === 'hardcover' || b.format === 'paperback')
      } else {
        result = result.filter(b => b.format === formatFilter)
      }
    }
    if (editionFilter !== 'all') {
      result = result.filter(b => b.edition_name?.toLowerCase().includes(editionFilter.toLowerCase()))
    }
    setFiltered(result)
  }, [search, books, formatFilter, editionFilter])

  async function fetchBooks(userId) {
    const { data } = await supabase
      .from('books').select('*').eq('owner_id', userId)
      .order('created_at', { ascending: false })
    setBooks(data || [])
    setFiltered(data || [])
    setLoading(false)
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: T.bg, minHeight: '100vh' }}>
      <div style={{ background: T.header, padding: '24px 20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h1 style={{ color: T.white, margin: 0, fontSize: '24px', fontWeight: 'bold' }}>📖 My Library</h1>
            <p style={{ color: T.tealLight, margin: '4px 0 0', fontSize: '13px' }}>
              {filtered.length} of {books.length} {books.length === 1 ? 'book' : 'books'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowBulkScanner(true)} style={{ background: T.goldDim, color: T.goldLight, border: `1px solid ${T.goldBorder}`, borderRadius: '20px', padding: '10px 14px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
              📚 Bulk Scan
            </button>
            <button onClick={() => setShowAdd(true)} style={{ background: T.teal, color: T.white, border: 'none', borderRadius: '20px', padding: '10px 18px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', boxShadow: '0 4px 15px rgba(13,148,136,0.4)' }}>
              + Add
            </button>
          </div>
        </div>

        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, author, series..."
            style={{ width: '100%', padding: '12px 16px 12px 40px', borderRadius: '12px', border: `1px solid ${T.tealBorder}`, background: 'rgba(255,255,255,0.05)', color: T.white, fontSize: '14px', boxSizing: 'border-box', outline: 'none', fontFamily: 'Georgia, serif' }} />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          {[
            { value: 'all', label: '📚 All' },
            { value: 'physical', label: '📖 Physical' },
            { value: 'ebook', label: '📱 Ebook' },
            { value: 'audiobook', label: '🎧 Audio' },
          ].map(f => (
            <button key={f.value} onClick={() => setFormatFilter(f.value)} style={{
              padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontFamily: 'Georgia, serif', fontSize: '12px', fontWeight: 'bold',
              background: formatFilter === f.value ? T.teal : 'rgba(255,255,255,0.08)',
              color: formatFilter === f.value ? T.white : T.muted,
              boxShadow: formatFilter === f.value ? '0 2px 8px rgba(13,148,136,0.4)' : 'none',
              transition: 'all 0.2s'
            }}>
              {f.label}
            </button>
          ))}
        </div>

        {books.some(b => b.edition_name) && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => setEditionFilter('all')} style={{
              padding: '5px 12px', borderRadius: '20px', border: `1px solid ${T.goldBorder}`, cursor: 'pointer',
              fontFamily: 'Georgia, serif', fontSize: '11px', fontWeight: 'bold',
              background: editionFilter === 'all' ? T.goldDim : 'transparent',
              color: editionFilter === 'all' ? T.goldLight : T.muted,
              transition: 'all 0.2s'
            }}>✨ All Editions</button>
            {[...new Set(books.filter(b => b.edition_name).map(b => {
              const name = b.edition_name.toLowerCase()
              if (name.includes('fairyloot')) return 'Fairyloot'
              if (name.includes('illumicrate')) return 'Illumicrate'
              if (name.includes('b&n') || name.includes('barnes')) return 'B&N'
              if (name.includes('signed')) return 'Signed'
              if (name.includes('first')) return 'First Edition'
              return b.edition_name.split(' ').slice(0, 2).join(' ')
            }))].map(edition => (
              <button key={edition} onClick={() => setEditionFilter(edition)} style={{
                padding: '5px 12px', borderRadius: '20px', border: `1px solid ${T.goldBorder}`, cursor: 'pointer',
                fontFamily: 'Georgia, serif', fontSize: '11px', fontWeight: 'bold',
                background: editionFilter === edition ? T.goldDim : 'transparent',
                color: editionFilter === edition ? T.goldLight : T.muted,
                transition: 'all 0.2s'
              }}>
                {edition}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '16px' }}>
        {loading ? (
          <p style={{ color: T.muted, textAlign: 'center', marginTop: '40px' }}>Loading your library...</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📖</div>
            <h3 style={{ color: T.white, marginBottom: '8px' }}>{search ? 'No books found' : 'Your library is empty'}</h3>
            <p style={{ color: T.muted, fontSize: '14px' }}>{search ? 'Try a different search term' : 'Add your first book to get started!'}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px' }}>
            {filtered.map(book => (
              <div key={book.id} onClick={() => setSelectedBook(book)}
                style={{ background: T.card, borderRadius: '14px', overflow: 'hidden', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', border: `1px solid ${T.tealBorder}`, transition: 'transform 0.15s, box-shadow 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = T.goldGlow }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4)' }}>
                <div style={{ height: '200px', background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {book.cover_image_url
                    ? <img src={book.cover_image_url} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '40px' }}>📚</span>}
                </div>
                <div style={{ padding: '12px' }}>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: '13px', color: T.white, lineHeight: '1.3' }}>{book.title}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: T.tealLight }}>{book.author}</p>
                  {book.edition_name && (
                    <span style={{ display: 'inline-block', marginTop: '6px', background: T.goldDim, color: T.goldLight, borderRadius: '6px', padding: '2px 8px', fontSize: '10px', border: `1px solid ${T.goldBorder}` }}>
                      {book.edition_name}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && <AddBookModal onClose={() => setShowAdd(false)} onSave={() => { setShowAdd(false); fetchBooks(user.id) }} userId={user.id} />}
      {selectedBook && <BookDetailModal book={selectedBook} onClose={() => setSelectedBook(null)} onSave={() => { setSelectedBook(null); fetchBooks(user.id) }} />}
      {showBulkScanner && (
        <BarcodeScanner
          bulkMode={true}
          onClose={() => setShowBulkScanner(false)}
          onDetected={() => {}}
          onBulkComplete={async (books) => {
            setShowBulkScanner(false)
            if (books.length === 0) return
            const { data: existing } = await supabase.from('books').select('title').eq('owner_id', user.id)
            const existingTitles = new Set((existing || []).map(b => b.title?.toLowerCase().trim()))
            const newBooks = books
              .filter(b => !existingTitles.has(b.title?.toLowerCase().trim()))
              .map(b => ({ ...b, owner_id: user.id }))
            if (newBooks.length > 0) {
              await supabase.from('books').insert(newBooks)
              fetchBooks(user.id)
            }
            alert(`✅ Added ${newBooks.length} books! ${books.length - newBooks.length} duplicates skipped.`)
          }}
        />
      )}
    </div>
  )
}

function BookDetailModal({ book, onClose, onSave }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...book })
  const [loading, setLoading] = useState(false)

  function update(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSave() {
    setLoading(true)
    await supabase.from('books').update({
      title: form.title, author: form.author, series: form.series,
      volume_number: form.volume_number, edition_name: form.edition_name,
      isbn: form.isbn, publisher: form.publisher, publication_year: form.publication_year,
      format: form.format, cover_image_url: form.cover_image_url,
      special_features: form.special_features, notes: form.notes, read_status: form.read_status
    }).eq('id', book.id)
    setLoading(false)
    onSave()
  }

  async function handleDelete() {
    if (!confirm('Remove this book from your library?')) return
    await supabase.from('books').delete().eq('id', book.id)
    onSave()
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${T.tealBorder}`, background: 'rgba(255,255,255,0.05)', color: T.white, fontSize: '14px', boxSizing: 'border-box', outline: 'none', fontFamily: 'Georgia, serif' }
  const labelStyle = { display: 'block', color: T.tealLight, fontWeight: 'bold', marginBottom: '6px', fontSize: '13px' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, overflowY: 'auto', padding: '20px' }}>
      <div style={{ background: T.surface, borderRadius: '20px', maxWidth: '480px', margin: '0 auto', overflow: 'hidden', border: `1px solid ${T.tealBorder}` }}>
        <div style={{ height: '280px', background: T.card, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
          {form.cover_image_url
            ? <img src={form.cover_image_url} alt={form.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '80px' }}>📚</span>}
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top, ${T.surface} 0%, transparent 50%)` }} />
          <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(0,0,0,0.6)', border: 'none', color: T.white, fontSize: '20px', cursor: 'pointer', borderRadius: '50%', width: '36px', height: '36px' }}>×</button>
        </div>

        <div style={{ padding: '20px' }}>
          {!editing ? (
            <>
              <h2 style={{ color: T.white, margin: '0 0 4px', fontSize: '22px' }}>{book.title}</h2>
              <p style={{ color: T.tealLight, margin: '0 0 16px', fontSize: '15px' }}>{book.author}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {book.edition_name && <span style={{ background: T.goldDim, color: T.goldLight, borderRadius: '8px', padding: '4px 10px', fontSize: '12px', border: `1px solid ${T.goldBorder}` }}>{book.edition_name}</span>}
                {book.format && <span style={{ background: T.tealDim, color: T.tealLight, borderRadius: '8px', padding: '4px 10px', fontSize: '12px', border: `1px solid ${T.tealBorder}`, textTransform: 'capitalize' }}>{book.format}</span>}
                {book.read_status && <span style={{ background: T.tealDim, color: T.tealLight, borderRadius: '8px', padding: '4px 10px', fontSize: '12px', border: `1px solid ${T.tealBorder}`, textTransform: 'capitalize' }}>{book.read_status}</span>}
              </div>
              {book.series && <p style={{ color: T.subtle, fontSize: '13px', margin: '0 0 8px' }}>📖 {book.series}{book.volume_number ? ` #${book.volume_number}` : ''}</p>}
              {book.publisher && <p style={{ color: T.subtle, fontSize: '13px', margin: '0 0 8px' }}>🏛️ {book.publisher}{book.publication_year ? ` (${book.publication_year})` : ''}</p>}
              {book.isbn && <p style={{ color: T.subtle, fontSize: '13px', margin: '0 0 8px' }}>🔖 ISBN: {book.isbn}</p>}
              {book.special_features && <p style={{ color: T.goldLight, fontSize: '13px', margin: '0 0 8px' }}>✨ {book.special_features}</p>}
              {book.notes && <p style={{ color: T.subtle, fontSize: '13px', margin: '0 0 16px', fontStyle: 'italic' }}>"{book.notes}"</p>}
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={() => setEditing(true)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: T.teal, color: T.white, border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>✏️ Edit</button>
                <button onClick={handleDelete} style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', fontSize: '14px', cursor: 'pointer' }}>🗑️</button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 style={{ color: T.white, margin: 0 }}>Edit Book</h3>
              <div><label style={labelStyle}>Title</label><input value={form.title} onChange={e => update('title', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Author</label><input value={form.author || ''} onChange={e => update('author', e.target.value)} style={inputStyle} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div><label style={labelStyle}>Series</label><input value={form.series || ''} onChange={e => update('series', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Volume #</label><input value={form.volume_number || ''} onChange={e => update('volume_number', e.target.value)} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Edition Name</label><input value={form.edition_name || ''} onChange={e => update('edition_name', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Format</label>
                <select value={form.format || 'hardcover'} onChange={e => update('format', e.target.value)} style={inputStyle}>
                  <option value="hardcover">Hardcover</option>
                  <option value="paperback">Paperback</option>
                  <option value="ebook">Ebook</option>
                  <option value="audiobook">Audiobook</option>
                </select>
              </div>
              <div><label style={labelStyle}>Read Status</label>
                <select value={form.read_status || 'owned'} onChange={e => update('read_status', e.target.value)} style={inputStyle}>
                  <option value="owned">Owned</option>
                  <option value="unread">Unread</option>
                  <option value="read">Read</option>
                  <option value="rereading">Re-reading</option>
                </select>
              </div>
              <div><label style={labelStyle}>Special Features</label><input value={form.special_features || ''} onChange={e => update('special_features', e.target.value)} style={inputStyle} /></div>
              <div>
                <label style={labelStyle}>Cover Image</label>
                <CoverUpload currentUrl={form.cover_image_url} onUploaded={url => update('cover_image_url', url)} />
                <input value={form.cover_image_url || ''} onChange={e => update('cover_image_url', e.target.value)} placeholder="Or paste image URL" style={{ ...inputStyle, marginTop: '8px' }} />
              </div>
              <div><label style={labelStyle}>Notes</label><textarea value={form.notes || ''} onChange={e => update('notes', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setEditing(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', color: T.muted, border: `1px solid ${T.tealBorder}`, fontSize: '14px', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>Cancel</button>
                <button onClick={handleSave} disabled={loading} style={{ flex: 2, padding: '12px', borderRadius: '10px', background: T.teal, color: T.white, border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AddBookModal({ onClose, onSave, userId }) {
  const [form, setForm] = useState({ title: '', author: '', series: '', volume_number: '', edition_name: '', isbn: '', publisher: '', publication_year: '', format: 'hardcover', special_features: '', notes: '', cover_image_url: '' })
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [authorSuggestions, setAuthorSuggestions] = useState([])
  const [seriesSuggestions, setSeriesSuggestions] = useState([])

  useEffect(() => {
    async function fetchSuggestions() {
      const { data } = await supabase.from('books').select('author, series').eq('owner_id', userId)
      if (data) {
        setAuthorSuggestions([...new Set(data.map(b => b.author?.trim()).filter(Boolean))])
        setSeriesSuggestions([...new Set(data.map(b => b.series?.trim()).filter(Boolean))])
      }
    }
    fetchSuggestions()
  }, [userId])

  function update(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function searchISBN(isbnOverride) {
    const raw = isbnOverride !== undefined ? isbnOverride : form.isbn
    const isbnToSearch = raw.trim().replace(/[^0-9X]/gi, '')
    if (!isbnToSearch) return
    setSearching(true)
    try {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbnToSearch}`)
      const data = await res.json()
      if (data.items?.length > 0) {
        const book = data.items[0].volumeInfo
        setForm(f => ({ ...f, isbn: isbnToSearch, title: book.title || f.title, author: book.authors?.[0] || f.author, publisher: book.publisher || f.publisher, publication_year: book.publishedDate?.slice(0, 4) || f.publication_year, cover_image_url: book.imageLinks?.thumbnail?.replace('http:', 'https:') || f.cover_image_url }))
        setSearching(false)
        return
      }
      const res2 = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbnToSearch}&format=json&jscmd=data`)
      const data2 = await res2.json()
      const book2 = data2[`ISBN:${isbnToSearch}`]
      if (book2) {
        setForm(f => ({ ...f, isbn: isbnToSearch, title: book2.title || f.title, author: book2.authors?.[0]?.name || f.author, publisher: book2.publishers?.[0]?.name || f.publisher, publication_year: book2.publish_date?.slice(-4) || f.publication_year, cover_image_url: book2.cover?.large || book2.cover?.medium || f.cover_image_url }))
        setSearching(false)
        return
      }
      alert(`No book found for ISBN: ${isbnToSearch}. Try entering details manually.`)
    } catch { alert('Could not search. Please enter details manually.') }
    setSearching(false)
  }

  async function handleSave() {
    if (!form.title) return alert('Please enter a title.')
    setLoading(true)
    const { data: existing } = await supabase
      .from('books').select('id, title, edition_name')
      .eq('owner_id', userId).ilike('title', form.title.trim())
    if (existing?.length > 0) {
      const editions = existing.map(b => b.edition_name ? `${b.title} (${b.edition_name})` : b.title).join(', ')
      const proceed = confirm(`You already have this title in your library:\n${editions}\n\nDo you want to add another version anyway?`)
      if (!proceed) { setLoading(false); return }
    }
    const { error } = await supabase.from('books').insert({ ...form, owner_id: userId, publication_year: form.publication_year ? parseInt(form.publication_year) : null })
    if (error) { alert('Error: ' + error.message); setLoading(false); return }
    setLoading(false)
    onSave()
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${T.tealBorder}`, background: 'rgba(255,255,255,0.05)', color: T.white, fontSize: '14px', boxSizing: 'border-box', outline: 'none', fontFamily: 'Georgia, serif' }
  const labelStyle = { display: 'block', color: T.tealLight, fontWeight: 'bold', marginBottom: '6px', fontSize: '13px' }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, overflowY: 'auto', padding: '20px' }}>
        <div style={{ background: T.surface, borderRadius: '20px', maxWidth: '480px', margin: '0 auto', overflow: 'hidden', border: `1px solid ${T.tealBorder}` }}>
          <div style={{ background: T.header, padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ color: T.white, margin: 0, fontSize: '20px' }}>Add a Book</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.white, fontSize: '24px', cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>ISBN (optional — auto-fills details)</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input value={form.isbn} onChange={e => update('isbn', e.target.value)} placeholder="e.g. 9780385737951" style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => searchISBN(form.isbn)} disabled={searching} style={{ background: searching ? T.tealDim : T.teal, color: T.white, border: 'none', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>
                  {searching ? '🔍...' : 'Look up'}
                </button>
              </div>
              <button onClick={() => setShowScanner(true)} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: T.goldDim, color: T.goldLight, border: `1px solid ${T.goldBorder}`, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '13px', fontWeight: 'bold' }}>
                📷 Scan Barcode Instead
              </button>
            </div>
            <div><label style={labelStyle}>Title *</label><input value={form.title} onChange={e => update('title', e.target.value)} placeholder="Book title" style={inputStyle} /></div>
            <div>
              <label style={labelStyle}>Author</label>
              <Autocomplete value={form.author} onChange={v => update('author', v)} suggestions={authorSuggestions} placeholder="Author name" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Series</label>
                <Autocomplete value={form.series} onChange={v => update('series', v)} suggestions={seriesSuggestions} placeholder="Series name" style={inputStyle} />
              </div>
              <div><label style={labelStyle}>Volume #</label><input value={form.volume_number} onChange={e => update('volume_number', e.target.value)} placeholder="e.g. 1" style={inputStyle} /></div>
            </div>
            <div><label style={labelStyle}>Edition Name</label><input value={form.edition_name} onChange={e => update('edition_name', e.target.value)} placeholder="e.g. Fairyloot Exclusive" style={inputStyle} /></div>
            <div><label style={labelStyle}>Format</label>
              <select value={form.format} onChange={e => update('format', e.target.value)} style={inputStyle}>
                <option value="hardcover">Hardcover</option>
                <option value="paperback">Paperback</option>
                <option value="ebook">Ebook</option>
                <option value="audiobook">Audiobook</option>
              </select>
            </div>
            <div><label style={labelStyle}>Special Features</label><input value={form.special_features} onChange={e => update('special_features', e.target.value)} placeholder="e.g. Sprayed edges, foiling, signed" style={inputStyle} /></div>
            <div>
              <label style={labelStyle}>Cover Image</label>
              <CoverUpload currentUrl={form.cover_image_url} onUploaded={url => update('cover_image_url', url)} />
              <input value={form.cover_image_url} onChange={e => update('cover_image_url', e.target.value)} placeholder="Or paste image URL" style={{ ...inputStyle, marginTop: '8px' }} />
            </div>
            <div><label style={labelStyle}>Notes</label><textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Any extra notes..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>
            <button onClick={handleSave} disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: '10px', background: T.teal, color: T.white, border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', boxShadow: '0 4px 15px rgba(13,148,136,0.4)' }}>
              {loading ? 'Saving...' : '✨ Add to My Library'}
            </button>
          </div>
        </div>
      </div>
      {showScanner && (
        <BarcodeScanner
          onDetected={(code) => { setShowScanner(false); searchISBN(code) }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  )
}