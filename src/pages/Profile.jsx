import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [bookCount, setBookCount] = useState(0)
  const [wishCount, setWishCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: profile }, { count: books }, { count: wish }, { count: pending }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('books').select('*', { count: 'exact', head: true }).eq('owner_id', user.id),
        supabase.from('wishlist').select('*', { count: 'exact', head: true }).eq('owner_id', user.id),
        supabase.from('pending_purchases').select('*', { count: 'exact', head: true }).eq('owner_id', user.id),
      ])
      setProfile({ ...profile, email: user.email })
      setBookCount(books || 0)
      setWishCount(wish || 0)
      setPendingCount(pending || 0)
      setLoading(false)
    }
    fetchProfile()
  }, [])

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
      {/* Header */}
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
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          {[
            { count: bookCount, label: 'Books', emoji: '📖' },
            { count: wishCount, label: 'Wishlist', emoji: '💫' },
            { count: pendingCount, label: 'Pending', emoji: '📦' },
          ].map(stat => (
            <div key={stat.label} style={{ background: T.card, borderRadius: '14px', padding: '16px 12px', textAlign: 'center', border: `1px solid ${T.tealBorder}`, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
              <p style={{ margin: '0 0 4px', fontSize: '24px' }}>{stat.emoji}</p>
              <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: T.goldLight }}>{stat.count}</p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: T.muted }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Info card */}
        <div style={{ background: T.card, borderRadius: '16px', overflow: 'hidden', border: `1px solid ${T.tealBorder}`, marginBottom: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
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

        {/* Sign out */}
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