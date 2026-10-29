import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CodeWhy UI Exception:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#c9d1d9', fontFamily: 'sans-serif', padding: 24 }}>
          <div style={{ maxWidth: 560, background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 32 }}>
            <h2 style={{ color: '#f85149', marginTop: 0 }}>Application Render Error</h2>
            <p style={{ color: '#8b949e', fontSize: 14 }}>An error occurred while rendering the CodeWhy application:</p>
            <pre style={{ background: '#0d1117', padding: 12, borderRadius: 8, color: '#ff7b72', overflow: 'auto', fontSize: 13 }}>
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button
              onClick={() => { sessionStorage.clear(); window.location.reload(); }}
              style={{ marginTop: 16, padding: '8px 16px', background: '#238636', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
            >
              Reset Session & Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
