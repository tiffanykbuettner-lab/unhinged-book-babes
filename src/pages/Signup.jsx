import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSignup(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            display_name: displayName,
            role: 'member'
          })
      }    
    setSuccess(true)
    setLoading(false)
  }

  if (success) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #faf5fc 0%, #f3e8ff 100%)', padding: '24px', fontFamily: 'Georgia, serif', textAlign: 'center' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌸</div>
      <h2 style={{ color: '#4a2c6b', marginBottom: '12px' }}>You're in!</h2>
      <p style={{ color: '#8b5e83', marginBottom: '24px' }}>Check your email to confirm your account, then come back to sign in.</p>
      <Link to="/login" style={{ color: '#4a2c6b', fontWeight: 'bold' }}>Back to Sign In</Link>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #faf5fc 0%, #f3e8ff 100%)', padding: '24px', fontFamily: 'Georgia, serif' }}>
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>📚</div>
        <h1 style={{ fontSize: '28px', color: '#4a2c6b', margin: 0, fontWeight: 'bold' }}>Unhinged Book Babes</h1>
        <p style={{ color: '#8b5e83', marginTop: '8px', fontSize: '15px' }}>Your private library, shared with your people.</p>
      </div>
      <div style={{ background: '#fff', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '400px', boxShadow: '0 4px 24px rgba(74,44,107,0.08)' }}>
        <h2 style={{ color: '#4a2c6b', marginTop: 0, marginBottom: '24px', fontSize: '20px' }}>Join the club 📖</h2>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#dc2626', fontSize: '14px' }}>{error}</div>
        )}
        <form onSubmit={handleSignup}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#4a2c6b', fontWeight: 'bold', marginBottom: '6px', fontSize: '14px' }}>Your Name</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} required placeholder="What should we call you?" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d8c5e0', fontSize: '15px', boxSizing: 'border-box', outline: 'none' }} />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#4a2c6b', fontWeight: 'bold', marginBottom: '6px', fontSize: '14px' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d8c5e0', fontSize: '15px', boxSizing: 'border-box', outline: 'none' }} />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', color: '#4a2c6b', fontWeight: 'bold', marginBottom: '6px', fontSize: '14px' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" minLength={6} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d8c5e0', fontSize: '15px', boxSizing: 'border-box', outline: 'none' }} />
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#4a2c6b', color: '#fff', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
            {loading ? 'Creating your account...' : 'Create Account'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#6b7280' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#8b5e83', fontWeight: 'bold' }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}