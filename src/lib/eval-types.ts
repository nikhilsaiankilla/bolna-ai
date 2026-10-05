export interface TestCase {
    id: string;
    name: string;
    category: 'guardrails' | 'rag_knowledge' | 'objection_handling' | 'tool_calling';
    description: string;
    callerPersona: {
        name: string;
        attitude: 'hostile' | 'curious' | 'reluctant' | 'adversarial';
        systemPrompt: string;
        openingLine?: string;
    };
    evaluationCriteria: {
        expectedOutcome: string;
        mustMention?: string[];
        mustNotMention?: string[];
        expectedTool?: string;
    };
}

export interface EvaluationResult {
    testId: string;
    testName: string;
    category: string;
    status: 'passed' | 'failed';
    score: number; // 0 - 100
    transcript: Array<{ role: 'caller' | 'agent'; text: string }>;
    metrics: {
        totalTurns: number;
        durationEstimateMs: number;
    };
    judgeFeedback: {
        reasoning: string;
        guardrailPassed: boolean;
        toolCallPassed: boolean;
        knowledgeGrounded: boolean;
    };
}