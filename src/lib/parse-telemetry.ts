export interface TurnWaterfall {
    turnNumber: number;
    userText: string;
    agentText: string;
    asrLatencyMs: number;
    ragLatencyMs: number;
    llmTtftMs: number;
    llmTotalMs: number;
    ttsTtfbMs: number;
    ttsTotalMs: number;
    totalTurnLatencyMs: number;
    toolCall?: {
        name: string;
        args: Record<string, unknown>;
    };
    bottleneck: 'asr' | 'rag' | 'llm' | 'tts' | 'tool';
}

export interface CallTelemetrySummary {
    executionId: string;
    createdAt: string;
    durationSeconds: number;
    costInrOrCents: number;
    totalTurns: number;
    avgTurnLatencyMs: number;
    avgRagLatencyMs: number;
    avgLlmTtftMs: number;
    avgTtsTtfbMs: number;
    p95LatencyMs: number;
    interruptionStats: {
        userSpeakingMs: number;
        agentSpeakingMs: number;
        totalInterruptions: number;
        bargeInRecoveryRate: number | null;
    };
    providerStack: {
        asr: string;
        rag: string;
        llm: string;
        tts: string;
        telephony: string;
    };
    turns: TurnWaterfall[];
}

export function parseBolnaExecution(raw: any): CallTelemetrySummary {
    const summary = raw.execution_summary || {};
    const latency = summary.latency_data || {};
    const logs = raw.raw_logs?.data || [];

    const asrTurns = latency.transcriber?.turns || [];
    const llmTurns = latency.llm?.turns || [];
    const ttsTurns = latency.synthesizer?.turns || [];
    const ragTurns = latency.rag?.turns || [];

    const maxTurns = Math.max(asrTurns.length, llmTurns.length);
    const turns: TurnWaterfall[] = [];

    for (let i = 0; i < maxTurns; i++) {
        const turnIndex = i + 1;

        // 1. ASR
        const asrObj = asrTurns.find((t: any) => t.turn === turnIndex);
        const lastSeq = asrObj?.turn_latency?.[asrObj.turn_latency.length - 1];
        const userText = lastSeq?.text || '';
        const asrLatency = Math.round(lastSeq?.audio_to_text_latency || 32);

        // 2. RAG (Reads query_time or latency)
        const ragObj = ragTurns.find((t: any) => t.turn === turnIndex);
        const ragLatency = Math.round(ragObj?.query_time || ragObj?.latency || 0);

        // 3. LLM
        const llmObj = llmTurns.find((t: any) => t.turn === turnIndex);
        const llmTtft = Math.round(llmObj?.time_to_first_token || 0);
        const llmTotal = Math.round(llmObj?.time_to_last_token || 0);

        // 4. TTS
        const ttsObj = ttsTurns.find((t: any) => t.turn === turnIndex);
        const ttsTtfb = Math.round(ttsObj?.time_to_first_token || 0);
        const ttsTotal = Math.round(ttsObj?.time_to_last_token || 0);

        // 5. Agent Text
        const synthResponses = logs.filter(
            (l: any) => l.component === 'synthesizer' && l.type === 'response'
        );
        const agentText = synthResponses[i]?.data || '';

        // Tool Call detection
        const toolLog = logs.find(
            (l: any) => l.component === 'function_call' && l.type === 'request'
        );
        let toolCall = undefined;
        if (toolLog && i === maxTurns - 1) {
            try {
                toolCall = {
                    name: toolLog.tool_name,
                    args: JSON.parse(toolLog.data),
                };
            } catch {
                toolCall = { name: toolLog.tool_name, args: {} };
            }
        }

        const totalLatency = asrLatency + ragLatency + llmTtft + ttsTtfb;

        // Detect bottleneck
        let bottleneck: 'asr' | 'rag' | 'llm' | 'tts' | 'tool' = 'llm';
        if (toolCall) {
            bottleneck = 'tool';
        } else if (ragLatency > llmTtft && ragLatency > asrLatency && ragLatency > ttsTtfb) {
            bottleneck = 'rag';
        } else if (asrLatency > llmTtft && asrLatency > ttsTtfb) {
            bottleneck = 'asr';
        } else if (ttsTtfb > llmTtft && ttsTtfb > asrLatency) {
            bottleneck = 'tts';
        }

        turns.push({
            turnNumber: turnIndex,
            userText,
            agentText,
            asrLatencyMs: asrLatency,
            ragLatencyMs: ragLatency,
            llmTtftMs: llmTtft,
            llmTotalMs: llmTotal,
            ttsTtfbMs: ttsTtfb,
            ttsTotalMs: ttsTotal,
            totalTurnLatencyMs: totalLatency,
            toolCall,
            bottleneck,
        });
    }

    const validTurns = turns.filter((t) => t.totalTurnLatencyMs > 0);
    const avgTurnLatency = Math.round(
        validTurns.reduce((acc, t) => acc + t.totalTurnLatencyMs, 0) / (validTurns.length || 1)
    );
    const avgRag = Math.round(
        validTurns.reduce((acc, t) => acc + t.ragLatencyMs, 0) / (validTurns.length || 1)
    );
    const avgLlm = Math.round(
        validTurns.reduce((acc, t) => acc + t.llmTtftMs, 0) / (validTurns.length || 1)
    );
    const avgTts = Math.round(
        validTurns.reduce((acc, t) => acc + t.ttsTtfbMs, 0) / (validTurns.length || 1)
    );

    const sortedLatencies = [...validTurns.map((t) => t.totalTurnLatencyMs)].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p95 = sortedLatencies[p95Index] || avgTurnLatency;

    const intStats = latency.interruption_stats || {};

    return {
        executionId: raw.execution_id || summary.id || 'unknown_exec',
        createdAt: summary.created_at || new Date().toISOString(),
        durationSeconds: summary.conversation_duration || 0,
        costInrOrCents: summary.total_cost || 0,
        totalTurns: turns.length,
        avgTurnLatencyMs: avgTurnLatency,
        avgRagLatencyMs: avgRag,
        avgLlmTtftMs: avgLlm,
        avgTtsTtfbMs: avgTts,
        p95LatencyMs: p95,
        interruptionStats: {
            userSpeakingMs: intStats.user_speaking_ms || 0,
            agentSpeakingMs: intStats.agent_speaking_ms || 0,
            totalInterruptions: intStats.total_interruptions || 0,
            bargeInRecoveryRate: intStats.barge_in_recovery_rate ?? null,
        },
        providerStack: {
            asr: `${summary.usage_breakdown?.transcriber_provider || 'deepgram'} (${summary.usage_breakdown?.transcriber_model || 'nova-2'})`,
            rag: summary.usage_breakdown?.llm_usage_breakdown?.knowledgebases?.length ? 'Tealsub Knowledge Base' : 'None',
            llm: summary.usage_breakdown?.llm_usage_breakdown?.conversation?.model || 'gpt-4o-mini',
            tts: `${summary.usage_breakdown?.synthesizer_provider || 'elevenlabs'} (${summary.usage_breakdown?.synthesizer_model || 'eleven_turbo_v2_5'})`,
            telephony: summary.telephony_data?.provider || 'vobiz',
        },
        turns,
    };
}