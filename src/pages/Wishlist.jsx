import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'
import Autocomplete from '../components/Autocomplete'

export default function Wishlist() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      fetchItems(user.id)
    })
  }, [])

  async function fetchItems(userId) {
    const { data } = await supabase
      .from('wishlist')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  async function deleteItem(id) {
    await supabase.from('wishlist').delete().eq('id', id)
    fetchItems(user.id)
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: T.bg, minHeight: '100vh' }}>
      <div style={{ background: T.header, padding: '24px 20px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ color: T.white, margin: 0, fontSize: '24px' }}>💫 Wishlist</h1>
          <p style={{ color: T.tealLight, margin: '4px 0 0', fontSize: '13px' }}>
            {items.length} {items.length === 1 ? 'book' : 'books'} you want
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ background: T.teal, color: T.white, border: 'none', borderRadius: '20px', padding: '10px 18px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', boxShadow: '0 4px 15px rgba(13,148,136,0.4)' }}>
          + Add
        </button>
      </div>

      <div style={{ padding: '16px' }}>
        {loading ? (
          <p style={{ color: T.muted, textAlign: 'center', marginTop: '40px' }}>Loading...</p>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>💫</div>
            <h3 style={{ color: T.white, marginBottom: '8px' }}>Your wishlist is empty!</h3>
            <p style={{ color: T.muted, fontSize: '14px' }}>Add books you're hoping to get.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map(item => (
              <WishlistCard key={item.id} item={item} onDelete={() => deleteItem(item.id)} />
            ))}
          </div>
        )}
      </div>

      {showAdd && <AddWishlistModal onClose={() => setShowAdd(false)} onSave={() => { setShowAdd(false); fetchItems(user.id) }} userId={user.id} />}
    </div>
  )
}

function WishlistCard({ item, onDelete }) {
  return (
    <div style={{ background: T.card, borderRadius: '14px', padding: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', display: 'flex', gap: '12px', border: `1px solid ${T.tealBorder}` }}>
      <div style={{ width: '60px', height: '80px', background: T.surface, borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: `1px solid ${T.tealBorder}` }}>
        {item.cover_image_url
          ? <img src={item.cover_image_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: '24px' }}>📚</span>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 'bold', color: T.white, fontSize: '15px' }}>{item.title}</p>
            {item.author && <p style={{ margin: '2px 0', color: T.tealLight, fontSize: '13px' }}>{item.author}</p>}
          </div>
          {/* Owner never sees claimed or gifted status */}
          <button onClick={onDelete} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: '16px', padding: '0', marginLeft: '8px' }}>✕</button>
        </div>
        {item.edition_preference && <p style={{ margin: '6px 0 0', color: T.goldLight, fontSize: '12px' }}>📌 {item.edition_preference}</p>}
        {item.notes && <p style={{ margin: '4px 0 0', color: T.muted, fontSize: '12px', fontStyle: 'italic' }}>{item.notes}</p>}
      </div>
    </div>
  )
}

function AddWishlistModal({ onClose, onSave, userId }) {
  const [form, setForm] = useState({ title: '', author: '', edition_preference: '', cover_image_url: '', notes: '' })
  const [loading, setLoading] = useState(false)
  const [titleSuggestions, setTitleSuggestions] = useState([])
  const [authorSuggestions, setAuthorSuggestions] = useState([])

  useEffect(() => {
    async function fetchSuggestions() {
      // Pull from both wishlist and books so suggestions are as rich as possible
      const [{ data: wishlistData }, { data: booksData }] = await Promise.all([
        supabase.from('wishlist').select('title, author').eq('owner_id', userId),
        supabase.from('books').select('title, author').eq('owner_id', userId),
      ])
      const combined = [...(wishlistData || []), ...(booksData || [])]
      setTitleSuggestions([...new Set(combined.map(b => b.title?.trim()).filter(Boolean))])
      setAuthorSuggestions([...new Set(combined.map(b => b.author?.trim()).filter(Boolean))])
    }
    fetchSuggestions()
  }, [userId])

  function update(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSave() {
    if (!form.title) return alert('Please enter a title.')
    setLoading(true)
    const { error } = await supabase.from('wishlist').insert({ ...form, owner_id: userId })
    if (error) { alert('Error: ' + error.message); setLoading(false); return }
    setLoading(false)
    onSave()
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${T.tealBorder}`, background: 'rgba(255,255,255,0.05)', color: T.white, fontSize: '14px', boxSizing: 'border-box', outline: 'none', fontFamily: 'Georgia, serif' }
  const labelStyle = { display: 'block', color: T.tealLight, fontWeight: 'bold', marginBottom: '6px', fontSize: '13px' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, overflowY: 'auto', padding: '20px' }}>
      <div style={{ background: T.surface, borderRadius: '20px', maxWidth: '480px', margin: '0 auto', overflow: 'hidden', border: `1px solid ${T.tealBorder}` }}>
        <div style={{ background: T.header, padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: T.white, margin: 0, fontSize: '20px' }}>Add to Wishlist</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.white, fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Title *</label>
            <Autocomplete value={form.title} onChange={v => update('title', v)} suggestions={titleSuggestions} placeholder="Book title" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Author</label>
            <Autocomplete value={form.author} onChange={v => update('author', v)} suggestions={authorSuggestions} placeholder="Author name" style={inputStyle} />
          </div>
          <div><label style={labelStyle}>Edition Preference</label><input value={form.edition_preference} onChange={e => update('edition_preference', e.target.value)} placeholder="e.g. B&N exclusive only, any edition fine" style={inputStyle} /></div>
          <div><label style={labelStyle}>Cover Image URL</label><input value={form.cover_image_url} onChange={e => update('cover_image_url', e.target.value)} placeholder="Paste an image URL" style={inputStyle} /></div>
          <div><label style={labelStyle}>Notes</label><textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Anything else to know?" rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>
          <button onClick={handleSave} disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: '10px', background: T.teal, color: T.white, border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', boxShadow: '0 4px 15px rgba(13,148,136,0.4)' }}>
            {loading ? 'Saving...' : '💫 Add to Wishlist'}
          </button>
        </div>
      </div>
    </div>
  )
}
