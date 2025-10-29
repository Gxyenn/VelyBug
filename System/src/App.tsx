
import React, { useState, useCallback, useEffect } from 'react';
import Login from './views/Login';
import AdminDashboard from './views/AdminDashboard';
import UserDashboard from './views/UserDashboard';
import Spinner from './components/Spinner';
import { Role, Key, HistoryLog, Settings, Server } from './types';

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [keys, setKeys] = useState<Key[]>([]);
  const [historyLog, setHistoryLog] = useState<HistoryLog[]>([]);
  const [settings, setSettings] = useState<Settings>({ botToken: '', chatId: '' });
  const [servers, setServers] = useState<Server[]>([]);

  const [auth, setAuth] = useState<{
    isAuthenticated: boolean;
    role: Role | null;
    key: string | null;
  }>({
    isAuthenticated: false,
    role: null,
    key: null,
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [keysRes, historyRes, settingsRes, serversRes] = await Promise.all([
        fetch('/api/keys'),
        fetch('/api/history'),
        fetch('/api/settings'),
        fetch('/api/servers'),
      ]);

      if (!keysRes.ok || !historyRes.ok || !settingsRes.ok || !serversRes.ok) {
        throw new Error('Failed to fetch initial application data.');
      }
      
      const keysData = await keysRes.json();
      const historyData = await historyRes.json();
      const settingsData = await settingsRes.json();
      const serversData = await serversRes.json();

      setKeys(keysData);
      setHistoryLog(historyData);
      setSettings(settingsData);
      setServers(serversData);

    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'An unknown error occurred.';
      console.error("Fetch Data Error:", errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogin = useCallback((keyData: Key) => {
    setAuth({ isAuthenticated: true, role: keyData.role, key: keyData.value });
  }, []);

  const handleLogout = useCallback(() => {
    setAuth({ isAuthenticated: false, role: null, key: null });
  }, []);

  // --- API Handlers ---

  const handleAddKey = async (key: Omit<Key, 'id'>) => {
    const response = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(key)
    });
    const newKey = await response.json();
    setKeys(prev => [...prev, newKey]);
  };

  const handleDeleteKey = async (id: string) => {
    await fetch(`/api/keys?id=${id}`, { method: 'DELETE' });
    setKeys(prev => prev.filter(k => k.id !== id));
  };
  
  const handleUpdateKey = async (key: Key) => {
    const response = await fetch('/api/keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(key),
    });
    if (response.ok) {
        const updatedKey = await response.json();
        setKeys(prev => prev.map(k => (k.id === updatedKey.id ? updatedKey : k)));
    } else {
        console.error("Failed to update key");
        alert("Error: Could not update the key on the server.");
    }
  }

  const handleAddServer = async (server: Omit<Server, 'id'>) => {
    const response = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(server)
    });
    const newServer = await response.json();
    setServers(prev => [...prev, newServer]);
  };

  const handleDeleteServer = async (id: string) => {
    await fetch(`/api/servers?id=${id}`, { method: 'DELETE' });
    setServers(prev => prev.filter(s => s.id !== id));
  };
  
  const handleAddHistoryLog = async (log: Omit<HistoryLog, 'id'>) => {
     const response = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
    });
    const newLog = await response.json();
    setHistoryLog(prev => [newLog, ...prev]);
  };

  const handleClearHistory = async () => {
      await fetch('/api/history', { method: 'DELETE' });
      setHistoryLog([]);
  };

  const handleSaveSettings = async (newSettings: Settings) => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings)
    });
    setSettings(newSettings);
  };
  
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center text-center animate-fade-in">
          <Spinner />
          <p className="mt-4 text-lg font-semibold text-gray-300">Loading Application</p>
          <p className="text-sm text-gray-500">Please wait a moment...</p>
        </div>
      );
    }
    if (error) {
        return (
          <div className="w-full max-w-md mx-auto bg-gray-900 shadow-2xl rounded-2xl p-8 border border-red-500/50 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="mt-4 text-2xl font-semibold text-red-400">Application Error</h2>
              <p className="mt-2 text-gray-300">Could not load required data from the server.</p>
              <div className="w-full mt-4 text-left">
                <p className="text-sm text-gray-400 font-semibold">Details:</p>
                <p className="mt-1 text-xs text-gray-400 bg-gray-800 p-2 rounded-md font-mono break-words">{error}</p>
              </div>
              <p className="mt-4 text-sm text-gray-500">
                This is likely due to a server configuration issue. Please ensure all required environment variables (e.g., <code className="text-amber-400">MONGO_URI</code>) are set correctly in your deployment environment.
              </p>
              <button onClick={fetchData} className="mt-6 px-5 py-2.5 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-all">
                Try Again
              </button>
            </div>
          </div>
        );
    }

    if (!auth.isAuthenticated) {
      return <Login onLogin={handleLogin} />;
    }

    if (auth.role === Role.ADMIN || auth.role === Role.CREATOR || auth.role === Role.DEVELOPER) {
      return <AdminDashboard 
        onLogout={handleLogout} 
        keys={keys} 
        onAddKey={handleAddKey}
        onDeleteKey={handleDeleteKey}
        onUpdateKey={handleUpdateKey}
        currentRole={auth.role} 
        currentKey={auth.key} 
        historyLog={historyLog} 
        onAddHistoryLog={handleAddHistoryLog}
        onClearHistory={handleClearHistory}
        settings={settings} 
        onSaveSettings={handleSaveSettings}
        servers={servers} 
        onAddServer={handleAddServer}
        onDeleteServer={handleDeleteServer}
      />;
    }

    if (auth.role === Role.USER) {
      if (settings.botToken && settings.chatId) {
        return <UserDashboard onLogout={handleLogout} botToken={settings.botToken} chatId={settings.chatId} servers={servers} apiKey={auth.key} />;
      }
      return <Spinner />;
    }
    
    return <Login onLogin={handleLogin}/>;
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4">
      {renderContent()}
       <footer className="fixed bottom-4 left-1/2 -translate-x-1/2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-900/60 border border-gray-700 rounded-full text-gray-400 text-xs">
              Gxyenn 正式
          </div>
      </footer>
    </div>
  );
};

export default App;
