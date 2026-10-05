import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const BOLNA_BASE_URL = 'https://api.bolna.ai';

const getHeaders = () => ({
    'Authorization': `Bearer ${process.env.BOLNA_API_KEY}`,
    'Content-Type': 'application/json',
});

async function pollExecution(executionId: string, maxAttempts = 30) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 4000));

        const res = await fetch(`${BOLNA_BASE_URL}/executions/${executionId}`, {
            headers: getHeaders(),
            cache: 'no-store',
        });

        if (!res.ok) continue;

        const data = await res.json();
        const status = data.status;

        if (['completed', 'failed', 'busy', 'no-answer'].includes(status)) {
            return data;
        }
    }
    return { status: 'timeout' };
}

export async function POST() {
    const apiKey = process.env.BOLNA_API_KEY;
    const agentId = process.env.BOLNA_AGENT_ID;
    const recipient = process.env.RECIPIENT_PHONE_NUMBER;

    if (!apiKey || !agentId || !recipient) {
        return NextResponse.json(
            { error: 'Missing environment variables in .env.local' },
            { status: 400 }
        );
    }

    try {
        // 1. Trigger call
        const callRes = await fetch(`${BOLNA_BASE_URL}/call`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                agent_id: agentId,
                recipient_phone_number: recipient,
            }),
        });

        if (!callRes.ok) {
            const errText = await callRes.text();
            return NextResponse.json({ error: `Call failed: ${errText}` }, { status: callRes.status });
        }

        const { execution_id } = await callRes.json();

        // 2. Poll until completed
        const executionSummary = await pollExecution(execution_id);

        // 3. Fetch granular logs
        const logRes = await fetch(`${BOLNA_BASE_URL}/executions/${execution_id}/log`, {
            headers: getHeaders(),
            cache: 'no-store',
        });

        const rawLogs = logRes.ok ? await logRes.json() : null;

        const result = {
            execution_id,
            execution_summary: executionSummary,
            raw_logs: rawLogs,
        };

        // 4. Save locally to a clean JSON file
        const logDir = path.join(process.cwd(), 'logs');
        await fs.mkdir(logDir, { recursive: true });
        await fs.writeFile(
            path.join(logDir, `${execution_id}.json`),
            JSON.stringify(result, null, 2),
            'utf-8'
        );

        return NextResponse.json({
            message: 'Call logged successfully',
            execution_id,
            saved_to: `logs/${execution_id}.json`,
            total_log_entries: Array.isArray(rawLogs) ? rawLogs.length : 0,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}