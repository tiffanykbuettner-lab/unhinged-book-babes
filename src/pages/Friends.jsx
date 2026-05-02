import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'
import Avatar from '../components/Avatar'

export default function Friends() {
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedFriend, setSelectedFriend] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user)
      fetchFriends(user.id)
    })
  }, [])

  async function fetchFriends(currentUserId) {
    const { data: profiles } = await supabase
      .from('profiles').select('*').neq('id', currentUserId)
    const enriched = await Promise.all((profiles || []).map(async friend => {
      const { count } = await supabase
        .from('books').select('*', { count: 'exact', head: true }).eq('owner_id', friend.id)
      return { ...friend, bookCount: count || 0 }
    }))
    setFriends(enriched)
    setLoading(false)
  }

  if (selectedFriend) return (
    <FriendLibrary friend={selectedFriend} onBack={() => setSelectedFriend(null)} currentUser={currentUser} />
  )

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: T.bg, minHeight: '100vh' }}>
      <div style={{ background: T.header, padding: '24px 20px 20px' }}>
        <h1 style={{ color: T.white, margin: 0, fontSize: '24px' }}>👯‍♀️ Friends</h1>
        <p style={{ color: T.tealLight, margin: '4px 0 0', fontSize: '13px' }}>Browse your fellow Book Babes' libraries</p>
      </div>
      <div style={{ padding: '16px' }}>
        {loading ? (
          <p style={{ color: T.muted, textAlign: 'center', marginTop: '40px' }}>Loading...</p>
        ) : friends.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>👯‍♀️</div>
            <h3 style={{ color: T.white, marginBottom: '8px' }}>No friends yet!</h3>
            <p style={{ color: T.muted, fontSize: '14px' }}>Once your friends sign up, they'll appear here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {friends.map(friend => (
              <button key={friend.id} onClick={() => setSelectedFriend(friend)}
                style={{ background: T.card, borderRadius: '16px', padding: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '16px', border: `1px solid ${T.tealBorder}`, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'border-color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = T.goldBorder}
                onMouseLeave={e => e.currentTarget.style.borderColor = T.tealBorder}>
                <Avatar profile={friend} size={56} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 'bold', color: T.white, fontSize: '17px', fontFamily: 'Georgia, serif' }}>{friend.display_name || 'Book Babe'}</p>
                  <p style={{ margin: '4px 0 0', color: T.tealLight, fontSize: '13px' }}>📖 {friend.bookCount} {friend.bookCount === 1 ? 'book' : 'books'} in their library</p>
                </div>
                <span style={{ color: T.goldLight, fontSize: '20px' }}>→</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FriendLibrary({ friend, onBack, currentUser }) {
  const [books, setBooks] = useState([])
  const [wishlist, setWishlist] = useState([])
  const [tab, setTab] = useState('library')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [{ data: books }, { data: wishlist }] = await Promise.all([
      supabase.from('books').select('*').eq('owner_id', friend.id).order('created_at', { ascending: false }),
      supabase.from('wishlist').select('*').eq('owner_id', friend.id).is('gifted_at', null).order('created_at', { ascending: false })
    ])
    setBooks(books || [])
    setWishlist(wishlist || [])
    setLoading(false)
  }

  async function claimItem(item) {
    if (item.claimed_by) return
    await supabase.from('wishlist').update({ claimed_by: currentUser.id, claimed_at: new Date().toISOString() }).eq('id', item.id)
    fetchData()
  }

  async function unclaimItem(item) {
    if (item.claimed_by !== currentUser.id) return
    await supabase.from('wishlist').update({ claimed_by: null, claimed_at: null }).eq('id', item.id)
    fetchData()
  }

  async function markPurchased(item) {
    if (!confirm(`Mark "${item.title}" as purchased for ${friend.display_name}?`)) return
    const now = new Date().toISOString()
    await supabase.from('gift_history').insert({
      gifted_by: currentUser.id,
      gifted_to: friend.id,
      book_title: item.title,
      edition_name: item.edition_preference || '',
      occasion: 'Wishlist Gift',
      gifted_at: now
    })
    await supabase.from('wishlist').update({ gifted_at: now }).eq('id', item.id)
    fetchData()
    alert(`🎉 Marked as purchased! This will disappear from ${friend.display_name}'s wishlist.`)
  }

  const filtered = search.trim()
    ? books.filter(b => b.title?.toLowerCase().includes(search.toLowerCase()) || b.author?.toLowerCase().includes(search.toLowerCase()))
    : books

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: T.bg, minHeight: '100vh' }}>
      <div style={{ background: T.header, padding: '20px 20px 0' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: T.tealLight, cursor: 'pointer', fontSize: '14px', padding: 0, marginBottom: '12px', fontFamily: 'Georgia, serif' }}>
          ← Back to Friends
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <Avatar profile={friend} size={44} />
          <h1 style={{ color: T.white, margin: 0, fontSize: '20px' }}>{friend.display_name}'s Collection</h1>
        </div>
        <div style={{ display: 'flex', gap: '0' }}>
          {['library', 'wishlist'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer',
              background: tab === t ? T.bg : 'transparent',
              color: tab === t ? T.goldLight : T.muted,
              fontWeight: tab === t ? 'bold' : 'normal',
              borderRadius: '12px 12px 0 0', fontSize: '14px',
              fontFamily: 'Georgia, serif',
              borderBottom: tab === t ? `2px solid ${T.gold}` : '2px solid transparent'
            }}>
              {t === 'library' ? `📖 Library (${books.length})` : `💫 Wishlist (${wishlist.length})`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {tab === 'library' && (
          <div style={{ marginBottom: '16px', position: 'relative' }}>
            <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px' }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search their library..."
              style={{ width: '100%', padding: '10px 16px 10px 36px', borderRadius: '10px', border: `1px solid ${T.tealBorder}`, background: 'rgba(255,255,255,0.05)', color: T.white, fontSize: '14px', boxSizing: 'border-box', outline: 'none', fontFamily: 'Georgia, serif' }} />
          </div>
        )}

        {loading ? (
          <p style={{ color: T.muted, textAlign: 'center', marginTop: '40px' }}>Loading...</p>
        ) : tab === 'library' ? (
          filtered.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '60px' }}>
              <p style={{ color: T.muted }}>{search ? 'No books match that search.' : 'No books in their library yet.'}</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
              {filtered.map(book => (
                <div key={book.id} style={{ background: T.card, borderRadius: '14px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', border: `1px solid ${T.tealBorder}` }}>
                  <div style={{ height: '190px', background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {book.cover_image_url
                      ? <img src={book.cover_image_url} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '36px' }}>📚</span>}
                  </div>
                  <div style={{ padding: '10px' }}>
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: '12px', color: T.white, lineHeight: '1.3' }}>{book.title}</p>
                    <p style={{ margin: '3px 0 0', fontSize: '11px', color: T.tealLight }}>{book.author}</p>
                    {book.edition_name && (
                      <span style={{ display: 'inline-block', marginTop: '5px', background: T.goldDim, color: T.goldLight, borderRadius: '4px', padding: '2px 6px', fontSize: '10px', border: `1px solid ${T.goldBorder}` }}>
                        {book.edition_name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          wishlist.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '60px' }}>
              <p style={{ color: T.muted }}>Their wishlist is empty.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {wishlist.map(item => (
                <div key={item.id} style={{ background: T.card, borderRadius: '14px', padding: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', display: 'flex', gap: '12px', alignItems: 'center', border: `1px solid ${T.tealBorder}` }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 'bold', color: T.white, fontSize: '15px' }}>{item.title}</p>
                    {item.author && <p style={{ margin: '2px 0', color: T.tealLight, fontSize: '13px' }}>{item.author}</p>}
                    {item.edition_preference && <p style={{ margin: '4px 0 0', color: T.goldLight, fontSize: '12px' }}>📌 {item.edition_preference}</p>}
                    {item.notes && <p style={{ margin: '4px 0 0', color: T.muted, fontSize: '12px', fontStyle: 'italic' }}>{item.notes}</p>}
                    {item.claimed_by === currentUser?.id && (
                      <button onClick={() => markPurchased(item)} style={{ marginTop: '8px', background: T.goldDim, color: T.goldLight, border: `1px solid ${T.goldBorder}`, borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
                        🎁 Mark as Purchased
                      </button>
                    )}
                  </div>
                  {item.claimed_by ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <span style={{ background: T.goldDim, color: T.goldLight, fontSize: '11px', fontWeight: 'bold', padding: '4px 10px', borderRadius: '10px', border: `1px solid ${T.goldBorder}`, whiteSpace: 'nowrap' }}>
                        🎁 Claimed
                      </span>
                      {item.claimed_by === currentUser?.id && (
                        <button onClick={() => unclaimItem(item)} style={{ background: 'none', border: 'none', color: T.muted, fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}>
                          Unclaim
                        </button>
                      )}
                    </div>
                  ) : (
                    <button onClick={() => claimItem(item)} style={{ background: T.teal, color: T.white, border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}>
                      🎁 Claim
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}