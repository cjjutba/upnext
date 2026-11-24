import type { ReactNode } from 'react';

export function AppHeader({ mode, openPlayHref = '/app', children }: { mode: 'open-play' | 'tournament'; openPlayHref?: string; children?: ReactNode }) {
  return <>
    <a className="skip-link" href="#app-main">Skip to content</a>
    <header className="app-header">
      <div className="app-header-identity">
        <a className="wordmark" href="/" translate="no">
          <img src="/icon.svg" alt="" width="31" height="31" />upnext
        </a>
        <nav className="app-nav" aria-label="App modes">
          <a className="action" data-variant="ghost" href={openPlayHref} aria-current={mode === 'open-play' ? 'page' : undefined}>Open play</a>
          <a className="action" data-variant="ghost" href="/app/tournament" aria-current={mode === 'tournament' ? 'page' : undefined}>Tournament</a>
        </nav>
      </div>
      {children ? <div className="app-header-actions">{children}</div> : null}
    </header>
  </>;
}
