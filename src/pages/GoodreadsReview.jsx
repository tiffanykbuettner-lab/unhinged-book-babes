import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'
import { findCatalogMatch } from '../lib/goodreadsMatching'

const panel = {
  background: T.surface,
  border: `1px solid ${T.tealBorder}`,
  borderRadius: '14px',
  padding: '18px',
  marginBottom: '14px',
}

const buttonStyle = {
  padding: '9px 12px',
  borderRadius: '8px',
  border: `1px solid ${T.tealBorder}`,
  background: T.tealDim,
  color: T.tealLight,
  fontWeight: 700,
  cursor: 'pointer',
}

const primaryButton = { ...buttonStyle, background: T.teal, color: T.white }

const chip = { background: T.tealDim, color: T.tealLight, borderRadius: '6px', padding: '4px 7px', fontSize: '11px' }

const PAGE_SIZE = 100

function field(raw, name) {
  const key = Object.keys(raw || {}).find(k => k.toLowerCase() === name.toLowerCase())
  return key ? raw[key] || '' : ''
}

function statusLabel(status) {
  return ({
    want_to_read: 'Want to read',
    currently_reading: 'Currently reading',
    read: 'Read',
    paused_dnf: 'Paused / DNF',
  })[status] || 'No reading status'
}

function reviewLabel(status) {
  return ({
    needs_review: 'Needs review',
    approved: 'Approved — ready to add',
    skipped: 'Skipped',
    applied: 'Added to TBR',
  })[status] || status
}

// Pulls "Possible Library book: …" out of the notes written at staging time.
function libraryBookNote(row) {
  return String(row.resolution_notes || '')
    .split(' | ')
    .find(note => note.startsWith('Possible Library book:'))
    ?.replace('Possible Library book:', '')
    .trim() || ''
}

function skipNote(row) {
  return String(row.resolution_notes || '')
    .split(' | ')
    .find(note => note.startsWith('Import skipped:')) || ''
}

// Splits a list of ids into chunks so large bulk updates stay within request limits.
function chunks(list, size = 200) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export default function GoodreadsReview() {
  const navigate = useNavigate()
  const [batch, setBatch] = useState(null)
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('needs_review')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [skippedRows, setSkippedRows] = useState([])
  const [expandedId, setExpandedId] = useState('')

  useEffect(() => {
    loadLatestImport()
  }, [])

  async function loadLatestImport() {
    setLoading(true)
    setError('')
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('Please sign in again.')

      const { data: imports, error: importError } = await supabase
        .from('goodreads_imports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)

      if (importError) throw importError
      const latest = imports?.[0]
      if (!latest) {
        setBatch(null)
        setRows([])
        return
      }
      setBatch(latest)

      const stagedRows = []
      const pageSize = 500
      let offset = 0

      while (true) {
        const { data: page, error: rowsError } = await supabase
          .from('goodreads_import_rows')
          .select('*')
          .eq('import_id', latest.id)
          .order('row_number', { ascending: true })
          .range(offset, offset + pageSize - 1)

        if (rowsError) throw rowsError
        stagedRows.push(...(page || []))

        if (!page || page.length < pageSize) break
        offset += pageSize
      }

      setRows(stagedRows)
    } catch (err) {
      setError(err.message || 'Could not load the Goodreads review queue.')
    } finally {
      setLoading(false)
    }
  }

  const counts = useMemo(() => ({
    all: rows.length,
    needs_review: rows.filter(row => row.review_status === 'needs_review').length,
    high: rows.filter(row => row.match_confidence === 'high').length,
    low: rows.filter(row => row.match_confidence === 'low').length,
    unmatched: rows.filter(row => row.match_confidence === 'unmatched').length,
    approved: rows.filter(row => row.review_status === 'approved').length,
    skipped: rows.filter(row => row.review_status === 'skipped').length,
    applied: rows.filter(row => row.review_status === 'applied').length,
  }), [rows])

  // Rows the bulk buttons would approve.
  const bulkLikely = useMemo(() => rows.filter(row =>
    row.review_status === 'needs_review' &&
    row.match_confidence === 'high' &&
    row.proposed_work_id &&
    row.proposed_status
  ), [rows])

  const bulkUnmatched = useMemo(() => rows.filter(row =>
    row.review_status === 'needs_review' &&
    row.match_confidence === 'unmatched' &&
    !row.proposed_work_id &&
    row.proposed_status
  ), [rows])

  const visibleRows = useMemo(() => rows.filter(row => {
    if (filter === 'all') return true
    if (filter === 'needs_review') return row.review_status === 'needs_review'
    if (filter === 'high') return row.match_confidence === 'high'
    if (filter === 'low') return row.match_confidence === 'low'
    if (filter === 'unmatched') return row.match_confidence === 'unmatched'
    if (filter === 'approved') return row.review_status === 'approved'
    if (filter === 'skipped') return row.review_status === 'skipped'
    if (filter === 'applied') return row.review_status === 'applied'
    return true
  }), [rows, filter])

  function patchRows(ids, changes) {
    const idSet = new Set(ids)
    setRows(current => current.map(item => (idSet.has(item.id) ? { ...item, ...changes } : item)))
  }

  async function updateRows(ids, changes) {
    for (const part of chunks(ids)) {
      const { error: updateError } = await supabase
        .from('goodreads_import_rows')
        .update(changes)
        .in('id', part)
        .eq('import_id', batch.id)
      if (updateError) throw updateError
    }
    patchRows(ids, changes)
  }

  // Re-runs matching against the current Library. Only touches rows still waiting
  // for review, so decisions you've already made are never changed.
  async function recheckMatches() {
    if (!batch || busyId) return
    setBusyId('recheck')
    setError('')
    setMessage('')

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('Please sign in again.')

      const { data: catalog, error: catalogError } = await supabase
        .from('books')
        .select('id, title, author, isbn, read_status, work_id')
        .eq('owner_id', user.id)

      if (catalogError) throw catalogError

      const pending = rows.filter(row => row.review_status === 'needs_review')
      for (const row of pending) {
        const match = findCatalogMatch(row.raw_row || {}, catalog || [])
        const preservedNotes = String(row.resolution_notes || '')
          .split(' | ')
          .filter(note =>
            note &&
            !note.startsWith('Match check:') &&
            !note.startsWith('Possible Library book:') &&
            !note.startsWith('Matched Library book ID:') &&
            !note.startsWith('Marked as a different book')
          )

        const changes = {
          match_confidence: match.confidence,
          proposed_work_id: match.book?.work_id || null,
          resolution_notes: [
            `Match check: ${match.reason}`,
            match.book
              ? `Possible Library book: ${match.book.title} — ${match.book.author || 'Author not listed'}`
              : '',
            ...preservedNotes,
          ].filter(Boolean).join(' | '),
        }

        const { error: updateError } = await supabase
          .from('goodreads_import_rows')
          .update(changes)
          .eq('id', row.id)
          .eq('import_id', batch.id)
          .eq('review_status', 'needs_review')

        if (updateError) throw updateError
        patchRows([row.id], changes)
      }

      setMessage(`Rechecked ${pending.length.toLocaleString()} rows that still need review. Approved, skipped and added rows were not changed.`)
    } catch (err) {
      setError(`Match recheck stopped: ${err.message || 'Unknown error'}. Some rows may have been rechecked; your Library was not changed.`)
    } finally {
      setBusyId('')
    }
  }

  // decision: 'same' (link to the Library book), 'new' (add as a separate book),
  //           'skip', or 'undo' (back to needs review)
  async function decide(row, decision) {
    if (busyId) return
    setBusyId(row.id)
    setError('')
    setMessage('')
    const title = field(row.raw_row, 'Title') || 'Untitled book'

    try {
      if (decision === 'same') {
        await updateRows([row.id], { review_status: 'approved' })
        setMessage(`Approved "${title}" as the same book you own.`)
      } else if (decision === 'new') {
        const notes = [`Marked as a different book from: ${libraryBookNote(row) || 'the suggested Library book'}`,
          ...String(row.resolution_notes || '').split(' | ').filter(note => note && !note.startsWith('Marked as a different book'))]
          .join(' | ')
        await updateRows([row.id], {
          review_status: 'approved',
          proposed_work_id: null,
          match_confidence: 'unmatched',
          resolution_notes: notes,
        })
        setMessage(`Approved "${title}" as a separate book. It will be added to your TBR as not owned.`)
      } else if (decision === 'skip') {
        await updateRows([row.id], { review_status: 'skipped' })
        setMessage(`Skipped "${title}". It won't be added.`)
      } else if (decision === 'undo') {
        await updateRows([row.id], { review_status: 'needs_review' })
        setMessage(`"${title}" is back in Needs review. Use "Recheck matches" if you want the Library match suggested again.`)
      }
    } catch (err) {
      setError(`Could not update this row: ${err.message || 'Unknown error'}`)
    } finally {
      setBusyId('')
    }
  }

  async function bulkApprove(kind) {
    if (!batch || busyId) return
    const target = kind === 'likely' ? bulkLikely : bulkUnmatched
    if (!target.length) return

    const prompt = kind === 'likely'
      ? `Approve all ${target.length} likely matches as the same book you own?\n\nThey'll be added to your TBR with their Goodreads status when you click "Add approved books to my TBR".`
      : `Approve all ${target.length} books with no Library match?\n\nThey'll be added to your TBR as books you don't own yet when you click "Add approved books to my TBR".`
    if (!window.confirm(prompt)) return

    setBusyId(`bulk-${kind}`)
    setError('')
    setMessage('')
    try {
      await updateRows(target.map(row => row.id), { review_status: 'approved' })
      setMessage(`Approved ${target.length.toLocaleString()} rows. Nothing has been added yet — click "Add approved books to my TBR" when you're ready.`)
    } catch (err) {
      setError(`Bulk approval stopped: ${err.message || 'Unknown error'}. Some rows may have been approved; the counts above are current.`)
      await loadLatestImport()
    } finally {
      setBusyId('')
    }
  }

  async function addApprovedToTBR() {
    if (!batch || busyId) return
    if (!counts.approved) {
      setMessage('There are no approved rows to add yet. Approve rows first, then come back to this button.')
      return
    }

    if (!window.confirm(
      `Add ${counts.approved.toLocaleString()} approved books to your TBR?\n\nBooks already in your TBR keep their current status and notes. Your Library is not changed.`
    )) return

    setBusyId('add')
    setError('')
    setMessage('')
    setSkippedRows([])

    try {
      const { data, error: importError } = await supabase.rpc(
        'import_goodreads_reading_batch',
        { p_import_id: batch.id }
      )

      if (importError) throw importError

      const result = data || {}
      const parts = [
        `${(result.added || 0).toLocaleString()} added to your TBR`,
        result.new_books ? `${result.new_books.toLocaleString()} of them new to your catalog` : '',
        result.already_in_tbr ? `${result.already_in_tbr.toLocaleString()} were already in your TBR and kept their status` : '',
        result.skipped ? `${result.skipped.toLocaleString()} sent back to Needs review (reasons below)` : '',
      ].filter(Boolean)

      setMessage(`Done: ${parts.join(' · ')}.`)
      setSkippedRows(result.skipped_rows || [])
      await loadLatestImport()
    } catch (err) {
      setError(`Adding to TBR failed: ${err.message || 'Unknown error'}. Nothing from this attempt was saved — it's safe to try again.`)
    } finally {
      setBusyId('')
    }
  }

  async function updateBatchStatus(status) {
    if (!batch || busyId) return
    setBusyId('batch')
    setError('')
    setMessage('')
    try {
      const { error: updateError } = await supabase
        .from('goodreads_imports')
        .update({ status })
        .eq('id', batch.id)

      if (updateError) throw updateError
      setBatch(current => ({ ...current, status }))
      setMessage(`Import status updated to "${status}". Your Library and TBR were not changed.`)
    } catch (err) {
      setError(`Could not update import status: ${err.message || 'Unknown error'}`)
    } finally {
      setBusyId('')
    }
  }

  function rowActions(row) {
    const busy = !!busyId
    const label = text => (busyId === row.id ? 'Saving…' : text)

    if (row.review_status === 'applied') {
      return <div style={{ color: T.muted, fontSize: '12px', marginTop: '10px' }}>Added to your TBR.</div>
    }

    if (row.review_status === 'approved' || row.review_status === 'skipped') {
      return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
          <span style={{ color: T.muted, fontSize: '12px' }}>{reviewLabel(row.review_status)}</span>
          <button disabled={busy} onClick={() => decide(row, 'undo')} style={buttonStyle}>{label('Undo')}</button>
        </div>
      )
    }

    if (!row.proposed_status) {
      return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
          <span style={{ color: T.goldLight, fontSize: '12px' }}>
            This Goodreads shelf doesn't map to a reading status, so it can't be added.
          </span>
          <button disabled={busy} onClick={() => decide(row, 'skip')} style={buttonStyle}>{label('Skip row')}</button>
        </div>
      )
    }

    if (row.proposed_work_id) {
      return (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
          <button disabled={busy} onClick={() => decide(row, 'same')} style={primaryButton}>{label('Same book I own')}</button>
          <button disabled={busy} onClick={() => decide(row, 'new')} style={buttonStyle}>Different book — add separately</button>
          <button disabled={busy} onClick={() => decide(row, 'skip')} style={buttonStyle}>Skip</button>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
        <button disabled={busy} onClick={() => decide(row, 'new')} style={primaryButton}>{label('Approve — add to my TBR')}</button>
        <button disabled={busy} onClick={() => decide(row, 'skip')} style={buttonStyle}>Skip</button>
      </div>
    )
  }

  return (
    <section style={{ padding: '28px', color: T.white, maxWidth: '1100px', margin: '0 auto' }}>
      <button onClick={() => navigate('/goodreads-import')} style={{ ...buttonStyle, marginBottom: '18px' }}>
        ← Back to Goodreads Import
      </button>

      <header style={{ marginBottom: '22px' }}>
        <p style={{ color: T.gold, letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: '12px' }}>
          Your reading history, carefully reviewed
        </p>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '34px', margin: '8px 0', color: T.white }}>
          Goodreads Review
        </h1>
        <p style={{ color: T.muted, lineHeight: 1.6 }}>
          Approve the Goodreads books you want in your TBR, then add them in one step. Approving never changes your Library — books you own stay exactly as they are.
        </p>
      </header>

      {error && <div role="alert" style={{ ...panel, borderColor: '#b45353', color: '#ffb4b4' }}>{error}</div>}
      {message && <div role="status" style={{ ...panel, borderColor: T.teal, color: T.tealLight }}>{message}</div>}
      {skippedRows.length > 0 && (
        <div style={{ ...panel, borderColor: T.goldBorder }}>
          <div style={{ color: T.goldLight, fontWeight: 700, marginBottom: '8px' }}>Sent back to Needs review</div>
          <ul style={{ margin: 0, paddingLeft: '18px', color: T.muted, fontSize: '13px', lineHeight: 1.7 }}>
            {skippedRows.map(item => (
              <li key={item.row_number}><span style={{ color: T.white }}>{item.title}</span> — {item.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div style={panel}>Loading your latest Goodreads import…</div>
      ) : !batch ? (
        <div style={panel}>
          No Goodreads import was found for your account yet.
        </div>
      ) : (
        <>
          <div style={panel}>
            <h2 style={{ marginTop: 0, color: T.tealLight, fontSize: '20px' }}>Import overview</h2>
            <div style={{ color: T.white, fontWeight: 700 }}>{batch.original_filename || 'Goodreads export'}</div>
            <p style={{ color: T.muted, marginBottom: '8px' }}>
              Created {new Date(batch.created_at).toLocaleString()} · Import status: {batch.status}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
              {[
                ['Total rows', counts.all],
                ['Needs review', counts.needs_review],
                ['Approved', counts.approved],
                ['Added to TBR', counts.applied],
                ['Skipped', counts.skipped],
              ].map(([label, count]) => (
                <div key={label} style={{ background: T.bg, border: `1px solid ${T.tealBorder}`, borderRadius: '10px', padding: '12px' }}>
                  <div style={{ color: T.muted, fontSize: '12px' }}>{label}</div>
                  <div style={{ color: T.tealLight, fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>{count.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={panel}>
            <h2 style={{ marginTop: 0, color: T.tealLight, fontSize: '20px' }}>1. Approve</h2>
            <p style={{ color: T.muted, fontSize: '13px', lineHeight: 1.6, marginTop: 0 }}>
              Approve rows one at a time below, or in bulk here. "Possible matches" always need a look one by one.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button disabled={!!busyId || !bulkLikely.length} onClick={() => bulkApprove('likely')}
                style={{ ...buttonStyle, opacity: bulkLikely.length ? 1 : 0.5 }}>
                {busyId === 'bulk-likely' ? 'Approving…' : `Approve all likely matches (${bulkLikely.length.toLocaleString()})`}
              </button>
              <button disabled={!!busyId || !bulkUnmatched.length} onClick={() => bulkApprove('unmatched')}
                style={{ ...buttonStyle, opacity: bulkUnmatched.length ? 1 : 0.5 }}>
                {busyId === 'bulk-unmatched' ? 'Approving…' : `Approve all books I don't own (${bulkUnmatched.length.toLocaleString()})`}
              </button>
              <button disabled={!!busyId} onClick={recheckMatches} style={buttonStyle}>
                {busyId === 'recheck' ? 'Rechecking matches…' : 'Recheck matches'}
              </button>
            </div>

            <h2 style={{ margin: '20px 0 8px', color: T.tealLight, fontSize: '20px' }}>2. Add to TBR</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button disabled={!!busyId || !counts.approved} onClick={addApprovedToTBR}
                style={{ ...primaryButton, opacity: counts.approved ? 1 : 0.5 }}>
                {busyId === 'add' ? 'Adding to your TBR…' : `Add ${counts.approved.toLocaleString()} approved books to my TBR`}
              </button>
              <button disabled={!!busyId} onClick={() => updateBatchStatus('cancelled')} style={buttonStyle}>Cancel this import</button>
            </div>
          </div>

          <div style={panel}>
            <h2 style={{ marginTop: 0, color: T.tealLight, fontSize: '20px' }}>Review rows</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {[
                ['needs_review', 'Needs review', counts.needs_review],
                ['high', 'Likely matches', counts.high],
                ['low', 'Possible matches', counts.low],
                ['unmatched', 'Not in my Library', counts.unmatched],
                ['approved', 'Approved', counts.approved],
                ['applied', 'Added to TBR', counts.applied],
                ['skipped', 'Skipped', counts.skipped],
                ['all', 'All rows', counts.all],
              ].map(([value, label, count]) => (
                <button key={value} onClick={() => { setFilter(value); setVisibleCount(PAGE_SIZE) }} style={{
                  ...buttonStyle,
                  background: filter === value ? T.teal : T.tealDim,
                  color: filter === value ? T.white : T.tealLight,
                }}>
                  {label} ({count.toLocaleString()})
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gap: '10px' }}>
              {visibleRows.slice(0, visibleCount).map(row => {
                const raw = row.raw_row || {}
                const expanded = expandedId === row.id
                const libraryBook = libraryBookNote(row)
                const skipped = skipNote(row)
                return (
                  <article key={row.id} style={{ border: `1px solid ${T.tealBorder}`, borderRadius: '10px', padding: '14px', background: T.bg }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 300px' }}>
                        <div style={{ color: T.white, fontWeight: 700 }}>{field(raw, 'Title') || '(Untitled book)'}</div>
                        <div style={{ color: T.tealLight, fontSize: '13px', marginTop: '4px' }}>{field(raw, 'Author') || 'Author not provided'}</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                          <span style={chip}>Goodreads shelf: {field(raw, 'Exclusive Shelf') || 'not set'}</span>
                          <span style={chip}>Will be: {statusLabel(row.proposed_status)}</span>
                          {field(raw, 'My Rating') && field(raw, 'My Rating') !== '0' && (
                            <span style={{ ...chip, background: T.goldDim, color: T.goldLight }}>Your rating: {field(raw, 'My Rating')}★</span>
                          )}
                          {field(raw, 'Date Read') && <span style={chip}>Read: {field(raw, 'Date Read')}</span>}
                        </div>
                        {row.review_status === 'needs_review' && row.proposed_work_id && libraryBook && (
                          <p style={{ color: row.match_confidence === 'low' ? T.goldLight : T.muted, fontSize: '12px', lineHeight: 1.5, margin: '8px 0 0' }}>
                            {row.match_confidence === 'low' ? 'Possible match — please check: ' : 'Looks like your Library copy of: '}
                            <span style={{ color: T.white }}>{libraryBook}</span>
                          </p>
                        )}
                        {row.review_status === 'needs_review' && !row.proposed_work_id && (
                          <p style={{ color: T.muted, fontSize: '12px', margin: '8px 0 0' }}>
                            Not in your Library — will be added to your TBR as not owned.
                          </p>
                        )}
                        {skipped && row.review_status === 'needs_review' && (
                          <p style={{ color: T.goldLight, fontSize: '12px', margin: '8px 0 0' }}>{skipped}</p>
                        )}
                      </div>
                      <button onClick={() => setExpandedId(expanded ? '' : row.id)} style={buttonStyle}>
                        {expanded ? 'Hide Goodreads details' : 'Goodreads details'}
                      </button>
                    </div>

                    {expanded && (
                      <div style={{ marginTop: '12px', borderTop: `1px solid ${T.tealBorder}`, paddingTop: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                          {Object.entries(raw).map(([key, value]) => (
                            <div key={key} style={{ padding: '8px', borderRadius: '7px', background: T.surface, overflowWrap: 'anywhere' }}>
                              <div style={{ color: T.goldLight, fontSize: '11px', marginBottom: '3px' }}>{key}</div>
                              <div style={{ color: T.white, fontSize: '12px', whiteSpace: 'pre-wrap' }}>{String(value ?? '') || '—'}</div>
                            </div>
                          ))}
                        </div>
                        {row.resolution_notes && (
                          <p style={{ color: T.muted, fontSize: '11px', lineHeight: 1.5, marginBottom: 0 }}>Notes: {row.resolution_notes}</p>
                        )}
                      </div>
                    )}

                    {rowActions(row)}
                  </article>
                )
              })}
              {visibleRows.length > visibleCount && (
                <button onClick={() => setVisibleCount(count => count + PAGE_SIZE)} style={{ ...buttonStyle, justifySelf: 'start' }}>
                  Show more ({(visibleRows.length - visibleCount).toLocaleString()} remaining)
                </button>
              )}
              {visibleRows.length === 0 && <p style={{ color: T.muted }}>No rows match this filter.</p>}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
