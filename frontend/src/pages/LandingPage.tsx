import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Fade-in on mount
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: '#0B1F33',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Subtle radial glow behind logo */}
      <div
        style={{
          position: 'absolute',
          width: 480,
          height: 480,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(179,139,89,0.10) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 48,
          opacity: ready ? 1 : 0,
          transform: ready ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}
      >
        {/* Logo */}
        <img
          src="/logo.png"
          alt="Red Light Alert"
          style={{
            height: 360,
            objectFit: 'contain',
            mixBlendMode: 'screen',
            filter: 'drop-shadow(0 4px 24px rgba(179,139,89,0.25))',
          }}
        />

        {/* Enter button */}
        <button
          onClick={() => navigate('/cases')}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#C9A26A';
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              '0 6px 32px rgba(179,139,89,0.50), 0 2px 8px rgba(0,0,0,0.30)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#B38B59';
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              '0 4px 20px rgba(179,139,89,0.35), 0 2px 6px rgba(0,0,0,0.25)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
          }}
          style={{
            background: '#B38B59',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 8,
            padding: '14px 56px',
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase' as const,
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(179,139,89,0.35), 0 2px 6px rgba(0,0,0,0.25)',
            transition: 'background 0.15s, box-shadow 0.15s, transform 0.15s',
          }}
        >
          Enter
        </button>

        {/* Tagline */}
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: 'rgba(255,255,255,0.28)',
            letterSpacing: '0.06em',
            fontStyle: 'italic',
          }}
        >
          human-led · auditable · privacy-conscious
        </p>
      </div>
    </div>
  );
}
