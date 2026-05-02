import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'

const EMOJIS = [
  '📚', '💀', '🌙', '⭐', '🔮', '🌊', '🦋', '🌸',
  '🐉', '🧙', '🦄', '🌺', '🍄', '🦊', '🐺', '🌿',
  '💎', '🔥', '❄️', '🌙', '🦁', '🐍', '🦅', '🌹',
  '🧿', '⚡', '🌈', '🎭', '🏴‍☠️', '🧜', '🧝', '🧚',
]

export default function AvatarPicker({ currentAvatar, onSaved, onClose }) {
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState(currentAvatar || null)

  async function handlePhoto(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const filename = `avatar_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('covers').upload(filename, file, { contentType: file.type, upsert: true })
    if (error) { alert('Upload failed: ' + error.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(filename)
    setSelected(publicUrl)
    setUploading(false)
  }

  async function handleSave() {
    if (!selected) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ avatar_url: selected }).eq('id', user.id)
    onSaved(selected)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: T.surface, borderRadius: '20px', maxWidth: '440px', width: '100%', overflow: 'hidden', border: `1px solid ${T.tealBorder}` }}>
        <div style={{ background: T.header, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: T.white, margin: 0, fontSize: '18px', fontFamily: 'Georgia, serif' }}>Choose Your Avatar</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.white, fontSize: '22px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Preview */}
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: T.tealDim, border: `2px solid ${T.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '36px', overflow: 'hidden' }}>
              {selected?.startsWith('http')
                ? <img src={selected} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : selected || '💀'}
            </div>
            <p style={{ color: T.muted, fontSize: '12px', marginTop: '8px', fontFamily: 'Georgia, serif' }}>Preview</p>
          </div>

          {/* Photo upload */}
          <div style={{ marginBottom: '16px' }}>
            <p style={{ color: T.tealLight, fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', fontFamily: 'Georgia, serif' }}>📷 Upload a photo</p>
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => fileRef.current.click()} disabled={uploading} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: T.tealDim, color: T.tealLight, border: `1px solid ${T.tealBorder}`, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '13px', fontWeight: 'bold' }}>
                {uploading ? 'Uploading...' : '🖼️ Choose Photo'}
              </button>
              <input type="file" accept="image/*" capture="user" onChange={handlePhoto} style={{ display: 'none' }} ref={el => el && (el.id = 'camera-input')} />
              <button onClick={() => document.getElementById('camera-input')?.click()} disabled={uploading} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: T.goldDim, color: T.goldLight, border: `1px solid ${T.goldBorder}`, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '13px', fontWeight: 'bold' }}>
                📸 Take Selfie
              </button>
            </div>
          </div>

          {/* Emoji grid */}
          <div style={{ marginBottom: '20px' }}>
            <p style={{ color: T.tealLight, fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', fontFamily: 'Georgia, serif' }}>✨ Or pick an emoji</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '8px' }}>
              {EMOJIS.map(emoji => (
                <button key={emoji} onClick={() => setSelected(emoji)} style={{
                  fontSize: '24px', padding: '6px', borderRadius: '8px', cursor: 'pointer', border: 'none',
                  background: selected === emoji ? T.tealDim : 'rgba(255,255,255,0.05)',
                  boxShadow: selected === emoji ? `0 0 0 2px ${T.teal}` : 'none',
                  transition: 'all 0.15s'
                }}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleSave} disabled={!selected} style={{ width: '100%', padding: '13px', borderRadius: '10px', background: selected ? T.teal : T.tealDim, color: T.white, border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: selected ? 'pointer' : 'not-allowed', fontFamily: 'Georgia, serif', boxShadow: selected ? '0 4px 15px rgba(13,148,136,0.4)' : 'none' }}>
            ✨ Save Avatar
          </button>
        </div>
      </div>
    </div>
  )
}