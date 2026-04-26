import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', currentUserId)
    setFriends(data || [])
    setLoading(false)
  }

  if (selectedFriend) return (
    <FriendLibrary friend={selectedFriend} onBack={() => setSelectedFriend(null)} />
  )

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: '#faf5fc', minHeight: '100vh' }}>
      <div style={{ background: '#4a2c6b', padding: '20px 20px 16px' }}>
        <h1 style={{ color: '#fff', margin: 0, fontSize: '22px' }}>👯 Friends</h1>
        <p style={{ color: '#d8c5e0', margin: '4px 0 0', fontSize: '13px' }}>
          Browse your fellow Book Babes' libraries
        </p>
      </div>

      <div style={{ padding: '16px' }}>
        {loading ? (
          <p style={{ color: '#8b5e83', textAlign: 'center', marginTop: '40px' }}>Loading...</p>
        ) : friends.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>👯</div>
            <h3 style={{ color: '#4a2c6b', marginBottom: '8px' }}>No friends yet!</h3>
            <p style={{ color: '#8b5e83', fontSize: '14px' }}>Once your friends sign up, they'll appear here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {friends.map(friend => (
              <button key={friend.id} onClick={() => setSelectedFriend(friend)}
                style={{ background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(74,44,107,0.08)', display: 'flex', alignItems: 'center', gap: '16px', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
                  {friend.avatar_url ? <img src={friend.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : '📚'}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 'bold', color: '#1f1f2e', fontSize: '16px', fontFamily: 'Georgia, serif' }}>{friend.display_name || 'Book Babe'}</p>
                  <p style={{ margin: '4px 0 0', color: '#8b5e83', fontSize: '13px' }}>Tap to browse their library →</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FriendLibrary({ friend, onBack }) {
  const [books, setBooks] = useState([])
  const [wishlist, setWishlist] = useState([])
  const [tab, setTab] = useState('library')
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user))
    fetchData()
  }, [])

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
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('wishlist').update({ claimed_by: user.id, claimed_at: new Date().toISOString() }).eq('id', item.id)
    fetchData()
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: '#faf5fc', minHeight: '100vh' }}>
      <div style={{ background: '#4a2c6b', padding: '20px 20px 0' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#d8c5e0', cursor: 'pointer', fontSize: '14px', padding: 0, marginBottom: '12px', fontFamily: 'Georgia, serif' }}>
          ← Back to Friends
        </button>
        <h1 style={{ color: '#fff', margin: 0, fontSize: '22px' }}>{friend.display_name}'s Collection</h1>
        <div style={{ display: 'flex', gap: '0', marginTop: '16px' }}>
          {['library', 'wishlist'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer',
              background: tab === t ? '#faf5fc' : 'transparent',
              color: tab === t ? '#4a2c6b' : '#d8c5e0',
              fontWeight: tab === t ? 'bold' : 'normal',
              borderRadius: '12px 12px 0 0', fontSize: '14px',
              fontFamily: 'Georgia, serif', textTransform: 'capitalize'
            }}>
              {t === 'library' ? `📚 Library (${books.length})` : `⭐ Wishlist (${wishlist.length})`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {loading ? (
          <p style={{ color: '#8b5e83', textAlign: 'center', marginTop: '40px' }}>Loading...</p>
        ) : tab === 'library' ? (
          books.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '60px' }}>
              <p style={{ color: '#8b5e83' }}>No books in their library yet.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '16px' }}>
              {books.map(book => (
                <div key={book.id} style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(74,44,107,0.08)' }}>
                  <div style={{ height: '170px', background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {book.cover_image_url
                      ? <img src={book.cover_image_url} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '36px' }}>📚</span>
                    }
                  </div>
                  <div style={{ padding: '10px' }}>
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: '12px', color: '#1f1f2e', lineHeight: '1.3' }}>{book.title}</p>
                    <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#8b5e83' }}>{book.author}</p>
                    {book.edition_name && (
                      <span style={{ display: 'inline-block', marginTop: '5px', background: '#f3e8ff', color: '#4a2c6b', borderRadius: '4px', padding: '2px 5px', fontSize: '10px' }}>
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
              <p style={{ color: '#8b5e83' }}>Their wishlist is empty.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {wishlist.map(item => (
                <div key={item.id} style={{ background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(74,44,107,0.08)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 'bold', color: '#1f1f2e', fontSize: '15px' }}>{item.title}</p>
                    {item.author && <p style={{ margin: '2px 0', color: '#8b5e83', fontSize: '13px' }}>{item.author}</p>}
                    {item.edition_preference && <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '12px' }}>📌 {item.edition_preference}</p>}
                    {item.notes && <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '12px', fontStyle: 'italic' }}>{item.notes}</p>}
                  </div>
                  {item.claimed_by ? (
                    <span style={{ background: '#d1fae5', color: '#065f46', fontSize: '12px', fontWeight: 'bold', padding: '6px 12px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                      🎁 Claimed
                    </span>
                  ) : (
                    <button onClick={() => claimItem(item)} style={{ background: '#4a2c6b', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'Georgia, serif', whiteSpace: 'nowrap' }}>
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