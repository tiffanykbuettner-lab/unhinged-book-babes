import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'

export default function CoverUpload({ onUploaded, currentUrl }) {
  const fileRef = useRef(null)
  const cameraRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(currentUrl || null)

  async function handleFile(file) {
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const filename = `cover_${Date.now()}.${ext}`
    const { data, error } = await supabase.storage
      .from('covers')
      .upload(filename, file, { contentType: file.type, upsert: true })

    if (error) {
      alert('Upload failed: ' + error.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(filename)
    setPreview(publicUrl)
    onUploaded(publicUrl)
    setUploading(false)
  }

  return (
    <div>
      {preview && (
        <div style={{ marginBottom: '12px', borderRadius: '10px', overflow: 'hidden', height: '160px', background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={preview} alt="Cover" style={{ height: '100%', objectFit: 'contain' }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        {/* Upload from files */}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])} />
        <button onClick={() => fileRef.current.click()} disabled={uploading}
          style={{ flex: 1, padding: '10px', borderRadius: '8px', background: T.tealDim, color: T.tealLight, border: `1px solid ${T.tealBorder}`, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '13px', fontWeight: 'bold' }}>
          {uploading ? 'Uploading...' : '🖼️ Upload Photo'}
        </button>

        {/* Take photo with camera */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])} />
        <button onClick={() => cameraRef.current.click()} disabled={uploading}
          style={{ flex: 1, padding: '10px', borderRadius: '8px', background: T.goldDim, color: T.goldLight, border: `1px solid ${T.goldBorder}`, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '13px', fontWeight: 'bold' }}>
          {uploading ? '...' : '📷 Take Photo'}
        </button>
      </div>
    </div>
  )
}