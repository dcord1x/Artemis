import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { FilePlus, Upload, LayoutList, BarChart2, Map, FlaskConical, FileText } from 'lucide-react';

interface Props { children: ReactNode; }

export default function Layout({ children }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        padding: '0 24px',
        height: 52,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        flexShrink: 0,
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginRight: 32 }}>
          <img
            src="/logo.png"
            alt=""
            style={{ height: 38, objectFit: 'contain' }}
          />
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', gap: 2, flex: 1 }}>
          <NavItem to="/" icon={<FilePlus size={14} />} label="New Report" exact />
          <NavItem to="/import" icon={<Upload size={14} />} label="Import Bulletin" />
          <NavItem to="/cases" icon={<LayoutList size={14} />} label="Cases" />
          <NavItem to="/analysis" icon={<BarChart2 size={14} />} label="Analysis" />
          <NavItem to="/map" icon={<Map size={14} />} label="Map" />
          <NavItem to="/research" icon={<FlaskConical size={14} />} label="Research" />
          <NavItem to="/bulletin" icon={<FileText size={14} />} label="Bulletin" />
        </nav>

        {/* Right tagline */}
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          human-led · auditable · privacy-conscious
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </main>
    </div>
  );
}

function NavItem({ to, icon, label, exact }: {
  to: string; icon: ReactNode; label: string; exact?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: isActive ? 500 : 400,
        color: isActive ? 'var(--accent)' : 'var(--text-2)',
        background: isActive ? 'var(--accent-pale)' : 'transparent',
        textDecoration: 'none',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap' as const,
      })}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        if (!el.getAttribute('aria-current')) {
          el.style.background = 'var(--surface-2)';
          el.style.color = 'var(--text-1)';
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        if (!el.getAttribute('aria-current')) {
          el.style.background = 'transparent';
          el.style.color = 'var(--text-2)';
        }
      }}
    >
      {icon}
      {label}
    </NavLink>
  );
}
