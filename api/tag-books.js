/* global process */
// POST /api/tag-books
// Server-only. Tags the next few untagged books with genre, tropes, mood,
// season, spice and trigger warnings using Claude.
//
// Body: { "action": "status" }  -> just the counts
//       { "action": "tag" }     -> tag the next batch, then return counts
//
// Needs these Vercel environment variables (never VITE_ prefixed):
//   ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL (or VITE_SUPABASE_URL),
//   SOMMELIER_ALLOWED_USER_IDS (comma-separated user ids allowed to spend AI credits)

import { createClient } from '@supabase/supabase-js'
import {
  tagTool, TAG_TOOL_NAME, SYSTEM_PROMPT, buildUserPrompt, parseTagResponse, fetchDescription,
} from './_lib/tagging.js'

export const config = { maxDuration: 60 }

const MODEL = process.env.SOMMELIER_MODEL || 'claude-sonnet-5-5'
const BATCH_SIZE = 5

function sendError(res, status, message) {
  return res.status(status).json({ error: message })
}

async function readQueue(admin, userId, limit) {
  const { data, error } = await admin.rpc('sommelier_tagging_queue', { p_user_id: userId, p_limit: limit })
  if (error) {
    const hint = /api key|jwt|invalid|unauthorized|permission/i.test(error.message)
      ? ' This usually means SUPABASE_SERVICE_ROLE_KEY in Vercel is not the secret/service_role key for this project.'
      : ''
    throw new Error(`Could not read the tagging queue: ${error.message}.${hint}`)
  }
  const rows = data || []
  const first = rows[0] || {}
  return {
    books: rows.filter(row => row.work_id),
    counts: {
      total: Number(first.total_count || 0),
      tagged: Number(first.tagged_count || 0),
      unsure: Number(first.unsure_count || 0),
    },
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendError(res, 405, 'Use POST.')

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const missing = [
    !supabaseUrl && 'VITE_SUPABASE_URL',
    !anonKey && 'VITE_SUPABASE_ANON_KEY',
    !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
    !anthropicKey && 'ANTHROPIC_API_KEY',
  ].filter(Boolean)
  if (missing.length) {
    return sendError(res, 500, `The server is missing these Vercel settings: ${missing.join(', ')}. Add them and redeploy.`)
  }

  // 1. Who is asking? Checked with the same public key the website uses,
  //    so a problem here is about your sign-in, not the server's settings.
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return sendError(res, 401, 'Please sign in again.')

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userData, error: userError } = await authClient.auth.getUser(token)
  const user = userData?.user
  if (userError || !user) {
    console.error('tag-books: sign-in check failed:', userError?.message)
    return sendError(res, 401, `Couldn't confirm your sign-in (${userError?.message || 'no user'}). Try signing out and back in.`)
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const allowed = String(process.env.SOMMELIER_ALLOWED_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
  if (!allowed.includes(user.id)) return sendError(res, 403, 'Book tagging is not turned on for this account.')

  const action = req.body?.action === 'tag' ? 'tag' : 'status'

  try {
    if (action === 'status') {
      const { counts } = await readQueue(admin, user.id, 1)
      return res.status(200).json({ counts, tagged: [], usage: null })
    }

    // 2. Next books to tag (TBR first)
    const { books } = await readQueue(admin, user.id, BATCH_SIZE)
    if (!books.length) {
      const { counts } = await readQueue(admin, user.id, 1)
      return res.status(200).json({ counts, tagged: [], usage: null, done: true })
    }

    // 3. Fill in missing descriptions (and keep them for later)
    await Promise.all(books.map(async book => {
      if (book.description) return
      const description = await fetchDescription(book)
      if (description) {
        book.description = description
        await admin.from('works').update({ description }).eq('id', book.work_id).is('description', null)
      }
    }))

    // 4. Ask Claude, forcing an answer in the tag form
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        tools: [tagTool()],
        tool_choice: { type: 'tool', name: TAG_TOOL_NAME },
        messages: [{ role: 'user', content: buildUserPrompt(books) }],
      }),
    })

    const aiBody = await aiResponse.json().catch(() => ({}))
    if (!aiResponse.ok) {
      const detail = aiBody?.error?.message || `status ${aiResponse.status}`
      return sendError(res, 502, `The AI request failed (${detail}). No tags were saved for this batch.`)
    }

    // 5. Save each book's tags
    const results = parseTagResponse(aiBody, books)
    for (const result of results) {
      const { error } = await admin.rpc('sommelier_save_tags', {
        p_work_id: result.book.work_id,
        p_tags: result.tags,
        p_confidence: result.confidence,
        p_note: result.note,
      })
      if (error) throw new Error(`Could not save tags for "${result.book.title}": ${error.message}`)
    }

    const { counts } = await readQueue(admin, user.id, 1)
    return res.status(200).json({
      counts,
      tagged: results.map(result => ({ title: result.book.title, knows: result.knows, tags: result.tags })),
      usage: aiBody.usage ? { input_tokens: aiBody.usage.input_tokens, output_tokens: aiBody.usage.output_tokens } : null,
      model: MODEL,
    })
  } catch (err) {
    console.error('tag-books:', err.message)
    return sendError(res, 500, err.message || 'Something went wrong while tagging.')
  }
}
