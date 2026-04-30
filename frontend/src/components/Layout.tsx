import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Upload, LayoutList, BarChart2, Map, FlaskConical, FileText, Code2 } from 'lucide-react';

interface Props { children: ReactNode; }

export default function Layout({ children }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        padding: '0 20px',
        height: 76,
        background: '#0B1F33',
        borderBottom: '1px solid #0F2742',
        boxShadow: '0 2px 8px rgba(0,0,0,0.20)',
        flexShrink: 0,
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginRight: 28 }}>
          <img
            src="/logo.png"
            alt=""
            style={{ height: 68, objectFit: 'contain', mixBlendMode: 'screen' }}
          />
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', gap: 1, flex: 1 }}>
          <NavItem to="/import" icon={<Upload size={13} />} label="Import" />
          <NavItem to="/cases" icon={<LayoutList size={13} />} label="Cases" />
          <NavItem to="/code" icon={<Code2 size={13} />} label="Code" exact />
          <NavItem to="/map" icon={<Map size={13} />} label="Map" />
          <NavItem to="/analysis" icon={<BarChart2 size={13} />} label="Analysis" />
          <NavItem to="/research" icon={<FlaskConical size={13} />} label="Research" />
          <NavItem to="/bulletin" icon={<FileText size={13} />} label="Bulletin" />
        </nav>

        {/* Right tagline */}
        <div style={{
          fontSize: 10.5,
          color: 'rgba(255,255,255,0.35)',
          marginLeft: 'auto',
          whiteSpace: 'nowrap',
          letterSpacing: '0.02em',
          fontStyle: 'italic',
        }}>
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
        gap: 5,
        padding: '5px 11px',
        borderRadius: 5,
        fontSize: 12.5,
        fontWeight: isActive ? 600 : 400,
        color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.58)',
        background: isActive ? 'rgba(179,139,89,0.22)' : 'transparent',
        borderBottom: isActive ? '2px solid #B38B59' : '2px solid transparent',
        textDecoration: 'none',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap' as const,
        lineHeight: 1,
      })}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        if (!el.getAttribute('aria-current')) {
          el.style.background = 'rgba(255,255,255,0.08)';
          el.style.color = 'rgba(255,255,255,0.85)';
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        if (!el.getAttribute('aria-current')) {
          el.style.background = 'transparent';
          el.style.color = 'rgba(255,255,255,0.58)';
        }
      }}
    >
      {icon}
      {label}
    </NavLink>
  );
}
