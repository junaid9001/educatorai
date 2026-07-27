'use client';

import { useState, useEffect } from 'react';
import { Play, Download, CheckCircle, Clock, Plus, Lock } from 'lucide-react';
import { jsPDF } from 'jspdf';

type QAItem = { question: string; answer: string };

export default function Home() {
  const [pin, setPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
  
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');
  const [qaData, setQaData] = useState<QAItem[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  // Fetch history on load
  useEffect(() => {
    if (isAuthenticated) {
      fetchHistory();
    }
  }, [isAuthenticated]);

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, ''); // only digits
    if (val.length <= 4) {
      setPin(val);
      if (val === '4444') {
        setIsAuthenticated(true);
      }
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error('Failed to fetch history', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setStatus('loading');
    setErrorText('');
    setQaData([]);

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process video');
      }

      setQaData(data.qa);
      setStatus('success');
      fetchHistory();
    } catch (err: any) {
      console.error('Frontend processing error:', err);
      setErrorText(err.message || 'An unexpected error occurred');
      setStatus('error');
    }
  };

  const generatePDF = (data: QAItem[], type: 'student' | 'validator' = 'student') => {
    const doc = new jsPDF();
    let y = 20;
    
    doc.setFontSize(20);
    doc.text(type === 'student' ? 'Student Paper' : 'Validator Key', 20, y);
    y += 15;

    doc.setFontSize(12);
    data.forEach((qa, index) => {
      doc.setFont('helvetica', 'bold');
      const questionLines = doc.splitTextToSize(`${index + 1}. ${qa.question}`, 170);
      doc.text(questionLines, 20, y);
      y += (questionLines.length * 7);

      if (type === 'validator') {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        const answerLines = doc.splitTextToSize(`Ans: ${qa.answer}`, 170);
        doc.text(answerLines, 20, y);
        y += (answerLines.length * 7) + 5;
        doc.setTextColor(0, 0, 0);
      } else {
        y += 30; 
      }

      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save(`QA_${type}_${Date.now()}.pdf`);
  };

  if (!isAuthenticated) {
    return (
      <main className="auth-container">
        <div className="auth-card">
          <div className="auth-icon-wrapper">
            <Lock size={32} className="auth-icon" />
          </div>
          <h1>Enter PIN</h1>
          <p>This tool is locked. Please enter your 4-digit PIN.</p>
          
          <div className="pin-input-container">
            <input 
              type="password" 
              value={pin}
              onChange={handlePinChange}
              placeholder="••••"
              autoFocus
              className="pin-input"
            />
          </div>
          {pin.length === 4 && pin !== '4444' && (
            <p className="error-text">Incorrect PIN. Try again.</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="app-container">
      <div className="app-header">
        <h1>Educator AI</h1>
        <p>Instantly generate study materials from any YouTube video.</p>
      </div>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'generate' ? 'active' : ''}`}
          onClick={() => setActiveTab('generate')}
        >
          <Plus size={18} /> Generate New
        </button>
        <button 
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <Clock size={18} /> History
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'generate' && (
          <div className="card glass-card">
            <form onSubmit={handleSubmit} className="generate-form">
              <div className="input-group">
                <label>YouTube Video URL</label>
                <input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>

              {status === 'error' && (
                <div className="error-box">
                  <p>{errorText}</p>
                </div>
              )}

              <button type="submit" disabled={status === 'loading'} className="btn btn-primary generate-btn">
                {status === 'loading' ? (
                  <div className="loader-inline"></div>
                ) : (
                  <>
                    <Play size={20} /> Generate Q&A
                  </>
                )}
              </button>
            </form>

            {status === 'loading' && (
              <div className="status-box loading-box">
                <div className="loader-spinner"></div>
                <p>Analyzing video & generating questions...</p>
              </div>
            )}

            {status === 'success' && qaData.length > 0 && (
              <div className="status-box success-box">
                <CheckCircle size={32} className="success-icon" />
                <h2>Success!</h2>
                <p>Generated {qaData.length} questions perfectly tailored to 10th standard.</p>
                
                <div className="action-buttons">
                  <button onClick={() => generatePDF(qaData, 'student')} className="btn btn-primary">
                    <Download size={20} /> Student Paper
                  </button>
                  <button onClick={() => generatePDF(qaData, 'validator')} className="btn btn-secondary">
                    <Download size={20} /> Validator Key
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="history-container">
            {history.length === 0 ? (
              <div className="empty-state">
                <Clock size={40} />
                <p>No recent generations found.</p>
              </div>
            ) : (
              <div className="history-list">
                {history.map((item) => (
                  <div key={item.id} className="history-card glass-card">
                    <div className="history-info">
                      <a href={item.video_url} target="_blank" rel="noreferrer" className="history-link">
                        {item.video_url}
                      </a>
                      <span className="history-date">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="history-actions">
                      <button 
                        onClick={() => { 
                          setQaData(item.qa_data); 
                          setStatus('success'); 
                          setActiveTab('generate');
                        }}
                        className="btn btn-small btn-secondary"
                      >
                        View
                      </button>
                      <button 
                        onClick={() => generatePDF(item.qa_data, 'student')}
                        className="btn btn-small btn-outline-primary"
                      >
                        PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
