import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const ToastContext = createContext<(msg: string, type?: ToastType) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++counterRef.current;
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  const remove = (id: number) => setToasts(t => t.filter(x => x.id !== id));

  const Icon = { success: CheckCircle, error: AlertCircle, info: Info };
  const cfg = {
    success: { bg: 'var(--green-pale)',   border: 'var(--green-border)',   color: 'var(--green)'  },
    error:   { bg: 'var(--accent-pale)',  border: 'var(--accent-border)',  color: 'var(--accent)' },
    info:    { bg: 'var(--blue-pale)',    border: 'var(--blue-border)',    color: 'var(--blue)'   },
  };

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column-reverse', gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map(toast => {
          const c = cfg[toast.type];
          const ToastIcon = Icon[toast.type];
          return (
            <div
              key={toast.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow)',
                color: c.color,
                fontSize: 13,
                fontWeight: 500,
                fontFamily: 'DM Sans, sans-serif',
                minWidth: 200,
                maxWidth: 360,
                pointerEvents: 'all',
              }}
            >
              <ToastIcon size={14} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{toast.message}</span>
              <button
                onClick={() => remove(toast.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: c.color, opacity: 0.5, padding: 2, flexShrink: 0,
                  display: 'flex', alignItems: 'center',
                }}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
