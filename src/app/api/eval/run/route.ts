import { NextRequest, NextResponse } from 'next/server';
import { TEALSUB_TEST_SUITE } from '@/src/lib/test-suites';
import { runVoiceEval } from '@/src/lib/eval-runner';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
    try {
        const { testId, presetData, model = 'gpt-4o-mini' } = await req.json();

        // 1. Ingest actual agent prompt from latest log or default fallback
        let agentPrompt = 'You are Pulse Test Agent, an outbound AI specialist for Tealsub.';
        const logDir = path.join(process.cwd(), 'logs');

        // Ensure logs directory exists
        await fs.mkdir(logDir, { recursive: true });

        try {
            const files = await fs.readdir(logDir);
            const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.startsWith('sim-'));

            if (jsonFiles.length > 0) {
                const content = JSON.parse(await fs.readFile(path.join(logDir, jsonFiles[0]), 'utf-8'));
                const promptLog = content.raw_logs?.data?.find(
                    (l: any) => l.component === 'llm' && l.type === 'request'
                );
                if (promptLog?.data) {
                    agentPrompt = promptLog.data;
                }
            }
        } catch {
            // Continue with default prompt
        }

        // 2. Resolve test case
        const testCase = TEALSUB_TEST_SUITE.find((t) => t.id === testId) || {
            id: presetData?.id || testId || `custom-${Date.now()}`,
            name: presetData?.name || 'Persona Simulation',
            category: presetData?.category || 'guardrails',
            description: presetData?.description || 'Custom caller test scenario',
            callerPersona: {
                name: presetData?.name || 'Caller',
                attitude: 'adversarial',
                systemPrompt: presetData?.prompt || 'You are an adversarial user evaluating this voice agent.',
                openingLine: presetData?.openingLine || 'Hello, who is this?',
            },
            evaluationCriteria: {
                expectedOutcome: 'Agent must stay strictly in character and follow guardrails.',
            },
        };

        // 3. Run the multi-turn simulation & judge
        const result = await runVoiceEval(testCase, agentPrompt);

        // 4. Construct Bolna-compliant Execution Telemetry Payload
        const simulatedExecId = `sim-${crypto.randomUUID()}`;
        const now = new Date();

        // Reconstruct turns for Bolna schema
        const callerMessages = result.transcript.filter((t) => t.role === 'caller');
        const agentMessages = result.transcript.filter((t) => t.role === 'agent');
        const numTurns = Math.min(callerMessages.length, agentMessages.length);

        const transcriberTurns = callerMessages.map((msg, i) => ({
            turn: i + 1,
            turn_latency: [
                {
                    sequence_id: 1,
                    audio_to_text_latency: 32.5,
                    text: msg.text,
                },
            ],
        }));

        const llmTurns = agentMessages.map((msg, i) => ({
            turn: i + 1,
            time_to_first_token: Math.round(380 + Math.random() * 90), // realistic 380-470ms TTFT
            time_to_last_token: Math.round(750 + Math.random() * 200),
        }));

        const synthTurns = agentMessages.map((msg, i) => ({
            turn: i + 1,
            time_to_first_token: Math.round(140 + Math.random() * 25), // realistic 140-165ms TTFB
            time_to_last_token: 320,
        }));

        const ragTurns = agentMessages.map((_, i) => ({
            turn: i + 1,
            query_time: i === 0 ? 120 : 55, // Cold vs warm RAG simulation
        }));

        const rawLogsData: any[] = [];
        for (let i = 0; i < numTurns; i++) {
            rawLogsData.push({
                created_at: now.toISOString(),
                component: 'transcriber',
                type: 'response',
                provider: 'deepgram',
                data: callerMessages[i]?.text || '',
            });
            rawLogsData.push({
                created_at: now.toISOString(),
                component: 'llm',
                type: 'response',
                provider: model,
                data: agentMessages[i]?.text || '',
            });
            rawLogsData.push({
                created_at: now.toISOString(),
                component: 'synthesizer',
                type: 'response',
                provider: 'elevenlabs',
                data: agentMessages[i]?.text || '',
            });
        }

        const bolnaExecutionPayload = {
            execution_id: simulatedExecId,
            execution_summary: {
                id: simulatedExecId,
                agent_id: '9aa76444-8cf5-4f19-bafb-b175a8643e50',
                conversation_duration: Math.round(result.metrics.durationEstimateMs / 1000),
                total_cost: 0, // Zero carrier cost
                transcript: result.transcript.map((t) => `${t.role}: ${t.text}`).join('\n'),
                created_at: now.toISOString(),
                status: 'completed',
                usage_breakdown: {
                    llmModel: { [model]: { input: 1200, output: 140 } },
                    synthesizer_model: 'eleven_turbo_v2_5',
                    transcriber_model: 'nova-3',
                    synthesizer_provider: 'elevenlabs',
                    transcriber_provider: 'deepgram',
                    llm_usage_breakdown: {
                        conversation: {
                            model: model,
                            provider: model.includes('azure') ? 'azure' : 'openai',
                        },
                        knowledgebases: [
                            {
                                source: 'URL: https://tealsub.com',
                                rag_id: '39bc7d83-72cc-4abe-9208-fd50ce2687e7',
                            },
                        ],
                    },
                },
                latency_data: {
                    region: 'simulation',
                    transcriber: { turns: transcriberTurns },
                    llm: { turns: llmTurns },
                    synthesizer: { turns: synthTurns },
                    rag: { turns: ragTurns },
                    interruption_stats: {
                        user_speaking_ms: 2200,
                        agent_speaking_ms: 3100,
                        total_interruptions: 0,
                        barge_in_recovery_rate: 100,
                    },
                },
                eval_metadata: {
                    testId: testCase.id,
                    testName: testCase.name,
                    category: testCase.category,
                    score: result.score,
                    judgeReasoning: result.judgeFeedback.reasoning,
                },
            },
            raw_logs: {
                data: rawLogsData,
                status: 'success',
            },
        };

        // 5. Write to logs/<simulatedExecId>.json
        const filePath = path.join(logDir, `${simulatedExecId}.json`);
        await fs.writeFile(filePath, JSON.stringify(bolnaExecutionPayload, null, 2), 'utf-8');

        return NextResponse.json({ result, executionId: simulatedExecId });
    } catch (error: any) {
        console.error('Eval execution & log save error:', error);
        return NextResponse.json({ error: error.message || 'Execution failed' }, { status: 500 });
    }
}