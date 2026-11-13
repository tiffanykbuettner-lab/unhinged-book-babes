import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'
import { fetchAll } from '../lib/fetchAll'
import BookTagging from '../components/BookTagging'

const panel = {
  background: T.surface,
  border: `1px solid ${T.goldBorder}`,
  borderRadius: '14px',
  padding: '18px',
}

const buttonStyle = {
  padding: '12px 18px',
  borderRadius: '10px',
  border: 'none',
  background: T.teal,
  color: T.white,
  fontWeight: 700,
  cursor: 'pointer',
}

const formatLabel = format => {
  const value = String(format || '').toLowerCase()
  if (['ebook', 'kindle', 'e-book'].includes(value)) return 'Kindle / ebook'
  if (['audiobook', 'audio', 'audible'].includes(value)) return 'Audible / audiobook'
  if (['hardcover', 'paperback', 'physical'].includes(value)) return 'Physical'
  return value ? value[0].toUpperCase() + value.slice(1) : ''
}

const preferenceFormat = {
  physical: 'Physical',
  kindle: 'Kindle / ebook',
  audible: 'Audible / audiobook',
}

export default function Sommelier() {
  const [mood, setMood] = useState('')
  const [spice, setSpice] = useState('any')
  const [notes, setNotes] = useState('')
  const [priorityMode, setPriorityMode] = useState('surprise')
  const [preferredFormat, setPreferredFormat] = useState('any')
  const [includeDiscoveries, setIncludeDiscoveries] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [works, setWorks] = useState([])
  const [entries, setEntries] = useState([])
  const [ownedCopies, setOwnedCopies] = useState([])
  const [editions, setEditions] = useState([])
  const [recommendations, setRecommendations] = useState([])

  useEffect(() => {
    let active = true

    async function loadCatalog() {
      setLoading(true)
      setError('')
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!user) throw new Error('Please sign in to use your reading catalog.')

        const [worksResult, entriesResult, copiesResult, editionsResult, preferencesResult] = await Promise.all([
          fetchAll(() => supabase.from('works')
            .select('id, title, primary_author, series_name, series_position, description')
            .order('title', { ascending: true })
            .order('id', { ascending: true })),
          fetchAll(() => supabase.from('tbr_entries')
            .select('id, user_id, work_id, status, priority, user_notes, added_via')
            .eq('user_id', user.id)
            .order('id', { ascending: true })),
          fetchAll(() => supabase.from('owned_copies')
            .select('work_id, edition_id')
            .eq('owner_id', user.id)
            .order('id', { ascending: true })),
          fetchAll(() => supabase.from('book_editions')
            .select('id, work_id, format, edition_name, cover_image_url')
            .order('id', { ascending: true })),
          supabase.from('sommelier_preferences')
            .select('preferred_genres, preferred_tropes, preferred_moods, spice_preference, content_exclusions, other_preferences, discovery_enabled, priority_mode, preferred_format')
            .eq('user_id', user.id)
            .maybeSingle(),
        ])

        for (const result of [worksResult, entriesResult, copiesResult, editionsResult]) {
          if (result.error) throw result.error
        }
        if (preferencesResult.error) throw preferencesResult.error

        if (!active) return
        setWorks(worksResult.data || [])
        setEntries(entriesResult.data || [])
        setOwnedCopies(copiesResult.data || [])
        setEditions(editionsResult.data || [])

        const saved = preferencesResult.data
        if (saved) {
          const savedMood = Array.isArray(saved.preferred_moods) ? saved.preferred_moods[0] : ''
          setMood(savedMood || '')
          const spiceMap = {
            closed_door: 'low',
            mild: 'low',
            moderate: 'medium',
            very_spicy: 'high',
            explicit: 'high',
            flexible: 'any',
          }
          setSpice(spiceMap[saved.spice_preference] || 'any')
          setNotes(saved.other_preferences || '')
          setIncludeDiscoveries(Boolean(saved.discovery_enabled))
          setPriorityMode(saved.priority_mode || 'surprise')
          setPreferredFormat(saved.preferred_format || 'any')
        }
      } catch (err) {
        if (active) setError(err.message || 'Could not load your reading catalog.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCatalog()
    return () => { active = false }
  }, [])

  const catalog = useMemo(() => {
    const worksById = new Map(works.map(work => [work.id, work]))
    const editionsById = new Map(editions.map(edition => [edition.id, edition]))
    const editionsByWork = new Map()
    const ownedWorkIds = new Set()

    for (const edition of editions) {
      if (!editionsByWork.has(edition.work_id)) editionsByWork.set(edition.work_id, [])
      editionsByWork.get(edition.work_id).push(edition)
    }

    for (const copy of ownedCopies) {
      const edition = editionsById.get(copy.edition_id)
      const workId = copy.work_id || edition?.work_id
      if (workId) ownedWorkIds.add(workId)
    }

    return entries.map(entry => {
      const work = worksById.get(entry.work_id)
      if (!work) return null

      const ownedEditions = ownedCopies
        .map(copy => {
          const edition = editionsById.get(copy.edition_id)
          const workId = copy.work_id || edition?.work_id
          return workId === work.id && edition ? edition : null
        })
        .filter(Boolean)

      const ownedFormats = [...new Set(ownedEditions.map(edition => formatLabel(edition.format)).filter(Boolean))]

      return {
        ...work,
        entry,
        isOwned: ownedWorkIds.has(work.id),
        editions: editionsByWork.get(work.id) || [],
        ownedEditions,
        ownedFormats,
      }
    }).filter(Boolean)
  }, [works, entries, ownedCopies, editions])

  async function savePreferences() {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!user) throw new Error('Please sign in to save Sommelier preferences.')

    const { data: existing, error: readError } = await supabase
      .from('sommelier_preferences')
      .select('preferred_genres, preferred_tropes, content_exclusions')
      .eq('user_id', user.id)
      .maybeSingle()

    if (readError) throw readError

    const spiceMap = {
      any: 'flexible',
      low: 'mild',
      medium: 'moderate',
      high: 'very_spicy',
    }

    const { error: saveError } = await supabase
      .from('sommelier_preferences')
      .upsert({
        user_id: user.id,
        preferred_genres: existing?.preferred_genres ?? [],
        preferred_tropes: existing?.preferred_tropes ?? [],
        preferred_moods: mood ? [mood] : [],
        spice_preference: spiceMap[spice] || 'flexible',
        content_exclusions: existing?.content_exclusions ?? [],
        other_preferences: notes.trim() || null,
        discovery_enabled: includeDiscoveries,
        priority_mode: priorityMode,
        preferred_format: preferredFormat,
      }, { onConflict: 'user_id' })

    if (saveError) throw saveError
  }

  async function findNextRead() {
    setError('')
    setNotice('')
    setRecommendations([])

    try {
      await savePreferences()
    } catch (saveError) {
      setError(`Couldn't save your preferences: ${saveError.message}`)
      return
    }
    setError('')
    setNotice('')
    setRecommendations([])

    const eligible = catalog.filter(item => item.entry.status === 'want_to_read')
    if (!eligible.length) {
      setNotice('No books are currently marked Want to read. Add books to your TBR or change a reading status on the TBR page.')
      return
    }

    // Only positive reading preferences should earn ranking points.
    // A negative clause such as "no cheating" must not boost books
    // merely because that word appears in the description.
    const noteClauses = notes.toLowerCase()
      .split(/[,.!?;\r\n]+/)
      .map(clause => clause.trim())
      .filter(Boolean)
    const positiveClauses = noteClauses.filter(
      clause => !/\b(no|not|without|avoid|avoiding|exclude|excluding|never|don't|dont|do not|doesn't|doesnt)\b/i.test(clause)
    )
    const terms = positiveClauses.join(' ')
      .split(/[^a-z0-9]+/)
      .filter(term => term.length > 2)
    const targetFormat = preferenceFormat[preferredFormat]

    // Conservative text-based mood signals. These are clues, not verified book tags.
    const moodSignals = {
      "dark-romance": ["dark romance", "mafia", "stalker", "possessive", "obsession", "obsessed", "captor", "captivity", "morally gray", "morally grey"],
      "fantasy-romantasy": ["fantasy", "fae", "fairy", "kingdom", "magic", "magical", "dragon", "witch", "vampire", "court", "romantasy"],
      "thriller-mystery": ["thriller", "mystery", "murder", "detective", "investigation", "suspense", "serial killer", "crime", "disappearance"],
      "romance": ["romance", "romantic", "love story", "rom-com", "romcom", "relationship", "enemies to lovers", "friends to lovers"],
      "morally-gray": ["morally gray", "morally grey", "antihero", "anti-hero", "obsession", "obsessed", "possessive", "dark romance", "ruthless", "villain"]
    }
    const selectedMoodSignals = moodSignals[mood] || []

    const scored = eligible.map(item => {
      const priorityPoints = Number(item.entry.priority || 0) * 2
      let score = priorityPoints
      const searchable = [
        item.title,
        item.primary_author,
        item.description,
        item.entry.user_notes,
        item.series_name,
      ].filter(Boolean).join(' ').toLowerCase()

      const matchedTerms = terms.filter(term => searchable.includes(term))
      score += matchedTerms.length * 3

      const matchedMoodSignals = selectedMoodSignals.filter(signal => searchable.includes(signal))
      const moodPoints = Math.min(matchedMoodSignals.length, 3) * 18
      score += moodPoints

      const ownershipPoints = priorityMode === 'owned-first'
        ? (item.isOwned ? 100 : 0)
        : priorityMode === 'unowned-first'
          ? (item.isOwned ? 0 : 100)
          : 0
      score += ownershipPoints

      let formatMatch = false
      if (targetFormat) {
        formatMatch = item.ownedFormats.includes(targetFormat)
        score += formatMatch ? 40 : 0
      }

      const reasonParts = []
      if (matchedMoodSignals.length) {
        reasonParts.push(`Possible mood clues in available book text: ${matchedMoodSignals.slice(0, 3).join(", ")}. These are clues, not verified book tags.`)
      } else if (mood && selectedMoodSignals.length) {
        reasonParts.push("No matching mood clues were found in the available text. This is a general TBR suggestion, not a verified mood match.")
      }
      if (matchedTerms.length) {
        reasonParts.push(`Matches your note${matchedTerms.length > 1 ? 's' : ''}: ${matchedTerms.join(', ')}.`)
      }
      if (priorityPoints > 0) {
        reasonParts.push(`TBR priority contributes ${priorityPoints} ranking points.`)
      }
      if (priorityMode === 'owned-first' && item.isOwned) {
        reasonParts.push('Prioritized because you own it.')
      } else if (priorityMode === 'unowned-first' && !item.isOwned) {
        reasonParts.push('Prioritized because it is not in your owned collection.')
      }
      if (formatMatch) {
        reasonParts.push(`Matches your preferred owned format: ${targetFormat}.`)
      }

      if (targetFormat && !formatMatch) {
        reasonParts.push(item.isOwned
          ? 'Owned format does not match your selected format.'
          : `Not currently owned${item.editions.some(edition => formatLabel(edition.format) === targetFormat) ? `; a ${targetFormat} edition is listed in the catalog` : ''}.`)
      } else if (!targetFormat && !item.isOwned) {
        reasonParts.push('A new-to-your-library possibility.')
      } else if (!targetFormat && item.isOwned) {
        reasonParts.push('Already in your collection.')
      }

      if (!reasonParts.length) {
        reasonParts.push('Selected from your Want to Read list.')
      }

      return {
        ...item,
        score,
        matchedMoodSignals,
        reason: reasonParts.join(' '),
      }
    })

    scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))

    // When a mood is selected, only recommend books with matching text clues.
    // These are evidence-based text matches, not verified genre classifications.
    const shortlistPool = mood
      ? scored.filter(item => item.matchedMoodSignals.length > 0)
      : scored

    if (mood && shortlistPool.length === 0) {
      setNotice(`No books in your Want to Read list had text clues matching "${mood}". Books with missing or limited descriptions may still fit, but there is not enough evidence to recommend them for this mood yet.`)
      return
    }

    let shortlist
    if (priorityMode === 'surprise') {
      const owned = shortlistPool.filter(item => item.isOwned)
      const unowned = shortlistPool.filter(item => !item.isOwned)
      const balanced = []
      let ownedIndex = 0
      let unownedIndex = 0

      // Alternate ownership when both groups are available, starting with
      // the group with the stronger next score.
      while (balanced.length < 5 && (ownedIndex < owned.length || unownedIndex < unowned.length)) {
        const nextOwned = owned[ownedIndex]
        const nextUnowned = unowned[unownedIndex]

        if (nextOwned && nextUnowned) {
          if (balanced.length === 0 && nextUnowned.score > nextOwned.score) {
            balanced.push(nextUnowned)
            unownedIndex++
          } else if (balanced.length === 0 || balanced[balanced.length - 1].isOwned) {
            balanced.push(nextUnowned)
            unownedIndex++
          } else {
            balanced.push(nextOwned)
            ownedIndex++
          }
        } else if (nextOwned) {
          balanced.push(nextOwned)
          ownedIndex++
        } else if (nextUnowned) {
          balanced.push(nextUnowned)
          unownedIndex++
        }
      }

      shortlist = balanced
    } else {
      shortlist = shortlistPool.slice(0, 5)
    }

    setRecommendations(shortlist)

    const priorityText = {
      surprise: 'Surprise me: picks can be owned or unowned.',
      'owned-first': 'Books you own are prioritized, with unowned books as backups.',
      'unowned-first': 'Unowned books are prioritized, with owned books as backups.',
    }[priorityMode]

    const formatText = targetFormat
      ? ` Matching owned ${targetFormat} formats are prioritized.`
      : ''

    const discoveryText = includeDiscoveries
      ? ' New-book discovery beyond your TBR is not connected yet, so these picks remain from your existing TBR.'
      : ''

    setNotice(`${priorityText}${formatText} Mood ranking uses possible clues from available book text, not verified genre tags. Spice is not verified or used to filter recommendations yet.${discoveryText}`)
  }

  return (
    <section style={{ padding: '28px', color: T.white, maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ marginBottom: '28px' }}>
        <p style={{ color: T.gold, letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: '12px' }}>
          Curated for your next obsession
        </p>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '36px', margin: '8px 0', color: T.white }}>
          Book Sommelier
        </h1>
        <p style={{ color: T.muted, lineHeight: 1.7, maxWidth: '650px' }}>
          Choose how you want to read. Your TBR and ownership records are used regardless of My TBR filters.
        </p>
        <p style={{ color: T.subtle, fontSize: '13px' }}>
          {loading ? 'Loading your catalog…' : `${catalog.length} reading-catalog entries available`}
        </p>
      </header>

      <BookTagging />

      {error && <div role="alert" style={{ ...panel, borderColor: T.redBorder || T.goldBorder, marginBottom: '16px' }}>{error}</div>}

      <div style={{ ...panel, display: 'grid', gap: '20px', marginBottom: '24px' }}>
        <div>
          <label htmlFor="sommelier-priority" style={{ display: 'block', color: T.goldLight, marginBottom: '8px', fontWeight: 600 }}>
            What should I prioritize?
          </label>
          <select id="sommelier-priority" value={priorityMode} onChange={event => setPriorityMode(event.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${T.goldBorder}`, background: T.bg, color: T.white }}>
            <option value="surprise">Surprise me — mix owned and unowned</option>
            <option value="owned-first">Prioritize books I own</option>
            <option value="unowned-first">Prioritize books I don't own</option>
          </select>
        </div>

        <div>
          <label htmlFor="sommelier-format" style={{ display: 'block', color: T.goldLight, marginBottom: '8px', fontWeight: 600 }}>
            Preferred format
          </label>
          <select id="sommelier-format" value={preferredFormat} onChange={event => setPreferredFormat(event.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${T.goldBorder}`, background: T.bg, color: T.white }}>
            <option value="any">Any format</option>
            <option value="physical">Physical book I own</option>
            <option value="kindle">Kindle / ebook I own</option>
            <option value="audible">Audible / audiobook I own</option>
          </select>
        </div>

        <div>
          <label htmlFor="sommelier-mood" style={{ display: 'block', color: T.goldLight, marginBottom: '8px', fontWeight: 600 }}>
            What are you in the mood for?
          </label>
          <select id="sommelier-mood" value={mood} onChange={event => setMood(event.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${T.goldBorder}`, background: T.bg, color: T.white }}>
            <option value="">Surprise me</option>
            <option value="dark-romance">Dark romance</option>
            <option value="fantasy-romantasy">Fantasy / romantasy</option>
            <option value="thriller-mystery">Thriller / mystery</option>
            <option value="romance">Romance / rom-com</option>
            <option value="morally-gray">Morally gray and obsessed</option>
          </select>
        </div>

        <div>
          <label htmlFor="sommelier-spice" style={{ display: 'block', color: T.goldLight, marginBottom: '8px', fontWeight: 600 }}>
            Spice level
          </label>
          <select id="sommelier-spice" value={spice} onChange={event => setSpice(event.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${T.goldBorder}`, background: T.bg, color: T.white }}>
            <option value="any">Any level</option>
            <option value="low">Low spice</option>
            <option value="medium">Some spice</option>
            <option value="high">Very spicy</option>
          </select>
        </div>

        <div>
          <label htmlFor="sommelier-notes" style={{ display: 'block', color: T.goldLight, marginBottom: '8px', fontWeight: 600 }}>
            Anything else you're craving?
          </label>
          <textarea id="sommelier-notes" value={notes} onChange={event => setNotes(event.target.value)}
            placeholder="A possessive love interest, twisty plot, found family, no cheating..."
            rows={4} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '10px', border: `1px solid ${T.goldBorder}`, background: T.bg, color: T.white, resize: 'vertical' }} />
        </div>

        <label style={{ display: 'flex', gap: '10px', alignItems: 'center', color: T.subtle, cursor: 'pointer' }}>
          <input type="checkbox" checked={includeDiscoveries} onChange={event => setIncludeDiscoveries(event.target.checked)} style={{ accentColor: T.gold }} />
          Include new book discoveries beyond my TBR
        </label>

        <button type="button" disabled={loading} onClick={findNextRead}
          style={{ ...buttonStyle, opacity: loading ? 0.65 : 1 }}>
          Find my next read
        </button>
      </div>

      {notice && <p role="status" style={{ color: T.muted, lineHeight: 1.7, marginBottom: '20px' }}>{notice}</p>}

      {recommendations.length > 0 && (
        <section>
          <h2 style={{ fontFamily: 'Georgia, serif', color: T.goldLight, fontSize: '25px', marginBottom: '16px' }}>
            Your next-read shortlist
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(245px, 1fr))', gap: '16px' }}>
            {recommendations.map(item => {
              const edition = item.editions.find(candidate => candidate.cover_image_url) || item.editions[0]
              const formats = item.ownedFormats

              return (
                <article key={item.id} style={{ display: 'flex', flexDirection: 'column', background: T.surface, border: `1px solid ${T.goldBorder}`, borderRadius: '14px', overflow: 'hidden' }}>
                  {edition?.cover_image_url
                    ? <img src={edition.cover_image_url} alt={`Cover of ${item.title}`} loading="lazy" style={{ width: '100%', height: '190px', objectFit: 'contain', padding: '12px', boxSizing: 'border-box', background: 'rgba(0,0,0,0.12)' }} />
                    : <div aria-hidden="true" style={{ height: '90px', display: 'grid', placeItems: 'center', fontSize: '32px', background: 'rgba(0,0,0,0.12)' }}>📖</div>}
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                    <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '19px', lineHeight: 1.3, margin: 0 }}>{item.title}</h3>
                    {item.primary_author && <p style={{ margin: 0, color: T.muted, fontSize: '14px' }}>{item.primary_author}</p>}
                    {item.series_name && <p style={{ margin: 0, color: T.subtle, fontSize: '12px' }}>{item.series_name}{item.series_position != null ? ` · Book ${item.series_position}` : ''}</p>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ border: `1px solid ${T.goldBorder}`, borderRadius: '999px', padding: '4px 8px', fontSize: '11px', color: T.muted }}>
                        {item.isOwned ? 'Owned' : 'Not owned yet'}
                      </span>
                      <span style={{ border: `1px solid ${T.goldBorder}`, borderRadius: '999px', padding: '4px 8px', fontSize: '11px', color: T.goldLight }}>
                        Want to read
                      </span>
                      {formats.map(format => <span key={format} style={{ border: `1px solid ${T.goldBorder}`, borderRadius: '999px', padding: '4px 8px', fontSize: '11px', color: T.muted }}>{format}</span>)}
                    </div>
                    <p style={{ color: T.muted, fontSize: '13px', lineHeight: 1.5, margin: 0 }}>{item.reason}</p>
                    {item.entry.user_notes && <p style={{ color: T.muted, fontSize: '13px', lineHeight: 1.5, margin: 0 }}>{item.entry.user_notes}</p>}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}
    </section>
  )
}
