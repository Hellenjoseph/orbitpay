import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    // 1. Check Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or invalid token' },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Bad Request: Invalid JSON body' },
        { status: 400 }
      );
    }

    const { roomId, targetId } = body;

    // 2. Validate input parameters
    if (!roomId || !targetId) {
      return NextResponse.json(
        { error: 'Bad Request: roomId and targetId are required' },
        { status: 400 }
      );
    }

    // 3. Handle Offline Mock Mode
    if (!isSupabaseConfigured() || !supabaseAdmin) {
      // Mock mode for local testing
      console.warn('Supabase not configured. Processing vote in mock mode.');
      
      if (token === 'invalid-token') {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid token' },
          { status: 401 }
        );
      }

      // Simulate a successful vote cast
      return NextResponse.json({
        success: true,
        message: 'Vote cast successfully (Mock Mode)',
        vote: {
          roomId,
          voterId: token.replace('mock-voter-', ''),
          targetId,
          createdAt: new Date().toISOString(),
        },
        removed: false,
      });
    }

    // 4. Supabase Mode - Retrieve authenticated user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid authentication token' },
        { status: 401 }
      );
    }

    const voterId = user.id;

    // Check if voter is an active member of the room
    const { data: voterMember, error: voterCheckError } = await supabaseAdmin
      .from('room_members')
      .select('status')
      .eq('room_id', roomId)
      .eq('profile_id', voterId)
      .single();

    if (voterCheckError || !voterMember || voterMember.status !== 'active') {
      return NextResponse.json(
        { error: 'Forbidden: Voter must be an active member of the room' },
        { status: 403 }
      );
    }

    // Record the removal vote
    const { error: voteError } = await supabaseAdmin
      .from('room_removal_votes')
      .insert({
        room_id: roomId,
        voter_id: voterId,
        target_id: targetId,
      });

    if (voteError) {
      // Handle unique constraint violation (voter already voted for this target in this room)
      if (voteError.code === '23505') {
        return NextResponse.json(
          { error: 'Conflict: You have already voted to remove this member' },
          { status: 409 }
        );
      }
      console.error('Error inserting vote:', voteError);
      return NextResponse.json(
        { error: 'Internal Server Error: Failed to record vote' },
        { status: 500 }
      );
    }

    // Check if the target member is now removed (due to database trigger check_removal_threshold)
    const { data: targetMember, error: targetCheckError } = await supabaseAdmin
      .from('room_members')
      .select('status')
      .eq('room_id', roomId)
      .eq('profile_id', targetId)
      .single();

    if (targetCheckError) {
      console.error('Error checking target status:', targetCheckError);
    }

    const wasRemoved = targetMember ? targetMember.status === 'removed' : false;

    return NextResponse.json({
      success: true,
      message: 'Vote cast successfully',
      removed: wasRemoved,
    });
  } catch (error: any) {
    console.error('Vote remove API error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
