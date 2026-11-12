import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'
import Autocomplete from '../components/Autocomplete'

export default function Pending() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      fetchItems(user.id)
    })
  }, [])

  async function fetchItems(userId) {
    const { data } = await supabase
      .from('pending_purchases').select('*').eq('owner_id', userId)
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  async function markReceived(item) {
    await supabase.from('books').insert({
      owner_id: item.owner_id, title: item.title, author: item.author,
      edition_name: item.edition_name, cover_image_url: item.cover_image_url,
      notes: item.notes, format: 'hardcover'
    })
    await supabase.from('pending_purchases').delete().eq('id', item.id)
    fetchItems(item.owner_id)
  }

  const statusStyles = {
    preordered: { bg: T.goldDim, color: T.goldLight, border: T.goldBorder, label: '⏳ Preordered' },
    ordered: { bg: 'rgba(138,73,104,0.18)', color: '#f0d6e3', border: 'rgba(214,183,121,0.25)', label: '📬 Ordered' },
    shipped: { bg: 'rgba(190,120,145,0.14)', color: '#e8b8ca', border: 'rgba(190,120,145,0.3)', label: '🚚 Shipped' },
    arriving_soon: { bg: 'rgba(138,73,104,0.18)', color: T.goldLight, border: T.goldBorder, label: '📭 Arriving Soon' }
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: T.bg, minHeight: '100vh' }}>
      <div style={{ background: T.header, padding: '24px 20px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ color: T.white, margin: 0, fontSize: '24px' }}>📦 Pending</h1>
          <p style={{ color: T.goldLight, margin: '4px 0 0', fontSize: '13px' }}>
            {items.length} {items.length === 1 ? 'item' : 'items'} on the way
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ background: 'linear-gradient(135deg, #8a4968, #63304c)', color: T.white, border: 'none', borderRadius: '20px', padding: '10px 18px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', boxShadow: '0 4px 15px rgba(92,43,68,0.28)' }}>
          + Add
        </button>
      </div>

      <div style={{ padding: '16px' }}>
        {loading ? (
          <p style={{ color: T.muted, textAlign: 'center', marginTop: '40px' }}>Loading...</p>
        ) : items.length === 0 ? (
          <div style={{ maxWidth: '460px', margin: '48px auto', padding: '32px 24px', textAlign: 'center', background: 'linear-gradient(145deg, #281722, #21131d)', border: `1px solid ${T.goldBorder}`, borderRadius: '18px', boxShadow: '0 12px 32px rgba(0,0,0,0.22)' }}>
            <div style={{ width: '66px', height: '66px', margin: '0 auto 18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(214,183,121,0.08)', border: `1px solid ${T.goldBorder}`, fontSize: '32px' }}>📦</div>
            <div style={{ color: T.goldLight, fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>A little something to look forward to</div>
            <h3 style={{ color: T.white, fontSize: '23px', margin: '0 0 10px', fontWeight: 'normal' }}>Your next delivery awaits...</h3>
            <p style={{ color: T.muted, fontSize: '14px', lineHeight: '1.7', margin: '0 auto 22px', maxWidth: '320px' }}>Keep track of preorders, shipped treasures, and the books you're counting down to read.</p>
            <button onClick={() => setShowAdd(true)} style={{ background: 'linear-gradient(135deg, #8a4968, #63304c)', color: T.white, border: `1px solid ${T.goldBorder}`, borderRadius: '12px', padding: '12px 20px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', boxShadow: '0 4px 12px rgba(92,43,68,0.24)' }}>+ Add your first book</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map(item => {
              const status = statusStyles[item.status] || statusStyles.ordered
              return (
                <div key={item.id} style={{ background: T.card, borderRadius: '14px', padding: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', display: 'flex', gap: '12px', border: `1px solid ${T.goldBorder}` }}>
                  <div style={{ width: '60px', height: '80px', background: T.surface, borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: `1px solid ${T.goldBorder}` }}>
                    {item.cover_image_url
                      ? <img src={item.cover_image_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '24px' }}>📚</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 'bold', color: T.white, fontSize: '15px' }}>{item.title}</p>
                        {item.author && <p style={{ margin: '2px 0', color: T.goldLight, fontSize: '13px' }}>{item.author}</p>}
                        {item.edition_name && <p style={{ margin: '2px 0', color: T.muted, fontSize: '12px' }}>{item.edition_name}</p>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '8px' }}>
                        <span style={{ background: status.bg, color: status.color, fontSize: '11px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '10px', border: `1px solid ${status.border}`, whiteSpace: 'nowrap' }}>
                          {status.label}
                        </span>
                        <button onClick={() => setEditingItem(item)} style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${T.goldBorder}`, borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '12px', color: T.muted }}>
                          ✏️
                        </button>
                      </div>
                    </div>
                    {item.source && <p style={{ margin: '6px 0 0', color: T.muted, fontSize: '12px' }}>🛍️ {item.source}</p>}
                    {item.expected_arrival && <p style={{ margin: '2px 0 0', color: T.muted, fontSize: '12px' }}>📅 Expected: {new Date(item.expected_arrival).toLocaleDateString()}</p>}
                    {item.notes && <p style={{ margin: '4px 0 0', color: T.goldLight, fontSize: '12px', fontStyle: 'italic' }}>✨ {item.notes}</p>}
                    <button onClick={() => markReceived(item)} style={{ marginTop: '10px', background: 'linear-gradient(135deg, #8a4968, #63304c)', color: T.white, border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', boxShadow: '0 2px 8px rgba(92,43,68,0.28)' }}>
                      ✓ Mark as Received
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showAdd && (
        <PendingModal
          onClose={() => setShowAdd(false)}
          onSave={() => { setShowAdd(false); fetchItems(user.id) }}
          userId={user.id}
        />
      )}
      {editingItem && (
        <PendingModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={() => { setEditingItem(null); fetchItems(user.id) }}
          userId={user.id}
        />
      )}
    </div>
  )
}

function PendingModal({ item, onClose, onSave, userId }) {
  const isEdit = !!item
  const [form, setForm] = useState({
    title: item?.title || '',
    author: item?.author || '',
    edition_name: item?.edition_name || '',
    cover_image_url: item?.cover_image_url || '',
    source: item?.source || '',
    order_date: item?.order_date || '',
    expected_arrival: item?.expected_arrival || '',
    status: item?.status || 'ordered',
    notes: item?.notes || '',
  })
  const [loading, setLoading] = useState(false)
  const [titleSuggestions, setTitleSuggestions] = useState([])
  const [authorSuggestions, setAuthorSuggestions] = useState([])
  const [editionSuggestions, setEditionSuggestions] = useState([])

  useEffect(() => {
    async function fetchSuggestions() {
      const [{ data: booksData }, { data: wishlistData }, { data: pendingData }] = await Promise.all([
        supabase.from('books').select('title, author, edition_name').eq('owner_id', userId),
        supabase.from('wishlist').select('title, author, edition_preference').eq('owner_id', userId),
        supabase.from('pending_purchases').select('title, author, edition_name').eq('owner_id', userId),
      ])
      const combined = [...(booksData || []), ...(wishlistData || []), ...(pendingData || [])]
      setTitleSuggestions([...new Set(combined.map(b => b.title?.trim()).filter(Boolean))])
      setAuthorSuggestions([...new Set(combined.map(b => b.author?.trim()).filter(Boolean))])
      setEditionSuggestions([...new Set(combined.map(b => (b.edition_name || b.edition_preference)?.trim()).filter(Boolean))])
    }
    fetchSuggestions()
  }, [userId])

  function update(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSave() {
    if (!form.title) return alert('Please enter a title.')
    setLoading(true)
    const payload = {
      ...form,
      order_date: form.order_date || null,
      expected_arrival: form.expected_arrival || null,
    }
    const { error } = isEdit
      ? await supabase.from('pending_purchases').update(payload).eq('id', item.id)
      : await supabase.from('pending_purchases').insert({ ...payload, owner_id: userId })
    if (error) { alert('Error: ' + error.message); setLoading(false); return }
    setLoading(false)
    onSave()
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${T.goldBorder}`, background: 'rgba(255,255,255,0.05)', color: T.white, fontSize: '14px', boxSizing: 'border-box', outline: 'none', fontFamily: 'Georgia, serif', transition: 'border-color 0.18s ease, box-shadow 0.18s ease' }
  const labelStyle = { display: 'block', color: T.goldLight, fontWeight: 'bold', marginBottom: '6px', fontSize: '13px' }
  const optionalLabelStyle = { ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }

  return (
    <div className="pending-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, overflowY: 'auto', padding: '20px' }}>
      <div style={{ background: T.surface, borderRadius: '20px', maxWidth: '480px', margin: '0 auto', overflow: 'hidden', border: `1px solid ${T.goldBorder}` }}>
        <div style={{ background: T.header, padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: T.white, margin: 0, fontSize: '20px' }}>{isEdit ? 'Edit Pending' : 'Add Pending Purchase'}</h2>
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
          <div>
            <label style={labelStyle}>Edition Name</label>
            <Autocomplete value={form.edition_name} onChange={v => update('edition_name', v)} suggestions={editionSuggestions} placeholder="e.g. Fairyloot Exclusive" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select value={form.status} onChange={e => update('status', e.target.value)} style={inputStyle}>
              <option value="preordered" style={{ background: '#281722', color: '#f4e9df' }}>Preordered</option>
              <option value="ordered" style={{ background: '#281722', color: '#f4e9df' }}>Ordered</option>
              <option value="shipped" style={{ background: '#281722', color: '#f4e9df' }}>Shipped</option>
              <option value="arriving_soon" style={{ background: '#281722', color: '#f4e9df' }}>Arriving Soon</option>
            </select>
          </div>
          <div><label style={labelStyle}>Ordered From</label><input value={form.source} onChange={e => update('source', e.target.value)} placeholder="e.g. Amazon, Bookshop.org, Fairyloot" style={inputStyle} /></div>
          <div className="pending-date-grid" style={{ display: 'grid', gap: '12px' }}>
            <div>
              <label style={optionalLabelStyle}>
                Order Date
                <span style={{ color: T.muted, fontSize: '11px', fontWeight: 'normal' }}>(optional)</span>
              </label>
              <input type="date" value={form.order_date} onChange={e => update('order_date', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={optionalLabelStyle}>
                Expected Arrival
                <span style={{ color: T.muted, fontSize: '11px', fontWeight: 'normal' }}>(optional)</span>
              </label>
              <input type="date" value={form.expected_arrival} onChange={e => update('expected_arrival', e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div><label style={labelStyle}>Notes</label><textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="e.g. Comes with exclusive art print!" rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>
          <button onClick={handleSave} disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: '10px', background: 'linear-gradient(135deg, #8a4968, #63304c)', color: T.white, border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', boxShadow: '0 4px 15px rgba(92,43,68,0.28)' }}>
            {loading ? 'Saving...' : isEdit ? '✏️ Save Changes' : '📦 Add to Pending'}
          </button>
        </div>
      </div>
    </div>
  )
}
