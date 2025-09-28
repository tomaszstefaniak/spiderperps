// src/app/page.tsx
'use client';

import Header from './components/Header/Header';
import SwapPanel from './components/SwapPanel/SwapPanel';

export default function Page() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <SwapPanel />
      </div>
    </main>
  );
}
