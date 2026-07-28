'use client';
import React, { useState } from 'react';
import './dev.css';

type StepStatus = 'idle' | 'running' | 'success' | 'error';

interface StepLog {
  step: string;
  status: StepStatus;
  message: string;
  data?: any;
  timeMs?: number;
}

export default function DevDashboard() {
  // RapidAPI config
  const [rapidUrl, setRapidUrl] = useState('');
  const [rapidHost, setRapidHost] = useState('');
  const [rapidKey, setRapidKey] = useState('');

  // Pipeline state
  const [logs, setLogs] = useState<StepLog[]>([]);
  const [running, setRunning] = useState(false);

  // Intermediate data (passed between steps)
  const [rawApiResponse, setRawApiResponse] = useState<any>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [qaData, setQaData] = useState<any>(null);

  const addLog = (log: StepLog) => {
    setLogs(prev => [...prev, log]);
  };

  const updateLastLog = (updates: Partial<StepLog>) => {
    setLogs(prev => {
      const copy = [...prev];
      copy[copy.length - 1] = { ...copy[copy.length - 1], ...updates };
      return copy;
    });
  };

  // ─── Step 1: Test RapidAPI Endpoint ───
  const testRapidApi = async () => {
    const start = Date.now();
    addLog({ step: '1. RapidAPI Call', status: 'running', message: `Calling ${rapidUrl.substring(0, 60)}...` });

    try {
      const res = await fetch('/api/dev-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rapidUrl, host: rapidHost, key: rapidKey })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      setRawApiResponse(data.data);
      updateLastLog({
        status: 'success',
        message: `API responded (HTTP ${data.status})`,
        data: data.data,
        timeMs: Date.now() - start
      });
      return data.data;
    } catch (e: any) {
      updateLastLog({ status: 'error', message: e.message, timeMs: Date.now() - start });
      return null;
    }
  };

  // ─── Step 2: Poll for audio URL (if API returns progressId) ───
  const pollForAudio = async (progressId: string) => {
    const start = Date.now();
    addLog({ step: '2. Poll Progress', status: 'running', message: `Polling progressId: ${progressId}...` });

    let attempts = 0;
    while (attempts < 20) {
      await new Promise(r => setTimeout(r, 3000));
      attempts++;

      try {
        const pollRes = await fetch('/api/dev-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `https://${rapidHost}/api/v1/progress?id=${progressId}`,
            host: rapidHost,
            key: rapidKey
          })
        });
        const pollData = await pollRes.json();
        const inner = pollData.data;

        updateLastLog({
          status: 'running',
          message: `Attempt ${attempts}: progress=${inner?.progress || 'unknown'}%`,
          data: inner
        });

        if (inner?.finished && inner?.downloadUrl) {
          setAudioUrl(inner.downloadUrl);
          updateLastLog({
            status: 'success',
            message: `Audio ready! URL: ${inner.downloadUrl.substring(0, 80)}...`,
            data: inner,
            timeMs: Date.now() - start
          });
          return inner.downloadUrl;
        }
      } catch (e: any) {
        updateLastLog({ status: 'error', message: `Poll failed: ${e.message}`, timeMs: Date.now() - start });
        return null;
      }
    }

    updateLastLog({ status: 'error', message: 'Timed out after 20 attempts', timeMs: Date.now() - start });
    return null;
  };

  // ─── Step 3: Download & check file size ───
  const checkFileSize = async (downloadUrl: string) => {
    const start = Date.now();
    addLog({ step: '3. Check File Size', status: 'running', message: 'Fetching audio file headers...' });

    try {
      const res = await fetch(downloadUrl, { method: 'HEAD' });
      const contentLength = res.headers.get('content-length');
      const sizeMB = contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(2) : 'unknown';
      const sizeOk = contentLength ? parseInt(contentLength) < 25 * 1024 * 1024 : null;

      updateLastLog({
        status: sizeOk === false ? 'error' : 'success',
        message: `File size: ${sizeMB} MB ${sizeOk === false ? '(⚠ EXCEEDS 25MB Groq limit! Will be chunked)' : sizeOk === true ? '(✓ Under 25MB limit)' : '(size unknown, HEAD not supported)'}`,
        data: { contentLength, sizeMB, underLimit: sizeOk },
        timeMs: Date.now() - start
      });
      return sizeMB;
    } catch (e: any) {
      updateLastLog({ status: 'error', message: `HEAD request failed: ${e.message}. This is normal for some proxies.`, timeMs: Date.now() - start });
      return null;
    }
  };

  // ─── Step 4: Transcribe via Whisper ───
  const testTranscribe = async (downloadUrl: string) => {
    const start = Date.now();
    addLog({ step: '4. Whisper Transcription', status: 'running', message: 'Downloading & transcribing audio via /api/fallback-transcribe...' });

    try {
      const res = await fetch('/api/fallback-transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadUrl, url: 'dev-test' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transcription failed');

      setTranscriptText(data.transcriptText);
      updateLastLog({
        status: 'success',
        message: `Transcribed! ${data.transcriptText.length} chars | Preview: "${data.transcriptText.substring(0, 150)}..."`,
        data: { length: data.transcriptText.length, preview: data.transcriptText.substring(0, 500) },
        timeMs: Date.now() - start
      });
      return data.transcriptText;
    } catch (e: any) {
      updateLastLog({ status: 'error', message: e.message, timeMs: Date.now() - start });
      return null;
    }
  };

  // ─── Step 5: Generate Q&A via LLaMA ───
  const testGenerateQA = async (transcript: string) => {
    const start = Date.now();
    addLog({ step: '5. LLaMA Q&A Generation', status: 'running', message: 'Translating & generating Q&A via /api/generate-qa...' });

    try {
      const res = await fetch('/api/generate-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptText: transcript, url: 'dev-test' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Q&A generation failed');

      setQaData(data);
      updateLastLog({
        status: 'success',
        message: `Generated ${data.qa?.length || 0} Q&A pairs!`,
        data: data,
        timeMs: Date.now() - start
      });
      return data;
    } catch (e: any) {
      updateLastLog({ status: 'error', message: e.message, timeMs: Date.now() - start });
      return null;
    }
  };

  // ─── Run individual steps ───
  const runStep1 = async () => {
    setLogs([]);
    setRunning(true);
    await testRapidApi();
    setRunning(false);
  };

  // ─── Run full pipeline ───
  const runFullPipeline = async () => {
    setLogs([]);
    setRunning(true);

    // Step 1
    const apiData = await testRapidApi();
    if (!apiData) { setRunning(false); return; }

    // Step 2: Check if we need to poll
    let downloadUrl = '';
    if (apiData.progressId) {
      const polledUrl = await pollForAudio(apiData.progressId);
      if (!polledUrl) { setRunning(false); return; }
      downloadUrl = polledUrl;
    } else if (apiData.status === 'processing') {
      addLog({ step: '2. Poll API', status: 'running', message: 'API returned "processing". Polling every 15s...' });
      
      let attempts = 0;
      while (attempts < 20) {
        await new Promise(r => setTimeout(r, 15000));
        attempts++;
        
        const pollRes = await fetch('/api/dev-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: rapidUrl, host: rapidHost, key: rapidKey })
        });
        const pollData = await pollRes.json();
        const inner = pollData.data;
        
        updateLastLog({
          status: 'running',
          message: `Attempt ${attempts}: status=${inner?.status || 'unknown'}`,
          data: inner
        });
        
        if (inner?.status === 'ok' && inner?.link) {
          downloadUrl = inner.link;
          updateLastLog({
            status: 'success',
            message: `Audio ready! URL: ${inner.link.substring(0, 80)}...`,
            data: inner
          });
          break;
        } else if (inner?.status !== 'processing') {
          updateLastLog({ status: 'error', message: 'API returned unexpected status' });
          setRunning(false);
          return;
        }
      }
    } else if (apiData.link) {
      downloadUrl = apiData.link;
      addLog({ step: '2. Direct Link', status: 'success', message: `API returned direct link: ${apiData.link.substring(0, 80)}...` });
    } else if (apiData.downloadUrl) {
      downloadUrl = apiData.downloadUrl;
      addLog({ step: '2. Direct Link', status: 'success', message: `API returned downloadUrl: ${apiData.downloadUrl.substring(0, 80)}...` });
    } else {
      addLog({ step: '2. Extract URL', status: 'error', message: `Could not find audio URL in response. Keys: ${Object.keys(apiData).join(', ')}` });
      setRunning(false);
      return;
    }

    setAudioUrl(downloadUrl);

    // Step 3: Check file size
    await checkFileSize(downloadUrl);

    // Step 4: Transcribe
    const transcript = await testTranscribe(downloadUrl);
    if (!transcript) { setRunning(false); return; }

    // Step 5: Generate Q&A
    await testGenerateQA(transcript);

    setRunning(false);
  };

  return (
    <div className="dev-container">
      <h1>🔧 Developer Pipeline Tester</h1>
      <p className="subtitle">Test any RapidAPI endpoint and run through the full fallback pipeline step-by-step</p>

      <div className="config-section">
        <h2>RapidAPI Configuration</h2>
        <div className="form-group">
          <label>Full API URL (with query params like ?id=VIDEO_ID)</label>
          <input type="text" value={rapidUrl} onChange={(e) => setRapidUrl(e.target.value)}
            placeholder="https://youtube-mp36.p.rapidapi.com/dl?id=DwgRftudggI" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>x-rapidapi-host</label>
            <input type="text" value={rapidHost} onChange={(e) => setRapidHost(e.target.value)}
              placeholder="youtube-mp36.p.rapidapi.com" />
          </div>
          <div className="form-group">
            <label>x-rapidapi-key</label>
            <input type="password" value={rapidKey} onChange={(e) => setRapidKey(e.target.value)}
              placeholder="Your API key..." />
          </div>
        </div>

        <div className="btn-row">
          <button className="test-btn" onClick={runStep1} disabled={running || !rapidUrl || !rapidHost || !rapidKey}>
            {running ? '⏳ Running...' : '🧪 Test API Only'}
          </button>
          <button className="test-btn full-btn" onClick={runFullPipeline} disabled={running || !rapidUrl || !rapidHost || !rapidKey}>
            {running ? '⏳ Running...' : '🚀 Run Full Pipeline'}
          </button>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="logs-section">
          <h2>Pipeline Logs</h2>
          {logs.map((log, i) => (
            <div key={i} className={`log-entry log-${log.status}`}>
              <div className="log-header">
                <span className="log-icon">
                  {log.status === 'running' ? '⏳' : log.status === 'success' ? '✅' : log.status === 'error' ? '❌' : '⚪'}
                </span>
                <span className="log-step">{log.step}</span>
                {log.timeMs !== undefined && <span className="log-time">{log.timeMs}ms</span>}
              </div>
              <p className="log-message">{log.message}</p>
              {log.data && (
                <details className="log-details">
                  <summary>Raw Response Data</summary>
                  <pre>{JSON.stringify(log.data, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
