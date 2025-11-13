import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { OperationsDashboard } from './components/OperationsDashboard';

function App() {
  const [activeMenu, setActiveMenu] = useState('operations');

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar activeMenu={activeMenu} onMenuChange={setActiveMenu} />
      <main className="flex-1 overflow-hidden">
        {activeMenu === 'operations' && <OperationsDashboard />}
      </main>
    </div>
  );
}

export default App;
