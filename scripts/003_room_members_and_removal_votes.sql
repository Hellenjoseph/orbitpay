-- Create rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create room_members table with E2E encrypted room key storage and member status
CREATE TABLE IF NOT EXISTS public.room_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    encrypted_room_key TEXT NOT NULL, -- AES room key encrypted with the member's public key
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'removed')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(room_id, profile_id)
);

-- Create room_removal_votes table to hold wallet-based voting data
CREATE TABLE IF NOT EXISTS public.room_removal_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    voter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(room_id, voter_id, target_id)
);

-- Create messages table for storing E2E encrypted communication
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    encrypted_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on all tables
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_removal_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Room policies
CREATE POLICY "Allow authenticated users to read rooms" ON public.rooms
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated users to create rooms" ON public.rooms
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Room member policies
CREATE POLICY "Allow authenticated users to view room memberships" ON public.room_members
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow users to join rooms" ON public.room_members
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow members to update memberships" ON public.room_members
    FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Removal votes policies
CREATE POLICY "Allow members to view votes" ON public.room_removal_votes
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow members to cast votes" ON public.room_removal_votes
    FOR INSERT WITH CHECK (auth.uid() = voter_id);

-- Messages policies
CREATE POLICY "Allow active members to read messages" ON public.messages
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.room_members
            WHERE room_members.room_id = messages.room_id 
              AND room_members.profile_id = auth.uid() 
              AND room_members.status = 'active'
        )
    );

CREATE POLICY "Allow active members to send messages" ON public.messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM public.room_members
            WHERE room_members.room_id = messages.room_id 
              AND room_members.profile_id = auth.uid() 
              AND room_members.status = 'active'
        )
    );

-- Create automatic removal trigger function when a vote is cast
CREATE OR REPLACE FUNCTION public.check_removal_threshold()
RETURNS TRIGGER AS $$
DECLARE
    active_members_count INT;
    votes_count INT;
BEGIN
    -- Get the total number of active members in the room
    SELECT COUNT(*) INTO active_members_count
    FROM public.room_members
    WHERE room_id = NEW.room_id AND status = 'active';

    -- Count how many unique active members voted to remove the target
    SELECT COUNT(*) INTO votes_count
    FROM public.room_removal_votes v
    JOIN public.room_members m ON m.room_id = v.room_id AND m.profile_id = v.voter_id
    WHERE v.room_id = NEW.room_id AND v.target_id = NEW.target_id AND m.status = 'active';

    -- If votes count is strictly a majority (> 50%) of all active members, transition status to 'removed'
    -- Note: This ensures that if there are 3 active members, 2 or more votes are needed.
    IF votes_count > (active_members_count::DECIMAL / 2.0) THEN
        UPDATE public.room_members
        SET status = 'removed'
        WHERE room_id = NEW.room_id AND profile_id = NEW.target_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to run after a vote is inserted
DROP TRIGGER IF EXISTS on_vote_cast ON public.room_removal_votes;
CREATE TRIGGER on_vote_cast
    AFTER INSERT ON public.room_removal_votes
    FOR EACH ROW EXECUTE FUNCTION public.check_removal_threshold();
