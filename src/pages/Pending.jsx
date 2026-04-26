import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Pending() {
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
      .from('pending_purchases')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  async function markReceived(item) {
    await supabase.from('books').insert({
      owner_id: item.owner_id,
      title: item.title,
      author: item.author,
      edition_name: item.edition_name,
      cover_image_url: item.cover_image_url,
      notes: item.notes,
      format: 'hardcover'
    })
    await supabase.from('pending_purchases').update({ received_at: new Date().toISOString() }).eq('id', item.id)
    await supabase.from('pending_purchases').delete().eq('id', item.id)
    fetchItems(item.owner_id)
  }

  const statusColors = {
    preordered: { bg: '#fef3c7', color: '#92400e', label: 'Preordered' },
    ordered: { bg: '#dbeafe', color: '#1e40af', label: 'Ordered' },
    shipped: { bg: '#d1fae5', color: '#065f46', label: 'Shipped' },
    arriving_soon: { bg: '#f3e8ff', color: '#4a2c6b', label: 'Arriving Soon' }
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: '#faf5fc', minHeight: '100vh' }}>
      <div style={{ background: '#4a2c6b', padding: '20px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: '#fff', margin: 0, fontSize: '22px' }}>📦 Pending</h1>
          <p style={{ color: '#d8c5e0', margin: '4px 0 0', fontSize: '13px' }}>
            {items.length} {items.length === 1 ? 'item' : 'items'} on the way
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ background: '#8b5e83', color: '#fff', border: 'none', borderRadius: '20px', padding: '8px 16px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
          + Add
        </button>
      </div>

      <div style={{ padding: '16px' }}>
        {loading ? (
          <p style={{ color: '#8b5e83', textAlign: 'center', marginTop: '40px' }}>Loading...</p>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
            <h3 style={{ color: '#4a2c6b', marginBottom: '8px' }}>Nothing pending!</h3>
            <p style={{ color: '#8b5e83', fontSize: '14px' }}>Add books you've ordered or preordered.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map(item => {
              const status = statusColors[item.status] || statusColors.ordered
              return (
                <div key={item.id} style={{ background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(74,44,107,0.08)', display: 'flex', gap: '12px' }}>
                  <div style={{ width: '60px', height: '80px', background: '#f3e8ff', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {item.cover_image_url
                      ? <img src={item.cover_image_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '24px' }}>📚</span>
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 'bold', color: '#1f1f2e', fontSize: '15px' }}>{item.title}</p>
                        {item.author && <p style={{ margin: '2px 0', color: '#8b5e83', fontSize: '13px' }}>{item.author}</p>}
                        {item.edition_name && <p style={{ margin: '2px 0', color: '#6b7280', fontSize: '12px' }}>{item.edition_name}</p>}
                      </div>
                      <span style={{ background: status.bg, color: status.color, fontSize: '11px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '10px', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                        {status.label}
                      </span>
                    </div>
                    {item.source && <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '12px' }}>From: {item.source}</p>}
                    {item.expected_arrival && <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: '12px' }}>Expected: {new Date(item.expected_arrival).toLocaleDateString()}</p>}
                    {item.notes && <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '12px', fontStyle: 'italic' }}>{item.notes}</p>}
                    <button onClick={() => markReceived(item)} style={{ marginTop: '10px', background: '#4a2c6b', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
                      ✓ Mark as Received
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showAdd && <AddPendingModal onClose={() => setShowAdd(false)} onSave={() => { setShowAdd(false); fetchItems(user.id) }} userId={user.id} />}
    </div>
  )
}

function AddPendingModal({ onClose, onSave, userId }) {
  const [form, setForm] = useState({ title: '', author: '', edition_name: '', cover_image_url: '', source: '', order_date: '', expected_arrival: '', status: 'ordered', notes: '' })
  const [loading, setLoading] = useState(false)

  function update(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSave() {
    if (!form.title) return alert('Please enter a title.')
    setLoading(true)
    const { error } = await supabase.from('pending_purchases').insert({ ...form, owner_id: userId })
    if (error) { alert('Error: ' + error.message); setLoading(false); return }
    setLoading(false)
    onSave()
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d8c5e0', fontSize: '14px', boxSizing: 'border-box', outline: 'none', fontFamily: 'Georgia, serif' }
  const labelStyle = { display: 'block', color: '#4a2c6b', fontWeight: 'bold', marginBottom: '6px', fontSize: '13px' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, overflowY: 'auto', padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '480px', margin: '0 auto', overflow: 'hidden' }}>
        <div style={{ background: '#4a2c6b', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>Add Pending Purchase</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Title *</label>
            <input value={form.title} onChange={e => update('title', e.target.value)} placeholder="Book title" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Author</label>
            <input value={form.author} onChange={e => update('author', e.target.value)} placeholder="Author name" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Edition Name</label>
            <input value={form.edition_name} onChange={e => update('edition_name', e.target.value)} placeholder="e.g. Fairyloot Exclusive" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select value={form.status} onChange={e => update('status', e.target.value)} style={inputStyle}>
              <option value="preordered">Preordered</option>
              <option value="ordered">Ordered</option>
              <option value="shipped">Shipped</option>
              <option value="arriving_soon">Arriving Soon</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Ordered From</label>
            <input value={form.source} onChange={e => update('source', e.target.value)} placeholder="e.g. Amazon, Bookshop.org, Fairyloot" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Order Date</label>
              <input type="date" value={form.order_date} onChange={e => update('order_date', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Expected Arrival</label>
              <input type="date" value={form.expected_arrival} onChange={e => update('expected_arrival', e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="e.g. Comes with exclusive art print!" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <button onClick={handleSave} disabled={loading} style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#4a2c6b', color: '#fff', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
            {loading ? 'Saving...' : 'Add to Pending'}
          </button>
        </div>
      </div>
    </div>
  )
}