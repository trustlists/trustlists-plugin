import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * OpenAI domain verification reads the exact challenge token as plain text.
 * Set OPENAI_APPS_CHALLENGE in the hosted deployment. Never commit the token.
 */
export function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim() || '';
  if (!token || /[\r\n]/.test(token)) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return new NextResponse(token, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
