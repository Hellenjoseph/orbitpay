import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyStellarSignature } from '@/lib/stellar';
import { supabase, supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { publicKey, signature } = await req.json();

    if (!publicKey || !signature) {
      return NextResponse.json(
        { error: 'Public key and signature are required' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const challengeCookie = cookieStore.get('auth_challenge');

    if (!challengeCookie) {
      return NextResponse.json(
        { error: 'Challenge session expired or missing. Please request a challenge first.' },
        { status: 400 }
      );
    }

    const challenge = challengeCookie.value;
    const challengeText = `Sign this message to authenticate with StellarWhisper: ${challenge}`;

    // Verify cryptographic signature
    const isValid = verifyStellarSignature(publicKey, challengeText, signature);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Cryptographic signature verification failed' },
        { status: 401 }
      );
    }

    // Clear challenge cookie
    cookieStore.delete('auth_challenge');

    // Safe fallback for mock/local development without Supabase keys
    if (!isSupabaseConfigured() || !supabaseAdmin) {
      console.warn('Supabase not configured. Returning mock authenticated session.');
      const mockUser = {
        id: '00000000-0000-0000-0000-000000000000',
        email: `${publicKey}@stellar.anon`,
        user_metadata: {
          stellar_address: publicKey,
          display_name: `Anon-${publicKey.substring(0, 6)}`,
        },
      };
      return NextResponse.json({
        user: mockUser,
        session: {
          access_token: 'mock-jwt-token-for-dev',
          refresh_token: 'mock-refresh-token',
          expires_in: 3600,
        },
      });
    }

    const email = `${publicKey}@stellar.anon`;
    
    // Check if user already exists
    let { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
    let user = existingUser?.users.find(u => u.email === email);

    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key';
    const crypto = require('crypto');
    const deterministicPassword = crypto
      .createHmac('sha256', supabaseServiceKey)
      .update(publicKey)
      .digest('hex');

    if (!user) {
      // Create user if they do not exist
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        password: deterministicPassword,
        user_metadata: {
          stellar_address: publicKey,
          display_name: `Anon-${publicKey.substring(0, 6)}`,
        },
      });

      if (createError) {
        console.error('Error creating user in Supabase Auth:', createError);
        return NextResponse.json({ error: 'Auth registration failed' }, { status: 500 });
      }

      user = newUser.user;
    }

    if (!user) {
      return NextResponse.json({ error: 'User resolution failed' }, { status: 500 });
    }

    // Generate Supabase session by logging in with the derived deterministic password
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password: deterministicPassword,
    });

    if (sessionError) {
      console.error('Error signing in user:', sessionError);
      return NextResponse.json({ error: 'Session generation failed' }, { status: 500 });
    }

    return NextResponse.json({
      user: sessionData.user,
      session: sessionData.session,
    });
  } catch (error: any) {
    console.error('Verify endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
