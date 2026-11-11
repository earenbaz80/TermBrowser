import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Terminus] Error de render no controlado:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <main
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          background: '#0c0e12',
          color: '#d7e0d0',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        }}
      >
        <section style={{ maxWidth: '36rem' }}>
          <h1 style={{ color: '#ffb000', fontSize: '1.25rem', marginBottom: '0.75rem' }}>
            TERMINUS // ERROR DE INTERFAZ
          </h1>
          <p style={{ lineHeight: 1.6, marginBottom: '1rem' }}>
            La interfaz encontró un error inesperado. Tus archivos y sesiones locales no se han
            modificado.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: '1px solid #ffb000',
              background: 'transparent',
              color: '#ffb000',
              padding: '0.6rem 1rem',
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            Reiniciar interfaz
          </button>
        </section>
      </main>
    );
  }
}
