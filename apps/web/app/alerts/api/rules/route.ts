import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { createAlertRule, RuleValidationError } from '@fx/core/alerts';

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const body = await req.json();
  try {
    const { id } = await createAlertRule(body);
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof RuleValidationError) {
      return new NextResponse(err.issues.join('\n'), { status: 400 });
    }
    throw err;
  }
}
