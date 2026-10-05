import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { parseBolnaExecution } from '@/src/lib/parse-telemetry';

export async function GET() {
    try {
        const logDir = path.join(process.cwd(), 'logs');
        const files = await fs.readdir(logDir);
        const jsonFiles = files.filter((f) => f.endsWith('.json'));

        const parsedRuns = [];

        for (const file of jsonFiles) {
            const content = await fs.readFile(path.join(logDir, file), 'utf-8');
            const raw = JSON.parse(content);
            parsedRuns.push(parseBolnaExecution(raw));
        }

        return NextResponse.json({ runs: parsedRuns });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}