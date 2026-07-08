-- Create trigger function to handle profile creation when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, stellar_address, display_name)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'stellar_address', new.email),
        COALESCE(
            new.raw_user_meta_data->>'display_name', 
            'Anon-' || substring(COALESCE(new.raw_user_meta_data->>'stellar_address', new.email) from 1 for 6)
        )
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the function to the auth.users table via an AFTER INSERT trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
