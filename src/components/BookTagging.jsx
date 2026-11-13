import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'

// Claude Sonnet 5.5 list prices per million tokens (input / output), used only for the running estimate.
const PRICE_PER_MILLION = { input: 2, output: 10 }

const panel = {
  background: T.surface,
  border: `1px solid ${T.goldBorder}`,
  borderRadius: '14px',
  padding: '18px',
  marginBottom: '24px',
}

const buttonStyle = {
  padding: '10px 16px',
  borderRadius: '10px',
  border: 'none',
  background: T.teal,
  color: T.white,
  fontWeight: 700,
  cursor: 'pointer',
}

async function callTagging(action) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Please sign in again.')

  const response = await fetch('/api/tag-books', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Tagging request failed (status ${response.status}).`)
  return body
}

export default function BookTagging({ onTagged }) {
  const [counts, setCounts] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState([])
  const [usage, setUsage] = useState({ input: 0, output: 0 })
  const stopRequested = useRef(false)

  useEffect(() => {
    callTagging('status')
      .then(body => setCounts(body.counts))
      .catch(err => setError(err.message))
  }, [])

  async function startTagging() {
    if (running) return
    stopRequested.current = false
    setRunning(true)
    setError('')

    try {
      while (!stopRequested.current) {
        const body = await callTagging('tag')
        setCounts(body.counts)
        if (body.usage) {
          setUsage(current => ({
            input: current.input + (body.usage.input_tokens || 0),
            output: current.output + (body.usage.output_tokens || 0),
          }))
        }
        if (body.tagged?.length) {
          setRecent(current => [...body.tagged.map(item => item.title + (item.knows ? '' : ' (unsure)')), ...current].slice(0, 8))
          onTagged?.()
        }
        if (body.done || !body.tagged?.length || body.counts.tagged >= body.counts.total) break
      }
    } catch (err) {
      setError(`${err.message} Tags saved so far are kept — you can press "Tag my books" again to continue.`)
    } finally {
      setRunning(false)
    }
  }

  const remaining = counts ? Math.max(counts.total - counts.tagged, 0) : 0
  const percent = counts?.total ? Math.round((counts.tagged / counts.total) * 100) : 0
  const cost = (usage.input * PRICE_PER_MILLION.input + usage.output * PRICE_PER_MILLION.output) / 1_000_000

  return (
    <div style={panel}>
      <h2 style={{ fontFamily: 'Georgia, serif', color: T.goldLight, fontSize: '21px', margin: '0 0 6px' }}>
        Teach the Sommelier your books
      </h2>
      <p style={{ color: T.muted, fontSize: '13px', lineHeight: 1.6, margin: '0 0 14px' }}>
        Each book gets genre, tropes, mood, season, spice level and trigger warnings, so recommendations can match what you're craving.
        TBR books are tagged first. You can stop any time and continue later.
      </p>

      {counts && (
        <>
          <div style={{ color: T.white, fontWeight: 700, marginBottom: '8px' }}>
            {counts.tagged.toLocaleString()} of {counts.total.toLocaleString()} books tagged
            {counts.unsure > 0 && (
              <span style={{ color: T.muted, fontWeight: 400, fontSize: '13px' }}>
                {' '}· {counts.unsure.toLocaleString()} the AI wasn't sure about
              </span>
            )}
          </div>
          <div style={{ background: T.bg, borderRadius: '8px', overflow: 'hidden', height: '8px', marginBottom: '14px' }}>
            <div style={{ width: `${percent}%`, height: '100%', background: T.teal, transition: 'width 0.3s' }} />
          </div>
        </>
      )}

      {error && <p role="alert" style={{ color: '#ffb4b4', fontSize: '13px', lineHeight: 1.6 }}>{error}</p>}

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        {!running ? (
          <button type="button" onClick={startTagging} disabled={!counts || remaining === 0}
            style={{ ...buttonStyle, opacity: !counts || remaining === 0 ? 0.55 : 1 }}>
            {remaining === 0 && counts ? 'All books tagged' : `Tag my books (${remaining.toLocaleString()} to go)`}
          </button>
        ) : (
          <button type="button" onClick={() => { stopRequested.current = true }}
            style={{ ...buttonStyle, background: T.surface, color: T.goldLight, border: `1px solid ${T.goldBorder}` }}>
            Stop after this batch
          </button>
        )}
        {running && <span style={{ color: T.tealLight, fontSize: '13px' }}>Tagging… (about 5 books every 15–30 seconds)</span>}
        {cost > 0 && (
          <span style={{ color: T.muted, fontSize: '12px' }}>
            This session: ~${cost.toFixed(2)} in AI usage ({(usage.input + usage.output).toLocaleString()} tokens)
          </span>
        )}
      </div>

      {recent.length > 0 && (
        <p style={{ color: T.muted, fontSize: '12px', lineHeight: 1.6, margin: '12px 0 0' }}>
          Just tagged: {recent.join(' · ')}
        </p>
      )}
    </div>
  )
}
