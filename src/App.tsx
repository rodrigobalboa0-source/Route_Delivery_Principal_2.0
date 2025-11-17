import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { OperationsDashboard } from './components/OperationsDashboard';
import { AuthPage } from './components/AuthPage';
import { supabase } from './lib/supabase';
import { TopBar } from './components/TopBar';

function App() {
  const [activeMenu, setActiveMenu] = useState('operations');
  const [authenticated, setAuthenticated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState<string | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(Boolean(data.session));
      const uid = data.session?.user?.id;
      if (uid) {
        supabase
          .from('users')
          .select('full_name')
          .eq('id', uid)
          .single()
          .then(({ data: user }) => {
            setUserName(user?.full_name || undefined);
          });
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session));
      const uid = session?.user?.id;
      if (uid) {
        supabase
          .from('users')
          .select('full_name')
          .eq('id', uid)
          .single()
          .then(({ data: user }) => {
            setUserName(user?.full_name || undefined);
          });
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!authenticated) {
    return <AuthPage />;
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      <TopBar onMenuToggle={() => setSidebarOpen((v) => !v)} userName={userName} />
      <Sidebar
        activeMenu={activeMenu}
        onMenuChange={(menu) => {
          setActiveMenu(menu);
          setSidebarOpen(true);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className={`flex-1 overflow-hidden transition-all duration-200 ${sidebarOpen ? 'pl-56' : 'pl-0'}`}>
        {activeMenu === 'operations' && <OperationsDashboard />}
      </main>
    </div>
  );
}

export default App;
