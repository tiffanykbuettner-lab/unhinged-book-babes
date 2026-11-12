import { Outlet, NavLink } from 'react-router-dom'
import {
  BookOpen,
  UsersRound,
  Heart,
  PackageCheck,
  Sparkles,
  BookMarked,
  WandSparkles,
  Download,
} from 'lucide-react'
import { T } from '../lib/theme'

export default function Layout() {
  const navItems = [
    { to: '/', label: 'My Library', Icon: BookOpen },
    { to: '/friends', label: 'Book Besties', Icon: UsersRound },
    { to: '/wishlist', label: 'Wishlist', Icon: Heart },
    { to: '/pending', label: 'On the Way', Icon: PackageCheck },
    { to: '/profile', label: 'My Profile', Icon: Sparkles },
    { to: '/tbr', label: 'My TBR', Icon: BookMarked },
    { to: '/sommelier', label: 'Book Sommelier', Icon: WandSparkles },
    { to: '/goodreads-import', label: 'Goodreads Import', Icon: Download },
  ]

  return (
    <div className="app-shell" style={{ background: T.bg, color: T.white }}>
      <aside className="app-sidebar">
        <a className="app-brand" href="/" aria-label="The Book Cellar home">
          <span className="app-brand-mark" aria-hidden="true">B</span>
          <span>
            <span className="app-brand-name">The Book Cellar</span>
            <span className="app-brand-tagline">A private literary hideaway</span>
          </span>
        </a>

        <div className="app-nav-label">Your little corner</div>
        <nav className="app-nav" aria-label="Main navigation">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `app-nav-link${isActive ? ' active' : ''}`
              }
            >
              <span className="app-nav-icon" aria-hidden="true">
                <Icon size={16} strokeWidth={1.8} />
              </span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          "Just one more chapter..."
          <span>And then one more book</span>
        </div>
      </aside>

      <main className="app-main">
        <div className="app-mobile-brand">
          <span className="app-brand-mark" aria-hidden="true">B</span>
          <span>The Book Cellar</span>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
