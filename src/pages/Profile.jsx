import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'
import Avatar from '../components/Avatar'
import AvatarPicker from '../components/AvatarPicker'

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState({ total: 0, physical: 0, ebook: 0, audiobook: 0, wishlist: 0, pending: 0 })
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [fixingCovers, setFixingCovers] = useState(false)
  const [fixProgress, setFixProgress] = useState(0)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)

  useEffect(() => {
    async function fetchProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: profile }, { data: books }, { count: wish }, { count: pending }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('books').select('format').eq('owner_id', user.id),
        supabase.from('wishlist').select('*', { count: 'exact', head: true }).eq('owner_id', user.id),
        supabase.from('pending_purchases').select('*', { count: 'exact', head: true }).eq('owner_id', user.id),
      ])
      const physical = books?.filter(b => b.format === 'hardcover' || b.format === 'paperback').length || 0
      const ebook = books?.filter(b => b.format === 'ebook').length || 0
      const audiobook = books?.filter(b => b.format === 'audiobook').length || 0
      setProfile({ ...profile, email: user.email })
      setNewName(profile?.display_name || '')
      setStats({ total: books?.length || 0, physical, ebook, audiobook, wishlist: wish || 0, pending: pending || 0 })
      setLoading(false)
    }
    fetchProfile()
  }, [])

  async function handleSaveName() {
    if (!newName.trim()) return alert('Please enter a name.')
    setSavingName(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ display_name: newName.trim() }).eq('id', user.id)
    setProfile(p => ({ ...p, display_name: newName.trim() }))
    setEditingName(false)
    setSavingName(false)
  }

  async function fixMissingCovers() {
    setFixingCovers(true)
    setFixProgress(0)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: books } = await supabase
      .from('books')
      .select('id, isbn, cover_image_url')
      .eq('owner_id', user.id)
      .or('cover_image_url.is.null,cover_image_url.eq.')
    const fixable = (books || []).filter(b => b.isbn && b.isbn.length >= 10)
    let fixed = 0
    for (let i = 0; i < fixable.length; i++) {
      const book = fixable[i]
      try {
        const olUrl = `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg`
        const olRes = await fetch(olUrl)
        if (olRes.ok && olRes.headers.get('content-type')?.includes('image')) {
          const blob = await olRes.blob()
          if (blob.size > 5000) {
            await supabase.from('books').update({ cover_image_url: olUrl }).eq('id', book.id)
            fixed++
            await new Promise(r => setTimeout(r, 300))
            setFixProgress(Math.round(((i + 1) / fixable.length) * 100))
            continue
          }
        }
        const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${book.isbn}`)
        const data = await res.json()
        if (data.items?.length > 0) {
          const url = data.items[0].volumeInfo?.imageLinks?.thumbnail?.replace('http:', 'https:')
          if (url) {
            await supabase.from('books').update({ cover_image_url: url }).eq('id', book.id)
            fixed++
          }
        }
      } catch {}
      await new Promise(r => setTimeout(r, 300))
      setFixProgress(Math.round(((i + 1) / fixable.length) * 100))
    }
    alert(`Done! Fixed covers for ${fixed} of ${fixable.length} books.`)
    setFixingCovers(false)
    setFixProgress(0)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
      <p style={{ color: T.tealLight, fontFamily: 'Georgia, serif' }}>Loading...</p>
    </div>
  )

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: T.bg, minHeight: '100vh' }}>
      <div style={{ background: T.header, padding: '32px 20px 48px', textAlign: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: '16px' }}>
  	  <Avatar profile={profile} size={80} />
  	  <button onClick={() => setShowAvatarPicker(true)} style={{ position: 'absolute', bottom: 0, right: 0, background: T.teal, border: 'none', borderRadius: '50%', width: '26px', height: '26px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
   	   ✏️
  	  </button>
	{showAvatarPicker && (
  	  <AvatarPicker
    	    currentAvatar={profile?.avatar_url}
   	    onSaved={(url) => setProfile(p => ({ ...p, avatar_url: url }))}
    	    onClose={() => setShowAvatarPicker(false)}
  	  />
	)}
	</div>

        {/* Editable name */}
        {editingName ? (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center', marginBottom: '8px' }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveName()}
              autoFocus
              style={{ background: 'rgba(255,255,255,0.1)', border: `1px solid ${T.tealBorder}`, borderRadius: '8px', padding: '8px 12px', color: T.white, fontSize: '18px', fontFamily: 'Georgia, serif', textAlign: 'center', outline: 'none', width: '200px' }}
            />
            <button onClick={handleSaveName} disabled={savingName} style={{ background: T.teal, color: T.white, border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '13px', fontWeight: 'bold' }}>
              {savingName ? '...' : 'Save'}
            </button>
            <button onClick={() => { setEditingName(false); setNewName(profile?.display_name || '') }} style={{ background: 'rgba(255,255,255,0.1)', color: T.muted, border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontSize: '13px' }}>
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
            <h1 style={{ color: T.white, margin: 0, fontSize: '24px' }}>{profile?.display_name || 'Book Babe'}</h1>
            <button onClick={() => setEditingName(true)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px', color: T.muted }}>
              ✏️ Edit
            </button>
          </div>
        )}

        <p style={{ color: T.tealLight, margin: '0 0 8px', fontSize: '14px' }}>{profile?.email}</p>
        {profile?.role === 'admin' && (
          <span style={{ background: T.goldDim, color: T.goldLight, fontSize: '12px', padding: '4px 12px', borderRadius: '12px', border: `1px solid ${T.goldBorder}` }}>
            ✨ Admin
          </span>
        )}
      </div>

      <div style={{ padding: '0 16px', marginTop: '-24px' }}>
        <div style={{ background: T.card, borderRadius: '16px', padding: '20px', marginBottom: '12px', border: `1px solid ${T.tealBorder}`, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', textAlign: 'center' }}>
          <p style={{ margin: '0 0 4px', fontSize: '42px', fontWeight: 'bold', color: T.goldLight }}>{stats.total}</p>
          <p style={{ margin: 0, fontSize: '14px', color: T.tealLight, fontWeight: 'bold' }}>Total Books in Library</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          {[
            { count: stats.physical, label: 'Physical', emoji: '📖' },
            { count: stats.ebook, label: 'Ebooks', emoji: '📱' },
            { count: stats.audiobook, label: 'Audio', emoji: '🎧' },
          ].map(stat => (
            <div key={stat.label} style={{ background: T.card, borderRadius: '14px', padding: '16px 12px', textAlign: 'center', border: `1px solid ${T.tealBorder}`, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
              <p style={{ margin: '0 0 4px', fontSize: '22px' }}>{stat.emoji}</p>
              <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: T.goldLight }}>{stat.count}</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: T.muted }}>{stat.label}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          {[
            { count: stats.wishlist, label: 'Wishlist', emoji: '💫' },
            { count: stats.pending, label: 'Pending', emoji: '📦' },
          ].map(stat => (
            <div key={stat.label} style={{ background: T.card, borderRadius: '14px', padding: '16px 12px', textAlign: 'center', border: `1px solid ${T.tealBorder}`, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
              <p style={{ margin: '0 0 4px', fontSize: '22px' }}>{stat.emoji}</p>
              <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: T.goldLight }}>{stat.count}</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: T.muted }}>{stat.label}</p>
            </div>
          ))}
        </div>

        <div style={{ background: T.card, borderRadius: '16px', overflow: 'hidden', border: `1px solid ${T.tealBorder}`, marginBottom: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.tealBorder}`, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: T.muted, fontSize: '13px' }}>Member since</span>
            <span style={{ color: T.white, fontSize: '13px', fontWeight: 'bold' }}>
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
            </span>
          </div>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.tealBorder}`, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: T.muted, fontSize: '13px' }}>Role</span>
            <span style={{ color: T.tealLight, fontSize: '13px', fontWeight: 'bold', textTransform: 'capitalize' }}>{profile?.role || 'Member'}</span>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: T.muted, fontSize: '13px' }}>Squad</span>
            <span style={{ color: T.goldLight, fontSize: '13px', fontWeight: 'bold' }}>Unhinged Book Babes 💀</span>
          </div>
        </div>

        <button onClick={fixMissingCovers} disabled={fixingCovers} style={{
          width: '100%', padding: '14px', borderRadius: '12px',
          background: fixingCovers ? 'rgba(13,148,136,0.1)' : T.tealDim,
          color: T.tealLight, border: `1px solid ${T.tealBorder}`,
          fontSize: '15px', fontWeight: 'bold', cursor: fixingCovers ? 'not-allowed' : 'pointer',
          fontFamily: 'Georgia, serif', marginBottom: '12px'
        }}>
          {fixingCovers ? `🔍 Fetching covers... ${fixProgress}%` : '🖼️ Fix Missing Covers'}
        </button>

        <button onClick={() => window.location.href = '/import'} style={{
          width: '100%', padding: '14px', borderRadius: '12px',
          background: T.tealDim, color: T.tealLight,
          border: `1px solid ${T.tealBorder}`,
          fontSize: '15px', fontWeight: 'bold', cursor: 'pointer',
          fontFamily: 'Georgia, serif', marginBottom: '12px'
        }}>
          📥 Import from Book Buddy
        </button>

        <button onClick={handleSignOut} style={{
          width: '100%', padding: '14px', borderRadius: '12px',
          background: 'rgba(239,68,68,0.08)', color: '#f87171',
          border: '1px solid rgba(239,68,68,0.25)',
          fontSize: '15px', fontWeight: 'bold', cursor: 'pointer',
          fontFamily: 'Georgia, serif', marginBottom: '32px'
        }}>
          Sign Out
        </button>
      </div>
    </div>
  )
}