'use client';
import React, { useState } from 'react';
import './dev.css';

export default function DevDashboard() {
  const [url, setUrl] = useState('');
  const [host, setHost] = useState('');
  const [key, setKey] = useState('');
  const [method, setMethod] = useState('GET');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const testApi = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/dev-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, host, key, method })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dev-container">
      <h1>Developer API Tester</h1>
      <p className="subtitle">Test any RapidAPI endpoint to find the best fallback (Check for filesize &lt; 25MB)</p>

      <div className="form-group">
        <label>RapidAPI Endpoint URL (Include all query params like ?id=123)</label>
        <input 
          type="text" 
          value={url} 
          onChange={(e) => setUrl(e.target.value)} 
          placeholder="https://youtube-mp36.p.rapidapi.com/dl?id=..."
        />
      </div>

      <div className="form-group">
        <label>x-rapidapi-host</label>
        <input 
          type="text" 
          value={host} 
          onChange={(e) => setHost(e.target.value)} 
          placeholder="youtube-mp36.p.rapidapi.com"
        />
      </div>

      <div className="form-group">
        <label>x-rapidapi-key</label>
        <input 
          type="text" 
          value={key} 
          onChange={(e) => setKey(e.target.value)} 
          placeholder="Enter your RapidAPI key..."
        />
      </div>

      <button className="test-btn" onClick={testApi} disabled={loading || !url || !host || !key}>
        {loading ? 'Testing API...' : 'Test API Connection'}
      </button>

      {error && (
        <div className="error-box">
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="result-box">
          <h3>Response ({result.status})</h3>
          <pre>{JSON.stringify(result.data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
