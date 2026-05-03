import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  patchAlertRule,
  deleteAlertRule,
  RuleValidationError,
} from '@fx/core/alerts';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated())) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return new NextResponse('bad id', { status: 400 });

  const body = await req.json();
  try {
    await patchAlertRule(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof RuleValidationError) {
      return new NextResponse(err.issues.join('\n'), { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAuthenticated())) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return new NextResponse('bad id', { status: 400 });
  await deleteAlertRule(id);
  return NextResponse.json({ ok: true });
}
