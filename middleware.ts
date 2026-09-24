import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  // Auth enforcement placeholder — add your session logic here
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
