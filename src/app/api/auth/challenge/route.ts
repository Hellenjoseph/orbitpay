import { NextResponse } from 'next/server';
import { generateChallengeNonce } from '@/lib/stellar';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const challenge = generateChallengeNonce();
    const challengeText = `Sign this message to authenticate with StellarWhisper: ${challenge}`;

    const cookieStore = await cookies();
    cookieStore.set('auth_challenge', challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300, // 5 minutes
      path: '/',
    });

    return NextResponse.json({ challenge: challengeText });
  } catch (error: any) {
    console.error('Challenge generation error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
