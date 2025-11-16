import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { OperationsDashboard } from './components/OperationsDashboard';
import { AuthPage } from './components/AuthPage';
import { supabase } from './lib/supabase';

function App() {
  const [activeMenu, setActiveMenu] = useState('operations');
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session));
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!authenticated) {
    return <AuthPage />;
  }

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
