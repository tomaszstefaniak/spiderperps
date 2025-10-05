// src/app/page.tsx
'use client';

import Header from './components/Header/Header';
import PerpOrderTicket from './components/PerpOrderTicket/PerpOrderTicket';
import PositionsTable from './components/Positions/PositionsTable';

export default function Page() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(420px, 460px) 1fr',
          gap: 24,
          alignItems: 'start',
          padding: 24,
        }}
      >
        <PerpOrderTicket />
        <PositionsTable />
      </div>
    </main>
  );
}
