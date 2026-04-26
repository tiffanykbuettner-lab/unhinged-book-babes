import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState({ total: 0, physical: 0, ebook: 0, audiobook: 0, wishlist: 0, pending: 0 })
  const [loading, setLoading] = useState(true)
  const [fixingCovers, setFixingCovers] = useState(false)
  const [fixProgress, setFixProgress] = useState(0)

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
      setStats({ total: books?.length || 0, physical, ebook, audiobook, wishlist: wish || 0, pending: pending || 0 })
      setLoading(false)
    }
    fetchProfile()
  }, [])
async function fixMissingCovers() {
    setFixingCovers(true)
    setFixProgress(0)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: books } = await supabase
      .from('books')
      .select('id, isbn, cover_image_url')
      .eq('owner_id', user.id)
      .or('cover_image_url.is.null,cover_image_url.eq.')
      .neq('isbn', '')
    
    const fixable = (books || []).filter(b => b.isbn && b.isbn.length >= 10)
    let fixed = 0

    for (let i = 0; i < fixable.length; i++) {
      const book = fixable[i]
      try {
        // Try Google Books first
        const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${book.isbn}`)
        const data = await res.json()
        if (data.items?.length > 0) {
          const url = data.items[0].volumeInfo?.imageLinks?.thumbnail?.replace('http:', 'https:')
          if (url) {
            await supabase.from('books').update({ cover_image_url: url }).eq('id', book.id)
            fixed++
            await new Promise(r => setTimeout(r, 500))
            setFixProgress(Math.round(((i + 1) / fixable.length) * 100))
            continue
          }
        }
        // Fallback to Open Library
        const res2 = await fetch(`https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg?default=false`)
        if (res2.ok) {
          const url = `https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg`
          await supabase.from('books').update({ cover_image_url: url }).eq('id', book.id)
          fixed++
        }
      } catch {}
      await new Promise(r => setTimeout(r, 500))
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
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: T.tealDim, border: `2px solid ${T.tealBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', margin: '0 auto 16px' }}>
          💀
        </div>
        <h1 style={{ color: T.white, margin: '0 0 4px', fontSize: '24px' }}>{profile?.display_name || 'Book Babe'}</h1>
        <p style={{ color: T.tealLight, margin: '0 0 8px', fontSize: '14px' }}>{profile?.email}</p>
        {profile?.role === 'admin' && (
          <span style={{ background: T.goldDim, color: T.goldLight, fontSize: '12px', padding: '4px 12px', borderRadius: '12px', border: `1px solid ${T.goldBorder}` }}>
            ✨ Admin
          </span>
        )}
      </div>

      <div style={{ padding: '0 16px', marginTop: '-24px' }}>

        {/* Total library card */}
        <div style={{ background: T.card, borderRadius: '16px', padding: '20px', marginBottom: '12px', border: `1px solid ${T.tealBorder}`, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', textAlign: 'center' }}>
          <p style={{ margin: '0 0 4px', fontSize: '42px', fontWeight: 'bold', color: T.goldLight }}>{stats.total}</p>
          <p style={{ margin: 0, fontSize: '14px', color: T.tealLight, fontWeight: 'bold' }}>Total Books in Library</p>
        </div>

        {/* Format breakdown */}
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

        {/* Wishlist & Pending */}
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

        {/* Info card */}
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