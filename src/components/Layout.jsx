import { Outlet, NavLink } from 'react-router-dom'
import { T } from '../lib/theme'

export default function Layout() {
  const navItems = [
    { to: '/', label: 'Library', emoji: '📖' },
    { to: '/friends', label: 'Friends', emoji: '👯‍♀️' },
    { to: '/wishlist', label: 'Wishlist', emoji: '💫' },
    { to: '/pending', label: 'Pending', emoji: '📦' },
    { to: '/profile', label: 'Profile', emoji: '💀' },
  ]

  return (
    <div style={{ paddingBottom: '75px', background: T.bg, minHeight: '100vh' }}>
      <Outlet />
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: T.surface,
        borderTop: `1px solid ${T.tealBorder}`,
        display: 'flex', justifyContent: 'space-around',
        padding: '8px 0 10px', zIndex: 50,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.4)'
      }}>
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              textDecoration: 'none', padding: '4px 12px', borderRadius: '12px',
              color: isActive ? T.goldLight : T.muted,
              fontFamily: 'Georgia, serif',
              borderBottom: isActive ? `2px solid ${T.gold}` : '2px solid transparent',
              transition: 'all 0.2s'
            })}>
            <span style={{ fontSize: '20px' }}>{item.emoji}</span>
            <span style={{ fontSize: '11px', fontWeight: '600', marginTop: '2px' }}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}