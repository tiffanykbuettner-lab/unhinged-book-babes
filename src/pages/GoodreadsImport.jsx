import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'
import { valueFor, cleanISBN, findCatalogMatch } from '../lib/goodreadsMatching'

function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i++
      row.push(field)
      if (row.some(value => value.length > 0)) rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }

  if (field.length || row.length) {
    row.push(field)
    if (row.some(value => value.length > 0)) rows.push(row)
  }

  if (rows.length < 2) throw new Error('This file does not appear to contain Goodreads book rows.')

  const headers = rows[0].map(header => header.trim())
  if (!headers.some(header => header.toLowerCase() === 'title') ||
      !headers.some(header => header.toLowerCase() === 'exclusive shelf')) {
    throw new Error('This does not look like a Goodreads library export. Please select goodreads_library_export.csv.')
  }

  return rows.slice(1).map((values, index) => {
    const raw = {}
    headers.forEach((header, i) => {
      raw[header] = values[i] ?? ''
    })
    return { row_number: index + 1, raw }
  }).filter(item => Object.values(item.raw).some(value => value.trim()))
}

function proposedStatus(raw) {
  const shelf = valueFor(raw, 'Exclusive Shelf').toLowerCase().trim()
  if (shelf === 'currently-reading') return 'currently_reading'
  if (shelf === 'read') return 'read'
  if (shelf === 'paused' || shelf === 'dnf' || shelf === 'did-not-finish') return 'paused_dnf'
  if (shelf === 'to-read' || shelf === 'want-to-read' || shelf === 'tbr') return 'want_to_read'
  return null
}

const panel = {
  background: T.surface,
  border: `1px solid ${T.tealBorder}`,
  borderRadius: '14px',
  padding: '20px',
  marginBottom: '16px',
}

const buttonStyle = {
  padding: '12px 16px',
  borderRadius: '10px',
  border: 'none',
  background: T.teal,
  color: T.white,
  fontWeight: 700,
  cursor: 'pointer',
}

export default function GoodreadsImport() {
  const navigate = useNavigate()
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [catalogBooks, setCatalogBooks] = useState([])
  const [matchReady, setMatchReady] = useState(false)

  function handleFile(event) {
    const file = event.target.files?.[0]
    setError('')
    setMessage('')
    setRows([])
    setCatalogBooks([])
    setMatchReady(false)
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a CSV file.')
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      try {
        let contents = String(reader.result ?? '')
        if (contents.charCodeAt(0) === 0xFEFF) contents = contents.slice(1)
        const parsed = parseCSV(contents)
        setRows(parsed)
        setFileName(file.name)

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!user) throw new Error('Please sign in again before checking Library matches.')

        const { data: catalog, error: catalogError } = await supabase
          .from('books')
          .select('id, title, author, isbn, read_status, work_id')
          .eq('owner_id', user.id)

        if (catalogError) throw catalogError
        setCatalogBooks(catalog || [])
        setMatchReady(true)
      } catch (err) {
        setError(`Could not check your Library: ${err.message || 'Unknown error'}. No import rows have been staged.`)
        setMatchReady(false)
      }
    }
    reader.onerror = () => setError('The file could not be read. Please try again.')
    reader.readAsText(file, 'UTF-8')
    event.target.value = ''
  }

  async function stageImport() {
    if (!rows.length || busy || !matchReady) return
    setBusy(true)
    setError('')
    setMessage('')
    setProgress(0)

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('Please sign in again before importing.')

      const { data: batch, error: batchError } = await supabase
        .from('goodreads_imports')
        .insert({
          user_id: user.id,
          source_name: 'goodreads',
          status: 'uploaded',
          original_filename: fileName,
          row_count: rows.length,
          imported_count: 0,
          skipped_count: 0,
        })
        .select('id')
        .single()

      if (batchError) throw batchError

      const chunkSize = 100
      for (let start = 0; start < rows.length; start += chunkSize) {
        const chunk = rows.slice(start, start + chunkSize).map(item => {
          const raw = item.raw
          const title = valueFor(raw, 'Title').trim()
          const author = valueFor(raw, 'Author').trim()
          const shelf = valueFor(raw, 'Exclusive Shelf').trim()
          const match = findCatalogMatch(raw, catalogBooks)

          return {
            import_id: batch.id,
            row_number: item.row_number,
            raw_row: raw,
            proposed_status: proposedStatus(raw),
            match_confidence: match.confidence,
            // Likely and possible matches point at the Library book's catalog work.
            // Nothing is linked until you approve the row in Goodreads Review.
            proposed_work_id: match.book?.work_id || null,
            review_status: 'needs_review',
            resolution_notes: [
              `Match check: ${match.reason}`,
              match.book ? `Possible Library book: ${match.book.title} — ${match.book.author || 'Author not listed'} (status: ${match.book.read_status || 'not set'})` : '',
              title ? `Title: ${title}` : 'Missing title',
              author ? `Author: ${author}` : 'Missing author',
              shelf ? `Goodreads shelf: ${shelf}` : 'No exclusive shelf',
              cleanISBN(valueFor(raw, 'ISBN13')) ? `ISBN-13: ${cleanISBN(valueFor(raw, 'ISBN13'))}` : '',
              cleanISBN(valueFor(raw, 'ISBN')) ? `ISBN: ${cleanISBN(valueFor(raw, 'ISBN'))}` : '',
            ].filter(Boolean).join(' | '),
          }
        })

        const { error: rowError } = await supabase
          .from('goodreads_import_rows')
          .insert(chunk)

        if (rowError) throw rowError
        setProgress(Math.min(100, Math.round(((start + chunk.length) / rows.length) * 100)))
      }

      const { error: updateError } = await supabase
        .from('goodreads_imports')
        .update({ status: 'reviewing' })
        .eq('id', batch.id)

      if (updateError) throw updateError

      setMessage(`Staged ${rows.length.toLocaleString()} Goodreads rows for review. Your Library has not been changed.`)
      setRows([])
    } catch (err) {
      setError(`Could not finish staging the import: ${err.message || 'Unknown error'}. Your Library books were not changed. Check the import list before retrying to avoid creating a duplicate batch.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ padding: '32px', color: T.white, maxWidth: '1000px', margin: '0 auto' }}>
      <button onClick={() => navigate('/')} style={{ background: 'transparent', border: `1px solid ${T.tealBorder}`, color: T.tealLight, borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>
        ← Back to My Library
      </button>

      <header style={{ margin: '24px 0' }}>
        <p style={{ color: T.gold, letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: '12px' }}>
          Your reading history, safely preserved
        </p>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '36px', margin: '8px 0', color: T.white }}>
          Goodreads Import
        </h1>
        <p style={{ color: T.muted, lineHeight: 1.7, maxWidth: '720px' }}>
          Upload your Goodreads library export to preview and stage its rows for review. Ratings, dates, shelves, notes, and every other CSV column are preserved in the original row data.
        </p>
      </header>

      <div style={panel}>
        <h2 style={{ marginTop: 0, color: T.tealLight, fontSize: '19px' }}>1. Choose your Goodreads export</h2>
        <p style={{ color: T.muted, lineHeight: 1.6 }}>
          Select <strong>goodreads_library_export.csv</strong>. This step only reads the file in your browser.
        </p>
        <label style={{ ...buttonStyle, display: 'inline-block' }}>
          Choose CSV file
          <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
        </label>
        {fileName && <p style={{ color: T.tealLight, marginBottom: 0 }}>Selected: {fileName}</p>}
      </div>

      {error && (
        <div role="alert" style={{ ...panel, borderColor: '#b45353', color: '#ffb4b4', lineHeight: 1.6 }}>
          {error}
        </div>
      )}

      {message && (
        <div role="status" style={{ ...panel, borderColor: T.teal, color: T.tealLight, lineHeight: 1.7 }}>
          {message}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={panel}>
            <h2 style={{ marginTop: 0, color: T.tealLight, fontSize: '19px' }}>2. Review the preview</h2>
            <p style={{ color: T.white, fontSize: '24px', fontWeight: 700, margin: '8px 0' }}>
              {rows.length.toLocaleString()} rows found
            </p>
            <p style={{ color: T.muted, lineHeight: 1.6 }}>
              Proposed reading status comes from Goodreads’ Exclusive Shelf. All original CSV fields, including custom shelves, ratings, dates and notes, are preserved. Your Library has not been changed.
            </p>
            {matchReady && (() => {
              const matches = rows.map(item => findCatalogMatch(item.raw, catalogBooks))
              const high = matches.filter(match => match.confidence === 'high').length
              const low = matches.filter(match => match.confidence === 'low').length
              const unmatched = matches.filter(match => match.confidence === 'unmatched').length
              return (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <span style={{ background: T.tealDim, color: T.tealLight, borderRadius: '8px', padding: '7px 10px', fontSize: '12px' }}>{catalogBooks.length} Library books checked</span>
                  <span style={{ background: T.tealDim, color: T.tealLight, borderRadius: '8px', padding: '7px 10px', fontSize: '12px' }}>{high} likely matches</span>
                  <span style={{ background: T.goldDim, color: T.goldLight, borderRadius: '8px', padding: '7px 10px', fontSize: '12px' }}>{low} possible matches to review</span>
                  <span style={{ background: T.bg, color: T.muted, borderRadius: '8px', padding: '7px 10px', fontSize: '12px' }}>{unmatched} no likely match</span>
                </div>
              )
            })()}
            <div style={{ display: 'grid', gap: '10px' }}>
              {rows.slice(0, 5).map(item => {
                const raw = item.raw
                return (
                  <div key={item.row_number} style={{ background: T.bg, border: `1px solid ${T.tealBorder}`, borderRadius: '10px', padding: '12px' }}>
                    <div style={{ color: T.white, fontWeight: 700 }}>{valueFor(raw, 'Title') || '(Untitled row)'}</div>
                    <div style={{ color: T.tealLight, fontSize: '13px', marginTop: '4px' }}>{valueFor(raw, 'Author') || 'Author not provided'}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                      {[valueFor(raw, 'Exclusive Shelf') ? `Shelf: ${valueFor(raw, 'Exclusive Shelf')}` : '', proposedStatus(raw) ? `Proposed: ${proposedStatus(raw).replace(/_/g, ' ')}` : 'Status needs review', valueFor(raw, 'My Rating') ? `Rating: ${valueFor(raw, 'My Rating')}` : '', valueFor(raw, 'Date Read') ? `Read: ${valueFor(raw, 'Date Read')}` : ''].filter(Boolean).map((label, index) => (
                        <span key={index} style={{ background: T.tealDim, color: T.tealLight, borderRadius: '6px', padding: '3px 7px', fontSize: '11px' }}>{label}</span>
                      ))}
                    </div>
                    <div style={{ color: T.muted, fontSize: '11px', marginTop: '8px' }}>
                      {Object.keys(raw).length} original CSV fields preserved
                    </div>
                    {matchReady && (() => {
                      const match = findCatalogMatch(raw, catalogBooks)
                      return (
                        <div style={{ color: match.confidence === 'high' ? T.tealLight : match.confidence === 'low' ? T.goldLight : T.muted, fontSize: '12px', marginTop: '7px' }}>
                          {match.confidence === 'high' ? 'Likely Library match' : match.confidence === 'low' ? 'Possible match — check manually' : 'No likely Library match'}
                          {match.book ? `: ${match.book.title} — ${match.book.author || 'Author not listed'}` : ''}
                          {' · '}{match.reason}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={panel}>
            <h2 style={{ marginTop: 0, color: T.tealLight, fontSize: '19px' }}>3. Stage for review</h2>
            <p style={{ color: T.muted, lineHeight: 1.6 }}>
              Staging stores the original CSV rows in the private Goodreads review tables. It does not add, update, or delete Library books. Every row starts as needing review — nothing reaches your TBR until you approve it.
            </p>
            {busy && (
              <div aria-live="polite" style={{ marginBottom: '14px', color: T.tealLight }}>
                Saving review rows… {progress}%
                <div style={{ background: T.bg, borderRadius: '8px', overflow: 'hidden', height: '8px', marginTop: '8px' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: T.teal, transition: 'width 0.2s' }} />
                </div>
              </div>
            )}
            <button disabled={busy} onClick={stageImport} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Staging Goodreads rows…' : `Stage ${rows.length.toLocaleString()} rows for review`}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
