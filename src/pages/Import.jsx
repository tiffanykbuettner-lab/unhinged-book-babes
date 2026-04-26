import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'

function parseCSV(text) {
  const lines = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      lines[lines.length - 1]?.push(current.trim())
      current = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current || lines.length > 0) {
        if (!lines.length) lines.push([])
        lines[lines.length - 1].push(current.trim())
        if (ch === '\r' && text[i + 1] === '\n') i++
        lines.push([])
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current) lines[lines.length - 1]?.push(current.trim())
  return lines.filter(l => l.length > 1)
}

function mapStatus(status) {
  if (!status) return 'owned'
  const s = status.toLowerCase()
  if (s.includes('read') && !s.includes('unread') && !s.includes('being')) return 'read'
  if (s.includes('unread')) return 'unread'
  if (s.includes('being') || s.includes('reading')) return 'rereading'
  return 'owned'
}

function mapFormat(format) {
  if (!format) return 'hardcover'
  const f = format.toLowerCase()
  if (f.includes('ebook') || f.includes('kindle') || f.includes('digital')) return 'ebook'
  if (f.includes('audio')) return 'audiobook'
  if (f.includes('paper')) return 'paperback'
  return 'hardcover'
}

function cleanISBN(isbn) {
  if (!isbn) return ''
  const clean = isbn.replace(/[^0-9X]/gi, '')
  if (clean.length >= 10) return clean
  const num = parseFloat(isbn)
  if (!isNaN(num)) return Math.round(num).toString()
  return ''
}

export default function Import({ onDone }) {
  const [step, setStep] = useState('upload')
  const [preview, setPreview] = useState([])
  const [parsed, setParsed] = useState([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState(null)
  const [fileName, setFileName] = useState('')

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      const rows = parseCSV(text)
      if (rows.length < 2) { alert('Could not parse CSV file.'); return }
      const headers = rows[0]
      const books = rows.slice(1).map(row => {
        const get = (col) => {
          const idx = headers.findIndex(h => h.toLowerCase() === col.toLowerCase())
          return idx >= 0 ? (row[idx] || '') : ''
        }
        return {
          title: get('Title'),
          author: get('Author'),
          series: get('Series'),
          volume_number: get('Volume'),
          edition_name: get('Edition'),
          publisher: get('Publisher'),
          publication_year: get('Year Published') ? parseInt(get('Year Published')) : null,
          format: mapFormat(get('Format')),
          isbn: cleanISBN(get('ISBN')),
          notes: get('Notes'),
          read_status: mapStatus(get('Status')),
          cover_image_url: get('Uploaded Image URL') || '',
          special_features: '',
        }
      }).filter(b => b.title)
      setParsed(books)
      setPreview(books.slice(0, 5))
      setStep('preview')
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    setImporting(true)
    setStep('importing')
    const { data: { user } } = await supabase.auth.getUser()
    const { data: existing } = await supabase.from('books').select('title').eq('owner_id', user.id)
    const existingTitles = new Set((existing || []).map(b => b.title?.toLowerCase().trim()))
    let added = 0, skipped = 0, errors = 0
    const BATCH = 20
    for (let i = 0; i < parsed.length; i += BATCH) {
      const batch = parsed.slice(i, i + BATCH)
        .filter(b => !existingTitles.has(b.title?.toLowerCase().trim()))
        .map(b => ({ ...b, owner_id: user.id }))
      if (batch.length > 0) {
        const { error } = await supabase.from('books').insert(batch)
        if (error) errors += batch.length
        else added += batch.length
      }
      skipped += parsed.slice(i, i + BATCH).length - batch.length
      setProgress(Math.round(((i + BATCH) / parsed.length) * 100))
    }
    setResults({ added, skipped, errors, total: parsed.length })
    setStep('done')
    setImporting(false)
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: T.bg, minHeight: '100vh' }}>
      <div style={{ background: T.header, padding: '24px 20px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={onDone} style={{ background: 'none', border: 'none', color: T.tealLight, cursor: 'pointer', fontSize: '14px', fontFamily: 'Georgia, serif' }}>← Back</button>
        <h1 style={{ color: T.white, margin: 0, fontSize: '22px' }}>📥 Import from Book Buddy</h1>
      </div>

      <div style={{ padding: '20px', maxWidth: '480px', margin: '0 auto' }}>

        {step === 'upload' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: T.card, borderRadius: '16px', padding: '40px 24px', border: `2px dashed ${T.tealBorder}`, marginBottom: '20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
              <h2 style={{ color: T.white, marginBottom: '8px', fontSize: '18px' }}>Upload your Book Buddy CSV</h2>
              <p style={{ color: T.muted, fontSize: '14px', marginBottom: '24px' }}>
                In Book Buddy: <span style={{ color: T.tealLight }}>Settings → Export → CSV</span>
              </p>
              <label style={{ background: T.teal, color: T.white, padding: '12px 24px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '15px', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(13,148,136,0.4)' }}>
                📁 Choose CSV File
                <input type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
              </label>
            </div>
            <p style={{ color: T.muted, fontSize: '13px' }}>Books already in your library will be skipped automatically.</p>
          </div>
        )}

        {step === 'preview' && (
          <>
            <div style={{ background: T.card, borderRadius: '16px', padding: '20px', border: `1px solid ${T.tealBorder}`, marginBottom: '16px' }}>
              <p style={{ color: T.tealLight, margin: '0 0 4px', fontSize: '13px' }}>File: {fileName}</p>
              <p style={{ color: T.white, margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
                {parsed.length} books found
              </p>
            </div>

            <h3 style={{ color: T.tealLight, fontSize: '14px', marginBottom: '12px' }}>Preview (first 5):</h3>
            {preview.map((book, i) => (
              <div key={i} style={{ background: T.card, borderRadius: '12px', padding: '14px', marginBottom: '10px', border: `1px solid ${T.tealBorder}` }}>
                <p style={{ margin: '0 0 4px', fontWeight: 'bold', color: T.white, fontSize: '14px' }}>{book.title}</p>
                <p style={{ margin: '0 0 4px', color: T.tealLight, fontSize: '13px' }}>{book.author}</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {book.series && <span style={{ background: T.tealDim, color: T.tealLight, fontSize: '11px', padding: '2px 8px', borderRadius: '6px' }}>{book.series}</span>}
                  {book.format && <span style={{ background: T.goldDim, color: T.goldLight, fontSize: '11px', padding: '2px 8px', borderRadius: '6px', textTransform: 'capitalize' }}>{book.format}</span>}
                  {book.read_status && <span style={{ background: 'rgba(255,255,255,0.05)', color: T.muted, fontSize: '11px', padding: '2px 8px', borderRadius: '6px', textTransform: 'capitalize' }}>{book.read_status}</span>}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setStep('upload')} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', color: T.muted, border: `1px solid ${T.tealBorder}`, fontSize: '14px', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
                Cancel
              </button>
              <button onClick={handleImport} style={{ flex: 2, padding: '12px', borderRadius: '10px', background: T.teal, color: T.white, border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', boxShadow: '0 4px 15px rgba(13,148,136,0.4)' }}>
                ✨ Import {parsed.length} Books
              </button>
            </div>
          </>
        )}

        {step === 'importing' && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📚</div>
            <h2 style={{ color: T.white, marginBottom: '8px' }}>Importing your library...</h2>
            <p style={{ color: T.muted, fontSize: '14px', marginBottom: '24px' }}>Please don't close this page</p>
            <div style={{ background: T.surface, borderRadius: '10px', height: '12px', overflow: 'hidden', border: `1px solid ${T.tealBorder}` }}>
              <div style={{ background: T.teal, height: '100%', width: `${progress}%`, transition: 'width 0.3s', borderRadius: '10px', boxShadow: '0 0 12px rgba(13,148,136,0.6)' }} />
            </div>
            <p style={{ color: T.tealLight, marginTop: '12px', fontSize: '14px' }}>{progress}%</p>
          </div>
        )}

        {step === 'done' && results && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: T.card, borderRadius: '16px', padding: '32px 24px', border: `1px solid ${T.tealBorder}`, marginBottom: '20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
              <h2 style={{ color: T.white, marginBottom: '20px' }}>Import Complete!</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: T.tealDim, borderRadius: '12px', padding: '16px', border: `1px solid ${T.tealBorder}` }}>
                  <p style={{ margin: '0 0 4px', fontSize: '28px', fontWeight: 'bold', color: T.tealLight }}>{results.added}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: T.muted }}>Added</p>
                </div>
                <div style={{ background: T.goldDim, borderRadius: '12px', padding: '16px', border: `1px solid ${T.goldBorder}` }}>
                  <p style={{ margin: '0 0 4px', fontSize: '28px', fontWeight: 'bold', color: T.goldLight }}>{results.skipped}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: T.muted }}>Skipped</p>
                </div>
                <div style={{ background: 'rgba(239,68,68,0.1)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <p style={{ margin: '0 0 4px', fontSize: '28px', fontWeight: 'bold', color: '#f87171' }}>{results.errors}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: T.muted }}>Errors</p>
                </div>
              </div>
              <p style={{ color: T.muted, fontSize: '13px' }}>Skipped books were already in your library</p>
            </div>
            <button onClick={onDone} style={{ width: '100%', padding: '14px', borderRadius: '10px', background: T.teal, color: T.white, border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', boxShadow: '0 4px 15px rgba(13,148,136,0.4)' }}>
              📖 Go to My Library
            </button>
          </div>
        )}
      </div>
    </div>
  )
}