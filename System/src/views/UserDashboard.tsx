import React, { useState, FormEvent } from 'react';
import Spinner from '../components/Spinner';
import Checkmark from '../components/Checkmark';

interface UserDashboardProps {
  onLogout: () => void;
  apiKey: string | null;
}

const SendIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.428A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
    </svg>
);

const LogoutIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
);

const ErrorIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <style>{`
            svganimation {
                transform-origin: 50% 50%;
                animation: scale 0.3s cubic-bezier(0.65, 0, 0.45, 1) forwards;
            }
            @keyframes scale {
                0% {
                    transform: scale(0.5);
                    opacity: 0;
                }
                100% {
                    transform: scale(1);
                    opacity: 1;
                }
            }
        `}</style>
    </svg>
);

const UserDashboard: React.FC<UserDashboardProps> = ({ onLogout, apiKey }) => {
  const [target, setTarget] = useState('');
  const [selectedMode, setSelectedMode] = useState('andros');
  const [duration, setDuration] = useState(1);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target.trim() || !selectedMode) return;

    setStatus('loading');
    setErrorMessage('');

    try {
        const response = await fetch(`/api/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              key: apiKey,
              target,
              mode: selectedMode,
              duration
            }),
        });
        
        if (!response.ok) {
            let errorMsg = `HTTP error! Status: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.message || JSON.stringify(errorData);
            } catch (jsonError) {
                errorMsg = await response.text();
            }
            throw new Error(errorMsg);
        }

        setStatus('success');
        setTimeout(() => {
            handleBack();
        }, 3000);

    } catch (error) {
        console.error("API error:", error);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to send command. Please try again.');
        setStatus('error');
         setTimeout(() => {
            handleBack();
        }, 4000);
    }
  };

  const handleBack = () => {
    setTarget('');
    setErrorMessage('');
    setStatus('idle');
  };
  
  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
            <Spinner />
            <p className="mt-4 text-gray-300">Processing request...</p>
          </div>
        );
      case 'success':
        return (
          <div className="flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
            <Checkmark />
            <p className="mt-4 text-2xl font-semibold text-green-400">Success!</p>
            <p className="text-gray-400">Your request has been sent.</p>
          </div>
        );
       case 'error':
        return (
          <div className="flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
            <ErrorIcon />
            <p className="mt-4 text-2xl font-semibold text-red-400">Failed!</p>
            <p className="text-gray-400 text-sm mt-1">{errorMessage}</p>
          </div>
        );
      case 'idle':
      default:
        return (
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label htmlFor="target" className="block text-gray-300 text-sm font-medium mb-2">Target Number</label>
                    <input
                        id="target"
                        type="text"
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-[#8A2BE2] transition duration-200"
                        placeholder="628..."
                    />
                </div>
                <div className="relative">
                    <label htmlFor="mode" className="block text-gray-300 text-sm font-medium mb-2">Select Mode</label>
                    <select
                        id="mode"
                        value={selectedMode}
                        onChange={(e) => setSelectedMode(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-[#8A2BE2] transition duration-200 appearance-none"
                    >
                        <option value="andros">Android</option>
                        <option value="ios">iOS</option>
                        <option value="andros-delay">Android Delay</option>
                        <option value="invis-iphone">iOS Invis</option>
                        <option value="ganas">Ganas</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 top-7 flex items-center px-2 text-gray-400">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                    </div>
                </div>
                <div>
                    <label htmlFor="duration" className="block text-gray-300 text-sm font-medium mb-2">Duration (hours)</label>
                    <input
                        id="duration"
                        type="number"
                        value={duration}
                        onChange={(e) => setDuration(parseInt(e.target.value))}
                        className="w-full px-4 py-3 rounded-lg bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-[#8A2BE2] transition duration-200"
                        placeholder="1"
                    />
                </div>
                <button
                    type="submit"
                    disabled={status === 'loading' || !target.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] hover:opacity-90 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <SendIcon/>
                    Continue
                </button>
            </form>
        );
    }
  };

  return (
    <div className="w-full max-w-md mx-auto animate-fade-in space-y-6">
       <div className="bg-gray-900 shadow-2xl rounded-2xl p-4 border border-gray-700 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <img src="https://files.catbox.moe/46iz0p.gif" alt="Vely Logo" className="w-8 h-8 rounded-lg object-cover" />
                <div>
                    <h1 className="text-xl font-bold text-gray-100">Vely Bug</h1>
                    <p className="text-sm text-gray-400">Target Dashboard</p>
                </div>
            </div>
            <button onClick={onLogout} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg transition-colors hover:bg-opacity-80">
                <LogoutIcon/>
                Logout
            </button>
        </div>

        <div className="bg-gray-900 shadow-2xl rounded-2xl p-8 border border-gray-700">
            <div className="flex flex-col items-center text-center mb-8">
                <img src="https://files.catbox.moe/46iz0p.gif" alt="Vely Logo" className="w-24 h-24 rounded-2xl object-cover logo-animated-aura mb-6" />
                <h2 className="text-2xl font-bold text-gray-100">Command Center</h2>
                <p className="text-gray-400 mt-1">Send your command to the server</p>
            </div>
            {renderContent()}
        </div>
    </div>
  );
};

export default UserDashboard;