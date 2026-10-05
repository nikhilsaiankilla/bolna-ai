import { CallTelemetrySummary } from './parse-telemetry';

export interface DiagnosticInsight {
    id: string;
    severity: 'critical' | 'warning' | 'optimal';
    component: 'ASR' | 'LLM' | 'TTS' | 'Network';
    title: string;
    description: string;
    recommendation: string;
    potentialSavingsMs: number;
}

export function runLatencyDiagnostics(summary: CallTelemetrySummary): DiagnosticInsight[] {
    const insights: DiagnosticInsight[] = [];
    const { avgTurnLatencyMs, avgLlmTtftMs, avgTtsTtfbMs, providerStack, turns } = summary;

    // 1. LLM TTFT Analysis
    if (avgLlmTtftMs > 450) {
        insights.push({
            id: 'llm-ttft-spike',
            severity: 'critical',
            component: 'LLM',
            title: 'High LLM Time-To-First-Token (TTFT)',
            description: `LLM inference accounts for ${Math.round((avgLlmTtftMs / avgTurnLatencyMs) * 100)}% of turn latency (${avgLlmTtftMs}ms avg).`,
            recommendation: `Currently on ${providerStack.llm}. Consider switching to Groq (Llama-3.3-70b) or Anthropic Claude 3.5 Haiku with prompt caching to target <200ms TTFT.`,
            potentialSavingsMs: Math.max(0, avgLlmTtftMs - 220),
        });
    }

    // 2. TTS TTFB Analysis
    if (avgTtsTtfbMs > 250) {
        insights.push({
            id: 'tts-ttfb-high',
            severity: 'warning',
            component: 'TTS',
            title: 'Elevated Synthesizer Latency',
            description: `TTS generation took ${avgTtsTtfbMs}ms to emit first audio chunk.`,
            recommendation: `Switch to Cartesia Sonic or configure streaming buffer chunking to 150 characters to reduce pre-buffer latency.`,
            potentialSavingsMs: Math.max(0, avgTtsTtfbMs - 120),
        });
    }

    // 3. ASR Endpointing & Silence Lag
    const asrP90 = Math.max(...turns.map((t) => t.asrLatencyMs));
    if (asrP90 > 80) {
        insights.push({
            id: 'asr-lag',
            severity: 'warning',
            component: 'ASR',
            title: 'Transcription Finalization Delay',
            description: `Speech transcription peaked at ${asrP90}ms.`,
            recommendation: `Reduce VAD endpointing from 200ms down to 140ms in Bolna agent settings for faster speech-end cutoff.`,
            potentialSavingsMs: Math.max(0, asrP90 - 40),
        });
    }

    // 4. Optimal State
    if (insights.length === 0) {
        insights.push({
            id: 'optimal',
            severity: 'optimal',
            component: 'Network',
            title: 'Sub-600ms Conversational Flow Achieved',
            description: `All components operating within production targets (Avg: ${avgTurnLatencyMs}ms).`,
            recommendation: `Pipeline is production-ready. No immediate provider routing changes required.`,
            potentialSavingsMs: 0,
        });
    }

    return insights;
}