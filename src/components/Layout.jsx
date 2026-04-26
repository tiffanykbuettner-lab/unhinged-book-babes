import { Outlet, NavLink } from 'react-router-dom'

export default function Layout() {
  const navItems = [
    { to: '/', label: 'Library', emoji: '📚' },
    { to: '/friends', label: 'Friends', emoji: '👯' },
    { to: '/wishlist', label: 'Wishlist', emoji: '⭐' },
    { to: '/pending', label: 'Pending', emoji: '📦' },
    { to: '/profile', label: 'Profile', emoji: '🌸' },
  ]

  return (
    <div style={{ paddingBottom: '75px', background: '#faf5fc', minHeight: '100vh' }}>
      <Outlet />
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff', borderTop: '1px solid #e8d5f0',
        display: 'flex', justifyContent: 'space-around',
        padding: '8px 0 10px', zIndex: 50,
        boxShadow: '0 -2px 12px rgba(74,44,107,0.08)'
      }}>
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              textDecoration: 'none', padding: '4px 12px', borderRadius: '12px',
              color: isActive ? '#4a2c6b' : '#9ca3af',
              fontFamily: 'Georgia, serif'
            })}>
            <span style={{ fontSize: '20px' }}>{item.emoji}</span>
            <span style={{ fontSize: '11px', fontWeight: '600', marginTop: '2px' }}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}