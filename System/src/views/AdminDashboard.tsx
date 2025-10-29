
import React, { useState, FormEvent, useEffect } from 'react';
import { Server, Settings, Key, Role, HistoryLog, HistoryAction } from '../types';
import AttackSettings from './AttackSettings';

interface AdminDashboardProps {
  onLogout: () => void;
  keys: Key[];
  onAddKey: (key: Omit<Key, 'id'>) => Promise<void>;
  onDeleteKey: (id: string) => Promise<void>;
  onUpdateKey: (key: Key) => Promise<void>;
  currentRole: Role | null;
  currentKey: string | null;
  historyLog: HistoryLog[];
  onAddHistoryLog: (log: Omit<HistoryLog, 'id'>) => Promise<void>;
  onClearHistory: () => Promise<void>;
  settings: Settings;
  onSaveSettings: (settings: Settings) => Promise<void>;
  servers: Server[];
  onAddServer: (server: Omit<Server, 'id'>) => Promise<void>;
  onDeleteServer: (id: string) => Promise<void>;
}

type Tab = 'servers' | 'settings' | 'keys' | 'history' | 'attack-settings';

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
      active
        ? 'bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] text-white shadow-lg'
        : 'text-gray-300 hover:bg-gray-800'
    }`}
  >
    {children}
  </button>
);

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
);
const EyeIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className || "h-5 w-5"} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
);
const EyeSlashIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className || "h-5 w-5"} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a9.97 9.97 0 01-1.563 3.029m0 0l3.59 3.59M21 21L3 3" /></svg>
);
const PlusCircleIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const MinusCircleIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);



const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout, keys, onAddKey, onDeleteKey, onUpdateKey, currentRole, currentKey, historyLog, onAddHistoryLog, onClearHistory, settings, onSaveSettings, servers, onAddServer, onDeleteServer }) => {
  const [activeTab, setActiveTab] = useState<Tab>('keys');
  const isDeveloper = currentRole === Role.DEVELOPER;
  const isPrivileged = currentRole === Role.CREATOR || currentRole === Role.DEVELOPER;
  
  const [newServer, setNewServer] = useState({ serverName: '', commandFormat: '' });
  
  const [localSettings, setLocalSettings] = useState<Settings>(settings);
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const [isMyKeyVisible, setIsMyKeyVisible] = useState(false);
  const [newAdminKey, setNewAdminKey] = useState('');
  
  const [newKey, setNewKey] = useState({ value: '', role: Role.USER, username: '' });
  const [shownKeyValue, setShownKeyValue] = useState<Record<string, boolean>>({});

  const handleAddServer = async (e: FormEvent) => {
    e.preventDefault();
    if (!newServer.serverName || !newServer.commandFormat) return;
    await onAddServer(newServer);
    setNewServer({ serverName: '', commandFormat: '' });
  };
  
  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSettings({ ...localSettings, [e.target.name]: e.target.value });
  };

  const handleSaveSettings = async () => {
    await onSaveSettings(localSettings);
    alert("Settings saved successfully!");
  };
  
  const handleChangeMyKey = async () => {
    if (!newAdminKey.trim()) {
        alert("New key cannot be empty.");
        return;
    }
    if (keys.some(k => k.value === newAdminKey)) {
        alert("This key is already in use.");
        return;
    }
    const myKeyData = keys.find(k => k.value === currentKey);
    if (myKeyData) {
        await onUpdateKey({ ...myKeyData, value: newAdminKey });
        alert("Your key has been changed. You will now be logged out.");
        onLogout();
    }
  };

  const handleAddKey = async (e: FormEvent) => {
    e.preventDefault();
    if (!newKey.value.trim() || !newKey.username.trim()) {
        alert("Username and key value cannot be empty.");
        return;
    }
    if (keys.some(k => k.value === newKey.value || k.username === newKey.username)) {
        alert("This key or username already exists.");
        return;
    }

    const actor = keys.find(k => k.value === currentKey);
    if (actor) {
        const newLog: Omit<HistoryLog, 'id'> = {
            actorUsername: actor.username,
            action: HistoryAction.CREATED,
            targetUsername: newKey.username,
            targetRole: newKey.role,
            timestamp: new Date(),
        };
        await onAddHistoryLog(newLog);
    }
    
    await onAddKey(newKey);
    setNewKey({ value: '', role: Role.USER, username: '' });
  };

  const handleDeleteKey = async (id: string) => {
    const actor = keys.find(k => k.value === currentKey);
    const keyToDelete = keys.find(k => k.id === id);

    if (actor && keyToDelete) {
         const newLog: Omit<HistoryLog, 'id'> = {
            actorUsername: actor.username,
            action: HistoryAction.DELETED,
            targetUsername: keyToDelete.username,
            targetRole: keyToDelete.role,
            timestamp: new Date(),
        };
        await onAddHistoryLog(newLog);
    }
    await onDeleteKey(id);
  };
  
  const renderKeysManagement = () => {
    return (
        <div className="space-y-6">
            <form onSubmit={handleAddKey} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-800/50 rounded-lg">
                <div className="md:col-span-1">
                    <label className="text-xs text-gray-400">Username</label>
                    <input type="text" placeholder="e.g., JohnDoe" value={newKey.username} onChange={e => setNewKey({...newKey, username: e.target.value})} className="w-full mt-1 p-2 text-sm bg-gray-900 rounded-md border border-gray-700 focus:ring-[#8A2BE2] focus:border-[#8A2BE2]" />
                </div>
                 <div className="md:col-span-1">
                    <label className="text-xs text-gray-400">New Key Value</label>
                    <input type="text" placeholder="Secret key value" value={newKey.value} onChange={e => setNewKey({...newKey, value: e.target.value})} className="w-full mt-1 p-2 text-sm bg-gray-900 rounded-md border border-gray-700 focus:ring-[#8A2BE2] focus:border-[#8A2BE2]" />
                </div>
                <div className="md:col-span-1">
                    <label className="text-xs text-gray-400">Role</label>
                    <div className="flex items-center gap-2">
                        <select value={newKey.role} onChange={e => setNewKey({...newKey, role: e.target.value as Role})} className="w-full mt-1 p-2 text-sm bg-gray-900 rounded-md border border-gray-700 focus:ring-[#8A2BE2] appearance-none">
                            <option value={Role.USER}>User</option>
                            <option value={Role.ADMIN}>Admin</option>
                            {isPrivileged && <option value={Role.CREATOR}>Creator</option>}
                        </select>
                        <button type="submit" className="px-4 py-2 mt-1 text-sm bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] hover:opacity-90 rounded-md text-white">Add</button>
                    </div>
                </div>
            </form>
            <div className="bg-gray-800/50 rounded-lg p-2 space-y-2 max-h-80 overflow-y-auto">
                {keys.map(k => {
                    const canShowKey = k.role !== Role.DEVELOPER && (isDeveloper || (currentRole === Role.ADMIN && k.role === Role.USER) || (currentRole === Role.CREATOR && (k.role === Role.ADMIN || k.role === Role.USER)));
                    const canDeleteKey = k.value !== currentKey && k.role !== Role.DEVELOPER && (isDeveloper || (currentRole === Role.CREATOR && (k.role === Role.ADMIN || k.role === Role.USER)) || (currentRole === Role.ADMIN && k.role === Role.USER));

                    return (
                        <div key={k.id} className="flex justify-between items-center bg-gray-900/70 p-2 rounded-md text-sm">
                            <div className="flex-1">
                                <div className="flex items-center">
                                    <span className="font-semibold">{k.username}</span>
                                    {k.role === Role.DEVELOPER ? (
                                        <span className="dev-badge ml-2 capitalize">{k.role}</span>
                                    ) : k.role === Role.CREATOR ? (
                                        <span className="creator-badge ml-2 capitalize">{k.role}</span>
                                    ) : (
                                        <span className={`text-xs ml-2 px-2 py-0.5 rounded-full capitalize ${
                                            k.role === Role.ADMIN ? 'bg-violet-500/30 text-violet-300' : 
                                            'bg-sky-500/30 text-sky-300'
                                        }`}>{k.role}</span>
                                    )}
                                </div>
                               {shownKeyValue[k.id] && canShowKey && <code className="block text-xs text-gray-400 mt-1">{k.value}</code>}
                            </div>
                            <div className="flex items-center gap-2">
                                 {canShowKey && (
                                    <button onClick={() => setShownKeyValue(prev => ({...prev, [k.id]: !prev[k.id]}))} className="text-gray-400 hover:text-white p-1">
                                        {shownKeyValue[k.id] ? <EyeSlashIcon className="h-4 w-4"/> : <EyeIcon className="h-4 w-4"/>}
                                    </button>
                                 )}
                                {canDeleteKey && (
                                    <button onClick={() => handleDeleteKey(k.id)} className="text-red-400 hover:text-red-300 p-1 rounded-full hover:bg-red-500/10"><TrashIcon/></button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      );
  };


  const renderServers = () => (
    <div className="space-y-6">
        <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-100">Server Management</h3>
            {isDeveloper && <span className="dev-badge">Developer</span>}
        </div>
        <form onSubmit={handleAddServer} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-800/50 rounded-lg">
            <div className="md:col-span-1">
                <label className="text-xs text-gray-400">Server Name</label>
                <input type="text" value={newServer.serverName} onChange={e => setNewServer({...newServer, serverName: e.target.value})} className="w-full mt-1 p-2 text-sm bg-gray-900 rounded-md border border-gray-700 focus:ring-[#8A2BE2]" />
            </div>
            <div className="md:col-span-2">
                <label className="text-xs text-gray-400">Command Format</label>
                <div className="flex items-center gap-2">
                    <input type="text" value={newServer.commandFormat} onChange={e => setNewServer({...newServer, commandFormat: e.target.value})} className="w-full mt-1 p-2 text-sm bg-gray-900 rounded-md border border-gray-700 focus:ring-[#8A2BE2]" />
                    <button type="submit" className="px-4 py-2 mt-1 text-sm bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] hover:opacity-90 rounded-md text-white">Add</button>
                </div>
            </div>
        </form>
        <div className="bg-gray-800/50 rounded-lg p-2 space-y-2 max-h-80 overflow-y-auto">
            {servers.map(s => (
                <div key={s.id} className="flex justify-between items-center bg-gray-900/70 p-2 rounded-md text-sm">
                    <div>
                        <span className="font-semibold">{s.serverName}</span>
                        <code className="text-xs text-gray-400 block">{s.commandFormat}</code>
                    </div>
                    <button onClick={() => onDeleteServer(s.id)} className="text-red-400 hover:text-red-300 p-1 rounded-full hover:bg-red-500/10"><TrashIcon/></button>
                </div>
            ))}
        </div>
    </div>
  );
  
  const renderSettings = () => (
    <div className="max-w-xl mx-auto space-y-8">
        {isPrivileged && (
            <div className="p-4 bg-gray-800/50 rounded-lg">
                <h3 className="text-lg font-semibold mb-4 text-gray-100 border-b border-gray-700 pb-2">Bot Settings</h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-gray-300">Chat ID Telegram</label>
                        <input name="chatId" type="text" value={localSettings.chatId} onChange={handleSettingsChange} className="w-full mt-1 p-2 text-sm bg-gray-900 rounded-md border border-gray-700 focus:ring-[#8A2BE2]"/>
                    </div>
                </div>
            </div>
        )}
        
        <div className="p-4 bg-gray-800/50 rounded-lg">
            <h3 className="text-lg font-semibold mb-4 text-gray-100 border-b border-gray-700 pb-2">Account Security</h3>
            <div className="space-y-4">
                <div>
                    <label className="text-sm font-medium text-gray-300">Your Current Key</label>
                    <div className="relative">
                      <input readOnly type={isMyKeyVisible ? 'text' : 'password'} value={currentKey ?? ''} className="w-full mt-1 p-2 text-sm bg-gray-900 rounded-md border border-gray-700 cursor-default"/>
                      <button onClick={() => setIsMyKeyVisible(!isMyKeyVisible)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-white">
                        {isMyKeyVisible ? <EyeSlashIcon className="h-5 w-5"/> : <EyeIcon className="h-5 w-5"/>}
                      </button>
                    </div>
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-300">Change My Key</label>
                    <div className="flex items-center gap-2 mt-1">
                        <input type="text" placeholder="Enter new key" value={newAdminKey} onChange={e => setNewAdminKey(e.target.value)} className="w-full p-2 text-sm bg-gray-900 rounded-md border border-gray-700 focus:ring-[#8A2BE2]"/>
                        <button onClick={handleChangeMyKey} className="px-4 py-2 text-sm bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 rounded-md text-white whitespace-nowrap">Change Key</button>
                    </div>
                </div>
            </div>
        </div>

        {isPrivileged && (
            <div className="text-right pt-2">
                 <button onClick={handleSaveSettings} className="px-6 py-2 text-sm bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] hover:opacity-90 rounded-md text-white font-semibold">Save All Settings</button>
            </div>
        )}
    </div>
  );
  
  const handleClearHistory = () => {
      if (window.confirm("Are you sure you want to delete all activity history? This action cannot be undone.")) {
          onClearHistory();
      }
  };

  const renderHistory = () => (
    <div className="space-y-4">
        <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-100">Activity Log</h3>
            {isDeveloper && (
                <button onClick={handleClearHistory} className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg transition-colors hover:bg-red-500/20">
                    <TrashIcon />
                    Clear History
                </button>
            )}
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2 space-y-2 max-h-96 overflow-y-auto">
            {historyLog.length === 0 ? (
                <div className="text-center text-gray-400 py-8">No activity recorded yet.</div>
            ) : (
                historyLog.map(log => (
                    <div key={log.id} className="flex items-center gap-3 bg-gray-900/70 p-2 rounded-md text-sm">
                        <div>
                            {log.action === HistoryAction.CREATED ? <PlusCircleIcon /> : <MinusCircleIcon />}
                        </div>
                        <div className="flex-1">
                            <span className="font-semibold">{log.actorUsername}</span>
                            <span className="text-gray-300"> {log.action} a key for </span>
                            <span className="font-semibold">{log.targetUsername}</span>
                            <span className="text-xs ml-2 px-2 py-0.5 rounded-full bg-gray-600/30 text-gray-300">{log.targetRole}</span>
                        </div>
                        <div className="text-xs text-gray-400">
                            {new Date(log.timestamp).toLocaleString()}
                        </div>
                    </div>
                ))
            )}
        </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'keys': return renderKeysManagement();
      case 'servers': if(isPrivileged) return renderServers(); return null;
      case 'settings': return renderSettings();
      case 'history': if(isPrivileged) return renderHistory(); return null;
      case 'attack-settings': if(isPrivileged) return <AttackSettings />; return null;
      default: return null;
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto animate-fade-in">
      <div className="bg-gray-900 shadow-2xl rounded-2xl p-6 border border-gray-700">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <div className="flex items-center gap-3">
                <img src="https://files.catbox.moe/46iz0p.gif" alt="Vely Logo" className="w-8 h-8 rounded-lg object-cover" />
                <h1 className="text-xl font-bold text-gray-100">Admin Dashboard</h1>
                {isDeveloper && <span className="dev-badge">Developer</span>}
            </div>
            <button onClick={onLogout} className="text-gray-300 hover:text-white transition-colors flex items-center gap-2 text-sm px-3 py-2 hover:bg-gray-800/50 rounded-lg border border-gray-700">
                Logout
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-700 pb-3">
          <TabButton active={activeTab === 'keys'} onClick={() => setActiveTab('keys')}>Keys Management</TabButton>
          {isPrivileged && <TabButton active={activeTab === 'servers'} onClick={() => setActiveTab('servers')}>Server Management</TabButton>}
          {isPrivileged && <TabButton active={activeTab === 'attack-settings'} onClick={() => setActiveTab('attack-settings')}>Attack Settings</TabButton>}
          <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>Settings</TabButton>
           {isPrivileged && <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')}>History</TabButton>}
        </div>
        <div>
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
