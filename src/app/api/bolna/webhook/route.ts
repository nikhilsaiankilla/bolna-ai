import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();
        const executionId = payload.execution_id || payload.id || `exec_${Date.now()}`;

        // Standardize structure
        const dataToSave = {
            execution_id: executionId,
            execution_summary: payload.execution_summary || payload,
            raw_logs: payload.raw_logs || { data: [] },
        };

        const logDir = path.join(process.cwd(), 'logs');
        await fs.mkdir(logDir, { recursive: true });
        await fs.writeFile(
            path.join(logDir, `${executionId}.json`),
            JSON.stringify(dataToSave, null, 2),
            'utf-8'
        );

        return NextResponse.json({ status: 'received', execution_id: executionId }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}