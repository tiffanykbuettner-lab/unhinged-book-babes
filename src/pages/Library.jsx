import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Library() {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      fetchBooks(user.id)
    })
  }, [])

  async function fetchBooks(userId) {
    const { data } = await supabase
      .from('books')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
    setBooks(data || [])
    setLoading(false)
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: '#faf5fc', minHeight: '100vh' }}>
      <div style={{
        background: '#4a2c6b', padding: '20px 20px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div>
          <h1 style={{ color: '#fff', margin: 0, fontSize: '22px' }}>📚 My Library</h1>
          <p style={{ color: '#d8c5e0', margin: '4px 0 0', fontSize: '13px' }}>
            {books.length} {books.length === 1 ? 'book' : 'books'} in your collection
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{
          background: '#8b5e83', color: '#fff', border: 'none',
          borderRadius: '20px', padding: '8px 16px', fontSize: '14px',
          fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif'
        }}>
          + Add Book
        </button>
      </div>

      <div style={{ padding: '16px' }}>
        {loading ? (
          <p style={{ color: '#8b5e83', textAlign: 'center', marginTop: '40px' }}>Loading your library...</p>
        ) : books.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📖</div>
            <h3 style={{ color: '#4a2c6b', marginBottom: '8px' }}>Your library is empty</h3>
            <p style={{ color: '#8b5e83', fontSize: '14px' }}>Add your first book to get started!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
            {books.map(book => (
              <div key={book.id} style={{
                background: '#fff', borderRadius: '12px', overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(74,44,107,0.08)'
              }}>
                <div style={{
                  height: '180px', background: '#f3e8ff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {book.cover_image_url
                    ? <img src={book.cover_image_url} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '40px' }}>📚</span>
                  }
                </div>
                <div style={{ padding: '10px' }}>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: '13px', color: '#1f1f2e', lineHeight: '1.3' }}>{book.title}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#8b5e83' }}>{book.author}</p>
                  {book.edition_name && (
                    <span style={{
                      display: 'inline-block', marginTop: '6px',
                      background: '#f3e8ff', color: '#4a2c6b',
                      borderRadius: '4px', padding: '2px 6px', fontSize: '11px'
                    }}>
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
    </div>
  )
}

function AddBookModal({ onClose, onSave, userId }) {
  const [form, setForm] = useState({
    title: '', author: '', series: '', edition_name: '',
    isbn: '', publisher: '', publication_year: '', format: 'hardcover',
    special_features: '', notes: '', cover_image_url: ''
  })
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function searchISBN() {
    if (!form.isbn) return
    setSearching(true)
    try {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${form.isbn}`)
      const data = await res.json()
      if (data.items && data.items.length > 0) {
        const book = data.items[0].volumeInfo
        setForm(f => ({
          ...f,
          title: book.title || f.title,
          author: book.authors?.[0] || f.author,
          publisher: book.publisher || f.publisher,
          publication_year: book.publishedDate?.slice(0, 4) || f.publication_year,
          cover_image_url: book.imageLinks?.thumbnail?.replace('http:', 'https:') || f.cover_image_url
        }))
      } else {
        alert('No book found for that ISBN. Try entering details manually.')
      }
    } catch {
      alert('Could not search. Please enter details manually.')
    }
    setSearching(false)
  }

  async function handleSave() {
    if (!form.title) return alert('Please enter a title.')
    setLoading(true)
    const { data, error } = await supabase.from('books').insert({ 
      ...form, 
      owner_id: userId, 
      publication_year: form.publication_year ? parseInt(form.publication_year) : null 
    })
    if (error) {
      console.log('Save error:', error)
      alert('Error saving: ' + error.message)
      setLoading(false)
      return
    }
    setLoading(false)
    onSave()
  }
  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid #d8c5e0', fontSize: '14px',
    boxSizing: 'border-box', outline: 'none', fontFamily: 'Georgia, serif'
  }
  const labelStyle = { display: 'block', color: '#4a2c6b', fontWeight: 'bold', marginBottom: '6px', fontSize: '13px' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, overflowY: 'auto', padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '480px', margin: '0 auto', overflow: 'hidden' }}>
        <div style={{ background: '#4a2c6b', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>Add a Book</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>ISBN (optional — auto-fills details)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={form.isbn} onChange={e => update('isbn', e.target.value)} placeholder="e.g. 9780385737951" style={{ ...inputStyle, flex: 1 }} />
	      <button onClick={searchISBN} disabled={searching} style={{ background: searching ? '#d8c5e0' : '#8b5e83', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 14px', cursor: searching ? 'not-allowed' : 			'pointer', fontSize: '13px', whiteSpace: 'nowrap', transition: 'background 0.2s' }}>
  		{searching ? '🔍 Searching...' : 'Look up'}
	      </button>            </div>
          </div>

          <div>
            <label style={labelStyle}>Title *</label>
            <input value={form.title} onChange={e => update('title', e.target.value)} placeholder="Book title" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Author</label>
            <input value={form.author} onChange={e => update('author', e.target.value)} placeholder="Author name" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Series</label>
              <input value={form.series} onChange={e => update('series', e.target.value)} placeholder="Series name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Volume #</label>
              <input value={form.volume_number} onChange={e => update('volume_number', e.target.value)} placeholder="e.g. 1" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Edition Name</label>
            <input value={form.edition_name} onChange={e => update('edition_name', e.target.value)} placeholder="e.g. Fairyloot Exclusive, Signed First Print" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Format</label>
            <select value={form.format} onChange={e => update('format', e.target.value)} style={inputStyle}>
              <option value="hardcover">Hardcover</option>
              <option value="paperback">Paperback</option>
              <option value="ebook">Ebook</option>
              <option value="audiobook">Audiobook</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Special Features</label>
            <input value={form.special_features} onChange={e => update('special_features', e.target.value)} placeholder="e.g. Sprayed edges, foiling, signed" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Cover Image URL</label>
            <input value={form.cover_image_url} onChange={e => update('cover_image_url', e.target.value)} placeholder="Paste image URL or use ISBN lookup" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Any extra notes about this book..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          <button onClick={handleSave} disabled={loading} style={{
            width: '100%', padding: '12px', borderRadius: '8px',
            background: '#4a2c6b', color: '#fff', border: 'none',
            fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif'
          }}>
            {loading ? 'Saving...' : 'Add to My Library'}
          </button>
        </div>
      </div>
    </div>
  )
}