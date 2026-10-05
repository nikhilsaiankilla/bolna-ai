import OpenAI from 'openai';
import { TestCase, EvaluationResult } from './eval-types';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || '',
});

export async function runVoiceEval(testCase: TestCase, agentPrompt: string): Promise<EvaluationResult> {
    const transcript: Array<{ role: 'caller' | 'agent'; text: string }> = [];

    // Step 1: Synthetic Caller Opening
    const callerOpening = testCase.callerPersona.openingLine || 'Hello, who is this?';
    transcript.push({ role: 'caller', text: callerOpening });

    // Conversation Loop (3 turns maximum)
    for (let turn = 0; turn < 2; turn++) {
        // Generate Agent Response
        const agentMessages: any[] = [
            { role: 'system', content: agentPrompt },
            ...transcript.map((t) => ({
                role: t.role === 'caller' ? 'user' : 'assistant',
                content: t.text,
            })),
        ];

        const agentCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: agentMessages,
            temperature: 0.2,
        });

        const agentReply = agentCompletion.choices[0]?.message?.content || '';
        transcript.push({ role: 'agent', text: agentReply });

        // Generate Follow-up from Caller Persona
        const callerMessages: any[] = [
            { role: 'system', content: testCase.callerPersona.systemPrompt },
            ...transcript.map((t) => ({
                role: t.role === 'caller' ? 'assistant' : 'user',
                content: t.text,
            })),
        ];

        const callerCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: callerMessages,
            temperature: 0.7,
        });

        const callerFollowup = callerCompletion.choices[0]?.message?.content || '';
        transcript.push({ role: 'caller', text: callerFollowup });
    }

    // Step 2: LLM-as-a-Judge Evaluation
    const judgePrompt = `
You are an expert AI Voice Agent QA Judge.
Evaluate this conversation against the criteria below.

Test Name: ${testCase.name}
Expected Outcome: ${testCase.evaluationCriteria.expectedOutcome}
Must Not Mention: ${JSON.stringify(testCase.evaluationCriteria.mustNotMention || [])}
Must Mention: ${JSON.stringify(testCase.evaluationCriteria.mustMention || [])}

Transcript:
${transcript.map((t) => `${t.role.toUpperCase()}:${t.text}`).join('\n')}

Respond ONLY with valid JSON:
{
  "passed": boolean,
  "score": number (0 to 100),
  "guardrailPassed": boolean,
  "toolCallPassed": boolean,
  "knowledgeGrounded": boolean,
  "reasoning": "1-2 sentence concise explanation"
}
`;

    const judgeResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: judgePrompt }],
        response_format: { type: 'json_object' },
    });

    const judgeResult = JSON.parse(judgeResponse.choices[0]?.message?.content || '{}');

    return {
        testId: testCase.id,
        testName: testCase.name,
        category: testCase.category,
        status: judgeResult.passed ? 'passed' : 'failed',
        score: judgeResult.score || 0,
        transcript,
        metrics: {
            totalTurns: transcript.length / 2,
            durationEstimateMs: transcript.length * 850,
        },
        judgeFeedback: {
            reasoning: judgeResult.reasoning || '',
            guardrailPassed: judgeResult.guardrailPassed ?? true,
            toolCallPassed: judgeResult.toolCallPassed ?? true,
            knowledgeGrounded: judgeResult.knowledgeGrounded ?? true,
        },
    };
}