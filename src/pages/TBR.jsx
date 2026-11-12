import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'
import { fetchAll } from '../lib/fetchAll'
import TBRDiscoveries from '../components/TBRDiscoveries'

const statuses = [
  { value: 'all', label: 'All books' },
  { value: 'want_to_read', label: 'Want to read' },
  { value: 'currently_reading', label: 'Currently reading' },
  { value: 'read', label: 'Read' },
  { value: 'paused_dnf', label: 'Paused / DNF' },
]

const statusLabels = Object.fromEntries(
  statuses.filter(item => item.value !== 'all').map(item => [item.value, item.label])
)

const inputStyle = {
  padding: '12px 14px',
  borderRadius: '10px',
  border: `1px solid ${T.goldBorder}`,
  background: T.surface,
  color: T.white,
  fontSize: '14px',
}

const buttonStyle = {
  padding: '10px 14px',
  borderRadius: '9px',
  border: `1px solid ${T.goldBorder}`,
  background: T.surface,
  color: T.goldLight,
  cursor: 'pointer',
  fontSize: '13px',
}

export default function TBR() {
  const [status, setStatus] = useState('want_to_read')
  const [ownership, setOwnership] = useState('all')
  const [search, setSearch] = useState('')
  const [works, setWorks] = useState([])
  const [entries, setEntries] = useState([])
  const [ownedWorkIds, setOwnedWorkIds] = useState([])
  const [editions, setEditions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyWorkId, setBusyWorkId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError

      const user = authData?.user
      if (!user) {
        setWorks([])
        setEntries([])
        setOwnedWorkIds([])
        setEditions([])
        setError('Please sign in to view your TBR.')
        return
      }

      const [worksResult, entriesResult, ownedResult, editionsResult] = await Promise.all([
        fetchAll(() => supabase
          .from('works')
          .select('id, title, primary_author, series_name, series_position, description')
          .order('title', { ascending: true })
          .order('id', { ascending: true })),
        fetchAll(() => supabase
          .from('tbr_entries')
          .select('id, user_id, work_id, status, priority, user_notes, added_via')
          .eq('user_id', user.id)
          .order('id', { ascending: true })),
        fetchAll(() => supabase
          .from('owned_copies')
          .select('work_id')
          .eq('owner_id', user.id)
          .order('id', { ascending: true })),
        fetchAll(() => supabase
          .from('book_editions')
          .select('id, work_id, cover_image_url, format, edition_name')
          .order('id', { ascending: true })),
      ])

      for (const result of [worksResult, entriesResult, ownedResult, editionsResult]) {
        if (result.error) throw result.error
      }

      setWorks(worksResult.data ?? [])
      setEntries(entriesResult.data ?? [])
      setOwnedWorkIds([...new Set((ownedResult.data ?? []).map(copy => copy.work_id).filter(Boolean))])
      setEditions(editionsResult.data ?? [])
    } catch (err) {
      setError(err?.message || 'Something went wrong loading your TBR.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const entriesByWork = useMemo(
    () => new Map(entries.map(entry => [entry.work_id, entry])),
    [entries]
  )

  const ownedIds = useMemo(() => new Set(ownedWorkIds), [ownedWorkIds])

  const editionByWork = useMemo(() => {
    const map = new Map()
    for (const edition of editions) {
      if (!map.has(edition.work_id)) map.set(edition.work_id, edition)
      if (!map.get(edition.work_id)?.cover_image_url && edition.cover_image_url) {
        map.set(edition.work_id, edition)
      }
    }
    return map
  }, [editions])

  const filteredWorks = useMemo(() => {
    const term = search.trim().toLowerCase()

    return works.filter(work => {
      const entry = entriesByWork.get(work.id)
      const isOwned = ownedIds.has(work.id)

      if (term && ![
        work.title,
        work.primary_author,
        work.series_name,
      ].some(value => value?.toLowerCase().includes(term))) return false

      if (ownership === 'owned' && !isOwned) return false
      if (ownership === 'unowned' && isOwned) return false

      if (status !== 'all' && entry?.status !== status) return false

      return true
    })
  }, [works, entriesByWork, ownedIds, search, ownership, status])

  async function addToTbr(work) {
    setBusyWorkId(work.id)
    setError('')
    setNotice('')

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!authData?.user) throw new Error('Please sign in before adding a book.')

      const { data, error: insertError } = await supabase
        .from('tbr_entries')
        .insert({
          user_id: authData.user.id,
          work_id: work.id,
          status: 'want_to_read',
          added_via: 'manual',
        })
        .select('id, user_id, work_id, status, priority, user_notes, added_via')
        .single()

      if (insertError) throw insertError

      setEntries(current => [...current, data])
      setNotice(`Added "${work.title}" to your TBR.`)
    } catch (err) {
      setError(err?.code === '23505'
        ? 'This book is already on your TBR.'
        : err?.message || 'Could not add this book.')
    } finally {
      setBusyWorkId(null)
    }
  }

  async function updateStatus(entry, nextStatus) {
    setBusyWorkId(entry.work_id)
    setError('')
    setNotice('')

    try {
      const { data, error: updateError } = await supabase
        .from('tbr_entries')
        .update({ status: nextStatus })
        .eq('id', entry.id)
        .select('id, user_id, work_id, status, priority, user_notes, added_via')
        .single()

      if (updateError) throw updateError

      setEntries(current => current.map(item => item.id === data.id ? data : item))
      setNotice(`Reading status updated to "${statusLabels[nextStatus]}".`)
    } catch (err) {
      setError(err?.message || 'Could not update reading status.')
    } finally {
      setBusyWorkId(null)
    }
  }

  async function removeFromTbr(entry, title) {
    if (!window.confirm(`Remove "${title}" from your TBR? This will not remove it from your Library.`)) return

    setBusyWorkId(entry.work_id)
    setError('')
    setNotice('')

    try {
      const { error: deleteError } = await supabase
        .from('tbr_entries')
        .delete()
        .eq('id', entry.id)

      if (deleteError) throw deleteError

      setEntries(current => current.filter(item => item.id !== entry.id))
      setNotice(`Removed "${title}" from your TBR. Your Library is unchanged.`)
    } catch (err) {
      setError(err?.message || 'Could not remove this TBR entry.')
    } finally {
      setBusyWorkId(null)
    }
  }

  return (
    <section style={{ padding: '32px', color: T.white, maxWidth: '1200px', margin: '0 auto' }}>
      <TBRDiscoveries />
     <header style={{ marginBottom: '28px' }}>
        <p style={{ color: T.gold, letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: '12px' }}>
          Your next favorite read
        </p>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '36px', margin: '8px 0', color: T.white }}>
          My TBR
        </h1>
        <p style={{ color: T.muted, lineHeight: 1.6, maxWidth: '640px' }}>
          Every book you want to read, all in one cozy place. Add books intentionally, whether they are already on your shelves or still to be discovered.
        </p>
        <p style={{ color: T.subtle, fontSize: '13px', marginTop: '12px' }}>
          {entries.length} {entries.length === 1 ? 'book' : 'books'} on your TBR · {ownedIds.size} owned works in your catalog
        </p>
      </header>

      {error && (
        <div role="alert" style={{ padding: '14px 16px', marginBottom: '16px', borderRadius: '10px', border: '1px solid #b66a6a', color: '#ffb8b8', background: T.surface }}>
          {error}
          <button type="button" onClick={loadData} style={{ ...buttonStyle, marginLeft: '12px' }}>Retry</button>
        </div>
      )}

      {notice && (
        <div role="status" style={{ padding: '12px 16px', marginBottom: '16px', borderRadius: '10px', border: `1px solid ${T.goldBorder}`, color: T.goldLight }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
        <input
          aria-label="Search books"
          placeholder="Search titles, authors, or series..."
          value={search}
          onChange={event => setSearch(event.target.value)}
          style={{ ...inputStyle, flex: '1 1 240px', minWidth: 0 }}
        />
        <select
          aria-label="Filter by reading status"
          value={status}
          onChange={event => setStatus(event.target.value)}
          style={{ ...inputStyle, flex: '1 1 190px' }}
        >
          {statuses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select
          aria-label="Filter by ownership"
          value={ownership}
          onChange={event => setOwnership(event.target.value)}
          style={{ ...inputStyle, flex: '1 1 170px' }}
        >
          <option value="all">Owned & unowned</option>
          <option value="owned">On my shelves</option>
          <option value="unowned">Not owned yet</option>
        </select>
        <button type="button" onClick={loadData} disabled={loading} style={buttonStyle}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <Link
          to="/goodreads-import"
          style={{ ...buttonStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
        >
          Import from Goodreads
        </Link>
      </div>

      {ownership === 'unowned' && (
        <p style={{ color: T.muted, fontSize: '13px', marginBottom: '20px' }}>
          The current catalog is built from your existing Library. Unowned discoveries will appear here once book discovery is connected.
        </p>
      )}

      {loading ? (
        <div style={{ background: T.surface, border: `1px solid ${T.goldBorder}`, borderRadius: '16px', padding: '32px', textAlign: 'center', color: T.muted }}>
          Loading your books…
        </div>
      ) : filteredWorks.length === 0 ? (
        <div style={{ background: T.surface, border: `1px solid ${T.goldBorder}`, borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
          <div aria-hidden="true" style={{ fontSize: '36px', marginBottom: '12px' }}>📚</div>
          <h2 style={{ fontFamily: 'Georgia, serif', color: T.goldLight, fontSize: '23px', margin: '0 0 10px' }}>
            {status === 'all' ? 'No books found' : `No books marked "${statusLabels[status]}" yet`}
          </h2>
          <p style={{ color: T.muted, lineHeight: 1.7 }}>
            {status === 'all'
              ? 'Try a different search or filter.'
              : 'Choose “All books” to find a title and add it to your TBR.'}
          </p>
        </div>
      ) : (
        <>
          <p style={{ color: T.muted, fontSize: '13px', marginBottom: '16px' }}>
            Showing {filteredWorks.length} {filteredWorks.length === 1 ? 'book' : 'books'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(245px, 1fr))', gap: '16px' }}>
            {filteredWorks.map(work => {
              const entry = entriesByWork.get(work.id)
              const edition = editionByWork.get(work.id)
              const isBusy = busyWorkId === work.id

              return (
                <article
                  key={work.id}
                  style={{ display: 'flex', flexDirection: 'column', background: T.surface, border: `1px solid ${T.goldBorder}`, borderRadius: '14px', overflow: 'hidden' }}
                >
                  {edition?.cover_image_url ? (
                    <img
                      src={edition.cover_image_url}
                      alt={`Cover of ${work.title}`}
                      loading="lazy"
                      style={{ width: '100%', height: '190px', objectFit: 'contain', padding: '12px', boxSizing: 'border-box', background: 'rgba(0,0,0,0.12)' }}
                    />
                  ) : (
                    <div aria-hidden="true" style={{ height: '90px', display: 'grid', placeItems: 'center', fontSize: '32px', background: 'rgba(0,0,0,0.12)' }}>
                      📖
                    </div>
                  )}

                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                    <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '19px', lineHeight: 1.3, margin: 0, color: T.white }}>
                      {work.title}
                    </h2>
                    {work.primary_author && <p style={{ margin: 0, color: T.muted, fontSize: '14px' }}>{work.primary_author}</p>}
                    {work.series_name && (
                      <p style={{ margin: 0, color: T.subtle, fontSize: '12px' }}>
                        {work.series_name}{work.series_position != null ? ` · Book ${work.series_position}` : ''}
                      </p>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                      <span style={{ border: `1px solid ${T.goldBorder}`, borderRadius: '999px', padding: '4px 8px', fontSize: '11px', color: T.muted }}>
                        {ownedIds.has(work.id) ? 'On my shelves' : 'Not owned yet'}
                      </span>
                      {entry && (
                        <span style={{ border: `1px solid ${T.goldBorder}`, borderRadius: '999px', padding: '4px 8px', fontSize: '11px', color: T.goldLight }}>
                          {statusLabels[entry.status] || entry.status}
                        </span>
                      )}
                    </div>

                    {entry ? (
                      <>
                        <label style={{ color: T.muted, fontSize: '12px' }}>
                          Reading status
                          <select
                            aria-label={`Reading status for ${work.title}`}
                            value={entry.status}
                            disabled={isBusy}
                            onChange={event => updateStatus(entry, event.target.value)}
                            style={{ ...inputStyle, width: '100%', marginTop: '6px', boxSizing: 'border-box' }}
                          >
                            {statuses.filter(item => item.value !== 'all').map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => removeFromTbr(entry, work.title)}
                          style={{ ...buttonStyle, marginTop: 'auto', color: T.muted }}
                        >
                          {isBusy ? 'Saving…' : 'Remove from TBR'}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => addToTbr(work)}
                        style={{ ...buttonStyle, marginTop: 'auto', background: 'rgba(190, 153, 88, 0.12)' }}
                      >
                        {isBusy ? 'Adding…' : '+ Add to TBR'}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </>
            )}

    </section>
  )
}
