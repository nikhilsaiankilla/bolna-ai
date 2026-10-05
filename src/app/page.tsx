'use client';

import { useState, useEffect } from 'react';
import {
  Activity,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { CallTelemetrySummary, TurnWaterfall } from '@/src/lib/parse-telemetry';
import { BolnaLogo } from '@/src/components/bolna-logo';
import { PulseView } from '@/src/components/pulse-view';
import { EvalView } from '@/src/components/eval-view';

export default function Home() {
  const [mainTab, setMainTab] = useState<'pulse' | 'eval'>('pulse');
  const [runs, setRuns] = useState<CallTelemetrySummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<CallTelemetrySummary | null>(null);
  const [selectedTurn, setSelectedTurn] = useState<TurnWaterfall | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('+918374056888');
  const [isCalling, setIsCalling] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const fetchRuns = async () => {
    try {
      const res = await fetch('/api/bolna/runs');
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
        if (data.runs?.length > 0 && !selectedRun) {
          setSelectedRun(data.runs[0]);
          setSelectedTurn(data.runs[0].turns[0] || null);
        }
      }
    } catch (err) {
      console.error('Failed to load runs:', err);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const triggerCall = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCalling(true);
    setStatusMessage('Initiating outbound call trace...');

    try {
      const res = await fetch('/api/bolna/test-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) throw new Error('Call trigger failed');

      setStatusMessage('Ingesting & parsing execution telemetry...');
      await fetchRuns();
      setStatusMessage('');
    } catch {
      setStatusMessage('Failed to trigger call.');
    } finally {
      setIsCalling(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#fafbfc] text-slate-800 font-sans antialiased text-sm">
      {/* Top Banner */}
      <div className="bg-[#f5f0ff] border-b border-[#ebdfff] text-[#581c87] text-xs py-2 px-8 text-center font-medium flex items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#9333ea] animate-pulse" />
          <strong>Bolna Engineering Suite</strong> — Observability (Pulse) &amp; Automated Testing (Eval) by <strong>Nikhil Sai Ankilla</strong>
        </span>
        <span className="text-[#c084fc]">•</span>
        <a
          href="https://nikhilsai.in"
          target="_blank"
          rel="noreferrer"
          className="underline font-semibold hover:text-[#3b0764] inline-flex items-center gap-1 transition"
        >
          nikhilsai.in <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Main Header with Top-Level Tabs */}
      <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3">
          <BolnaLogo className="h-8" />
          <div className="flex items-center gap-2">
            <span className="text-slate-300">/</span>
            <span className="text-slate-600 font-medium">Developer Platform</span>
          </div>
        </div>

        {/* Primary Platform Switcher Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setMainTab('pulse')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${mainTab === 'pulse'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <Activity className="w-3.5 h-3.5" />
            BolnaPulse (Telemetry)
          </button>
          <button
            onClick={() => setMainTab('eval')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${mainTab === 'eval'
                ? 'bg-white text-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            VoiceEval (CI/CD Testing)
          </button>
        </div>
      </header>

      {/* Main Full-Width Content Container */}
      <main className="flex-1 p-8 w-full">
        {mainTab === 'pulse' ? (
          <PulseView
            runs={runs}
            selectedRun={selectedRun}
            setSelectedRun={setSelectedRun}
            selectedTurn={selectedTurn}
            setSelectedTurn={setSelectedTurn}
            phoneNumber={phoneNumber}
            setPhoneNumber={setPhoneNumber}
            isCalling={isCalling}
            onTriggerCall={triggerCall}
            statusMessage={statusMessage}
          />
        ) : (
          <EvalView />
        )}
      </main>
    </div>
  );
}