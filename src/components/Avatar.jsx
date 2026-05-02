import { T } from '../lib/theme'

export default function Avatar({ profile, size = 48, style = {} }) {
  const s = {
    width: size, height: size, borderRadius: '50%',
    background: T.tealDim, border: `2px solid ${T.tealBorder}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden', fontSize: size * 0.45,
    ...style
  }

  if (profile?.avatar_url && profile.avatar_url.startsWith('http')) {
    return (
      <div style={s}>
        <img src={profile.avatar_url} alt={profile.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }

  if (profile?.avatar_url && !profile.avatar_url.startsWith('http')) {
    return <div style={s}>{profile.avatar_url}</div>
  }

  return <div style={s}>💀</div>
}