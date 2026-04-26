import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [bookCount, setBookCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      const { count } = await supabase
        .from('books')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', user.id)
      setProfile({ ...profile, email: user.email })
      setBookCount(count || 0)
      setLoading(false)
    }
    fetchProfile()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#faf5fc' }}>
      <p style={{ color: '#8b5e83', fontFamily: 'Georgia, serif' }}>Loading...</p>
    </div>
  )

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: '#faf5fc', minHeight: '100vh' }}>
      <div style={{ background: '#4a2c6b', padding: '20px 20px 40px' }}>
        <h1 style={{ color: '#fff', margin: 0, fontSize: '22px' }}>🌸 Profile</h1>
      </div>

      <div style={{ padding: '0 20px', marginTop: '-20px' }}>
        <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(74,44,107,0.08)', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', flexShrink: 0 }}>
              📚
            </div>
            <div>
              <h2 style={{ margin: 0, color: '#4a2c6b', fontSize: '20px' }}>{profile?.display_name || 'Book Babe'}</h2>
              <p style={{ margin: '4px 0 0', color: '#8b5e83', fontSize: '14px' }}>{profile?.email}</p>
              {profile?.role === 'admin' && (
                <span style={{ background: '#4a2c6b', color: '#fff', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', marginTop: '6px', display: 'inline-block' }}>Admin</span>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: '#f3e8ff', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#4a2c6b' }}>{bookCount}</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#8b5e83' }}>Books in Library</p>
            </div>
            <div style={{ background: '#f3e8ff', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#4a2c6b' }}>📖</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#8b5e83' }}>Unhinged Book Babe</p>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(74,44,107,0.08)', marginBottom: '16px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3e8ff' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Member since</p>
            <p style={{ margin: '4px 0 0', color: '#4a2c6b', fontWeight: 'bold' }}>
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
            </p>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Role</p>
            <p style={{ margin: '4px 0 0', color: '#4a2c6b', fontWeight: 'bold', textTransform: 'capitalize' }}>{profile?.role || 'Member'}</p>
          </div>
        </div>

        <button onClick={handleSignOut} style={{
          width: '100%', padding: '14px', borderRadius: '12px',
          background: '#fff', color: '#dc2626', border: '1px solid #fecaca',
          fontSize: '15px', fontWeight: 'bold', cursor: 'pointer',
          fontFamily: 'Georgia, serif', marginBottom: '32px'
        }}>
          Sign Out
        </button>
      </div>
    </div>
  )
}