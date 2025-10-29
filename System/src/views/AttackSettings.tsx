
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Settings = () => {
  const [maxDuration, setMaxDuration] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await axios.get('/api/attack-settings');
        setMaxDuration(response.data.max_duration || '');
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      const response = await axios.post('/api/attack-settings', { max_duration: parseInt(maxDuration) });
      setMessage(response.data.message);
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            setMessage(error.response.data.message);
        } else {
            setMessage('Error saving settings');
        }
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>
      <div className="flex items-center">
        <label htmlFor="maxDuration" className="mr-2">Maximum Attack Duration (hours):</label>
        <input
          id="maxDuration"
          type="number"
          value={maxDuration}
          onChange={(e) => setMaxDuration(e.target.value)}
          className="border rounded p-2"
        />
      </div>
      <button onClick={handleSave} className="bg-blue-500 text-white rounded p-2 mt-4">
        Save
      </button>
      {message && <p className="mt-4">{message}</p>}
    </div>
  );
};

export default Settings;
