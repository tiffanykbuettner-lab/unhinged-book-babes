import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DARK = '#1a1025'
const CARD = '#261836'
const PURPLE = '#7c3aed'
const MAUVE = '#a855f7'
const LIGHT = '#e9d5ff'
const MUTED = '#9ca3af'
const WHITE = '#ffffff'

export default function Library() {
  const [books, setBooks] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)
  const [user, setUser] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      fetchBooks(user.id)
    })
  }, [])

  useEffect(() => {
    if (!search.trim()) { setFiltered(books); return }
    const q = search.toLowerCase()
    setFiltered(books.filter(b =>
      b.title?.toLowerCase().includes(q) ||
      b.author?.toLowerCase().includes(q) ||
      b.series?.toLowerCase().includes(q) ||
      b.edition_name?.toLowerCase().includes(q)
    ))
  }, [search, books])

  async function fetchBooks(userId) {
    const { data } = await supabase
      .from('books').select('*').eq('owner_id', userId)
      .order('created_at', { ascending: false })
    setBooks(data || [])
    setFiltered(data || [])
    setLoading(false)
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: DARK, minHeight: '100vh' }}>
      <div style={{ background: 'linear-gradient(180deg, #2d1b4e 0%, #1a1025 100%)', padding: '24px 20px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h1 style={{ color: WHITE, margin: 0, fontSize: '24px', fontWeight: 'bold' }}>📚 My Library</h1>
            <p style={{ color: LIGHT, margin: '4px 0 0', fontSize: '13px', opacity: 0.8 }}>
              {books.length} {books.length === 1 ? 'book' : 'books'} in your collection
            </p>
          </div>
          <button onClick={() => setShowAdd(true)} style={{
            background: PURPLE, color: WHITE, border: 'none',
            borderRadius: '20px', padding: '10px 18px', fontSize: '14px',
            fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif',
            boxShadow: '0 4px 15px rgba(124,58,237,0.4)'
          }}>+ Add Book</button>
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, author, series..."
            style={{
              width: '100%', padding: '12px 16px 12px 40px', borderRadius: '12px',
              border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(255,255,255,0.08)',
              color: WHITE, fontSize: '14px', boxSizing: 'border-box', outline: 'none',
              fontFamily: 'Georgia, serif'
            }} />
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {loading ? (
          <p style={{ color: MUTED, textAlign: 'center', marginTop: '40px' }}>Loading your library...</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📖</div>
            <h3 style={{ color: LIGHT, marginBottom: '8px' }}>{search ? 'No books found' : 'Your library is empty'}</h3>
            <p style={{ color: MUTED, fontSize: '14px' }}>{search ? 'Try a different search term' : 'Add your first book to get started!'}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px' }}>
            {filtered.map(book => (
              <div key={book.id} onClick={() => setSelectedBook(book)}
                style={{ background: CARD, borderRadius: '14px', overflow: 'hidden', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', border: '1px solid rgba(168,85,247,0.15)', transition: 'transform 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ height: '200px', background: 'linear-gradient(135deg, #2d1b4e, #1a1025)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {book.cover_image_url
                    ? <img src={book.cover_image_url} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '40px' }}>📚</span>}
                </div>
                <div style={{ padding: '12px' }}>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: '13px', color: WHITE, lineHeight: '1.3' }}>{book.title}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: MAUVE }}>{book.author}</p>
                  {book.edition_name && (
                    <span style={{ display: 'inline-block', marginTop: '6px', background: 'rgba(124,58,237,0.25)', color: LIGHT, borderRadius: '6px', padding: '2px 8px', fontSize: '10px', border: '1px solid rgba(168,85,247,0.3)' }}>
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
    </div>
  )
}

function BookDetailModal({ book, onClose, onSave }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...book })
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
    setDeleting(true)
    await supabase.from('books').delete().eq('id', book.id)
    onSave()
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(255,255,255,0.08)', color: WHITE, fontSize: '14px', boxSizing: 'border-box', outline: 'none', fontFamily: 'Georgia, serif' }
  const labelStyle = { display: 'block', color: LIGHT, fontWeight: 'bold', marginBottom: '6px', fontSize: '13px' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, overflowY: 'auto', padding: '20px' }}>
      <div style={{ background: '#1e1030', borderRadius: '20px', maxWidth: '480px', margin: '0 auto', overflow: 'hidden', border: '1px solid rgba(168,85,247,0.2)' }}>

        {/* Cover */}
        <div style={{ height: '280px', background: 'linear-gradient(135deg, #2d1b4e, #1a1025)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
          {form.cover_image_url
            ? <img src={form.cover_image_url} alt={form.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '80px' }}>📚</span>}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #1e1030 0%, transparent 50%)' }} />
          <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(0,0,0,0.5)', border: 'none', color: WHITE, fontSize: '20px', cursor: 'pointer', borderRadius: '50%', width: '36px', height: '36px' }}>×</button>
        </div>

        <div style={{ padding: '20px' }}>
          {!editing ? (
            <>
              <h2 style={{ color: WHITE, margin: '0 0 4px', fontSize: '22px' }}>{book.title}</h2>
              <p style={{ color: MAUVE, margin: '0 0 16px', fontSize: '15px' }}>{book.author}</p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {book.edition_name && <span style={{ background: 'rgba(124,58,237,0.25)', color: LIGHT, borderRadius: '8px', padding: '4px 10px', fontSize: '12px', border: '1px solid rgba(168,85,247,0.3)' }}>{book.edition_name}</span>}
                {book.format && <span style={{ background: 'rgba(124,58,237,0.15)', color: MUTED, borderRadius: '8px', padding: '4px 10px', fontSize: '12px', border: '1px solid rgba(168,85,247,0.2)', textTransform: 'capitalize' }}>{book.format}</span>}
                {book.read_status && <span style={{ background: 'rgba(124,58,237,0.15)', color: MUTED, borderRadius: '8px', padding: '4px 10px', fontSize: '12px', border: '1px solid rgba(168,85,247,0.2)', textTransform: 'capitalize' }}>{book.read_status}</span>}
              </div>

              {book.series && <p style={{ color: MUTED, fontSize: '13px', margin: '0 0 8px' }}>📖 {book.series}{book.volume_number ? ` #${book.volume_number}` : ''}</p>}
              {book.publisher && <p style={{ color: MUTED, fontSize: '13px', margin: '0 0 8px' }}>🏛️ {book.publisher}{book.publication_year ? ` (${book.publication_year})` : ''}</p>}
              {book.isbn && <p style={{ color: MUTED, fontSize: '13px', margin: '0 0 8px' }}>🔖 ISBN: {book.isbn}</p>}
              {book.special_features && <p style={{ color: LIGHT, fontSize: '13px', margin: '0 0 8px' }}>✨ {book.special_features}</p>}
              {book.notes && <p style={{ color: MUTED, fontSize: '13px', margin: '0 0 16px', fontStyle: 'italic' }}>"{book.notes}"</p>}

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={() => setEditing(true)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: PURPLE, color: WHITE, border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
                  ✏️ Edit
                </button>
                <button onClick={handleDelete} disabled={deleting} style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(220,38,38,0.15)', color: '#f87171', border: '1px solid rgba(220,38,38,0.3)', fontSize: '14px', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
                  🗑️
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 style={{ color: WHITE, margin: 0 }}>Edit Book</h3>
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
              <div><label style={labelStyle}>Special Features</label><input value={form.special_features || ''} onChange={e => update('special_features', e.target.value)} placeholder="Sprayed edges, foiling, signed..." style={inputStyle} /></div>
              <div><label style={labelStyle}>Cover Image URL</label><input value={form.cover_image_url || ''} onChange={e => update('cover_image_url', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Notes</label><textarea value={form.notes || ''} onChange={e => update('notes', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setEditing(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', color: MUTED, border: '1px solid rgba(255,255,255,0.1)', fontSize: '14px', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>Cancel</button>
                <button onClick={handleSave} disabled={loading} style={{ flex: 2, padding: '12px', borderRadius: '10px', background: PURPLE, color: WHITE, border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
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

  function update(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function searchISBN() {
    if (!form.isbn) return
    setSearching(true)
    try {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${form.isbn}`)
      const data = await res.json()
      if (data.items?.length > 0) {
        const book = data.items[0].volumeInfo
        setForm(f => ({ ...f, title: book.title || f.title, author: book.authors?.[0] || f.author, publisher: book.publisher || f.publisher, publication_year: book.publishedDate?.slice(0, 4) || f.publication_year, cover_image_url: book.imageLinks?.thumbnail?.replace('http:', 'https:') || f.cover_image_url }))
      } else { alert('No book found for that ISBN.') }
    } catch { alert('Could not search. Please enter details manually.') }
    setSearching(false)
  }

  async function handleSave() {
    if (!form.title) return alert('Please enter a title.')
    setLoading(true)
    const { error } = await supabase.from('books').insert({ ...form, owner_id: userId, publication_year: form.publication_year ? parseInt(form.publication_year) : null })
    if (error) { alert('Error: ' + error.message); setLoading(false); return }
    setLoading(false)
    onSave()
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(255,255,255,0.08)', color: WHITE, fontSize: '14px', boxSizing: 'border-box', outline: 'none', fontFamily: 'Georgia, serif' }
  const labelStyle = { display: 'block', color: LIGHT, fontWeight: 'bold', marginBottom: '6px', fontSize: '13px' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, overflowY: 'auto', padding: '20px' }}>
      <div style={{ background: '#1e1030', borderRadius: '20px', maxWidth: '480px', margin: '0 auto', overflow: 'hidden', border: '1px solid rgba(168,85,247,0.2)' }}>
        <div style={{ background: 'linear-gradient(135deg, #2d1b4e, #1a1025)', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: WHITE, margin: 0, fontSize: '20px' }}>Add a Book</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: WHITE, fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>ISBN (optional — auto-fills details)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={form.isbn} onChange={e => update('isbn', e.target.value)} placeholder="e.g. 9780385737951" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={searchISBN} disabled={searching} style={{ background: searching ? '#4c1d95' : PURPLE, color: WHITE, border: 'none', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>
                {searching ? '🔍...' : 'Look up'}
              </button>
            </div>
          </div>
          <div><label style={labelStyle}>Title *</label><input value={form.title} onChange={e => update('title', e.target.value)} placeholder="Book title" style={inputStyle} /></div>
          <div><label style={labelStyle}>Author</label><input value={form.author} onChange={e => update('author', e.target.value)} placeholder="Author name" style={inputStyle} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div><label style={labelStyle}>Series</label><input value={form.series} onChange={e => update('series', e.target.value)} placeholder="Series name" style={inputStyle} /></div>
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
          <div><label style={labelStyle}>Cover Image URL</label><input value={form.cover_image_url} onChange={e => update('cover_image_url', e.target.value)} placeholder="Paste image URL or use ISBN lookup" style={inputStyle} /></div>
          <div><label style={labelStyle}>Notes</label><textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Any extra notes..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>
          <button onClick={handleSave} disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: '10px', background: PURPLE, color: WHITE, border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', boxShadow: '0 4px 15px rgba(124,58,237,0.4)' }}>
            {loading ? 'Saving...' : '✨ Add to My Library'}
          </button>
        </div>
      </div>
    </div>
  )
}