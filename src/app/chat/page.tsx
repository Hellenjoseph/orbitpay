'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  deriveMasterKey,
  generateRoomKey,
  encryptRoomKey,
  decryptRoomKey,
  encryptMessage,
  decryptMessage,
} from '@/lib/encryption';
import {
  LogOut,
  Plus,
  Send,
  Users,
  MoreVertical,
  ShieldAlert,
  Hash,
  Copy,
  Lock,
  UserCheck,
  CheckCircle,
  Vote,
  X,
  Activity,
} from 'lucide-react';

interface Room {
  id: string;
  name: string;
  created_by?: string;
  created_at?: string;
}

interface RoomMember {
  profile_id: string;
  status: 'active' | 'removed';
  joined_at?: string;
  encrypted_room_key?: string;
  profiles?: {
    stellar_address: string;
    display_name: string;
  };
  // Flat properties for mock mode
  stellar_address?: string;
  display_name?: string;
}

interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  encrypted_text: string;
  created_at: string;
  decryptedText?: string;
  profiles?: {
    display_name: string;
    stellar_address: string;
  };
  // Flat properties for mock mode
  sender_name?: string;
  sender_address?: string;
}

export default function ChatPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [pubKey, setPubKey] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [offlineMode, setOfflineMode] = useState(true);

  // Rooms and Messages State
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  
  // Dialogs and Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [removalVotes, setRemovalVotes] = useState<Record<string, number>>({}); // target_id -> count
  const [userVotedTargets, setUserVotedTargets] = useState<string[]>([]); // list of target_ids current user voted for

  // Master Key & Room Keys cache
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [roomKeys, setRoomKeys] = useState<Record<string, Uint8Array>>({}); // room_id -> AES raw key

  // UX refs
  const messageEndRef = useRef<HTMLDivElement>(null);
  const subscriptionRef = useRef<any>(null);

  // Authenticate user on load
  useEffect(() => {
    async function initAuth() {
      const storedSession = localStorage.getItem('stellar_whisper_session');
      const storedPubKey = localStorage.getItem('stellar_whisper_pubkey');
      const signature = localStorage.getItem('stellar_whisper_signature') || storedPubKey || 'fallback-seed';

      if (!storedSession || !storedPubKey) {
        router.push('/');
        return;
      }

      setPubKey(storedPubKey);
      setSession(JSON.parse(storedSession));

      // Derive Master Key client-side using wallet signature
      try {
        const key = await deriveMasterKey(signature);
        setMasterKey(key);
      } catch (err) {
        console.error('Failed to derive master key:', err);
      }

      const configured = isSupabaseConfigured();
      setOfflineMode(!configured);
      setLoading(false);
    }
    initAuth();
  }, [router]);

  // Load Rooms once authenticated
  useEffect(() => {
    if (loading) return;
    fetchRooms();
  }, [loading, offlineMode]);

  // Load Messages & Members when active room changes
  useEffect(() => {
    if (!activeRoom) {
      setMessages([]);
      return;
    }
    fetchMessagesAndMembers();
    
    // Subscribe to real-time events if online
    if (!offlineMode) {
      subscribeToRoomMessages(activeRoom.id);
    } else {
      // Mock polling for offline development simulation
      const interval = setInterval(() => {
        pollMockMessages();
      }, 3000);
      return () => clearInterval(interval);
    }

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [activeRoom, masterKey, offlineMode]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch Rooms
  const fetchRooms = async () => {
    if (offlineMode) {
      const mockRooms = getLocalStorage('mock_rooms', [
        { id: 'room-1', name: '🌌 Alpha Strangers', created_at: new Date().toISOString() },
        { id: 'room-2', name: '🔐 Crypto Cyphers', created_at: new Date().toISOString() },
      ]);
      setRooms(mockRooms);
      // Auto-select first room
      if (mockRooms.length > 0 && !activeRoom) {
        setActiveRoom(mockRooms[0]);
      }
      return;
    }

    try {
      const { data, error } = await supabase.from('rooms').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setRooms(data || []);
      if (data && data.length > 0 && !activeRoom) {
        setActiveRoom(data[0]);
      }
    } catch (err) {
      console.error('Error fetching rooms:', err);
    }
  };

  // Fetch Messages, decrypt them, and load Room Members
  const fetchMessagesAndMembers = async () => {
    if (!activeRoom) return;

    if (offlineMode) {
      // Load mock messages
      const allMockMessages = getLocalStorage('mock_messages', getInitialMockMessages());
      const filtered = allMockMessages.filter((m: any) => m.room_id === activeRoom.id);
      
      // Decrypt messages locally if room key exists
      let rKey = roomKeys[activeRoom.id];
      if (!rKey) {
        // Mock derive room key
        rKey = new TextEncoder().encode(`room-key-placeholder-for-${activeRoom.id}`);
        setRoomKeys(prev => ({ ...prev, [activeRoom.id]: rKey }));
      }

      const decrypted = await Promise.all(
        filtered.map(async (m: any) => {
          let text = m.encrypted_text;
          if (m.isEncrypted !== false) {
            text = await decryptMessage(m.encrypted_text, rKey);
          }
          return { ...m, decryptedText: text };
        })
      );
      setMessages(decrypted);

      // Load mock members
      const allMockMembers = getLocalStorage('mock_members', getInitialMockMembers());
      const members = allMockMembers.filter((m: any) => m.room_id === activeRoom.id);
      setRoomMembers(members);

      // Load mock votes
      const allMockVotes = getLocalStorage('mock_votes', []);
      const activeVotes = allMockVotes.filter((v: any) => v.room_id === activeRoom.id);
      
      // Calculate vote counts
      const counts: Record<string, number> = {};
      activeVotes.forEach((v: any) => {
        counts[v.target_id] = (counts[v.target_id] || 0) + 1;
      });
      setRemovalVotes(counts);

      // Identify target IDs the current user voted for
      const myUser = session?.user?.id || 'current-user-id';
      const myVoted = activeVotes.filter((v: any) => v.voter_id === myUser).map((v: any) => v.target_id);
      setUserVotedTargets(myVoted);

      return;
    }

    try {
      // 1. Fetch Room Member Data (including encrypted room key)
      const myUser = session.user.id;
      const { data: memberData, error: memError } = await supabase
        .from('room_members')
        .select(`
          *,
          profiles:profile_id (stellar_address, display_name)
        `)
        .eq('room_id', activeRoom.id);

      if (memError) throw memError;

      setRoomMembers(memberData || []);

      // Find current user's membership and decrypt the room key
      const myMembership = memberData?.find((m: any) => m.profile_id === myUser);
      let rKey: Uint8Array | null = roomKeys[activeRoom.id] || null;

      if (myMembership && myMembership.encrypted_room_key && masterKey && !rKey) {
        try {
          rKey = await decryptRoomKey(myMembership.encrypted_room_key, masterKey);
          setRoomKeys(prev => ({ ...prev, [activeRoom.id]: rKey! }));
        } catch (decErr) {
          console.error('Failed to decrypt room key client-side:', decErr);
        }
      }

      // 2. Fetch Messages
      const { data: msgData, error: msgError } = await supabase
        .from('messages')
        .select(`
          *,
          profiles:sender_id (display_name, stellar_address)
        `)
        .eq('room_id', activeRoom.id)
        .order('created_at', { ascending: true });

      if (msgError) throw msgError;

      // Decrypt messages using cached room key
      const decryptedMsgs = await Promise.all(
        (msgData || []).map(async (msg: any) => {
          let text = '🔒 [Encrypted Message]';
          if (rKey) {
            text = await decryptMessage(msg.encrypted_text, rKey);
          }
          return {
            ...msg,
            decryptedText: text,
          };
        })
      );

      setMessages(decryptedMsgs);

      // 3. Fetch votes cast in this room
      const { data: votesData, error: votesError } = await supabase
        .from('room_removal_votes')
        .select('*')
        .eq('room_id', activeRoom.id);

      if (!votesError && votesData) {
        const counts: Record<string, number> = {};
        votesData.forEach((v: any) => {
          counts[v.target_id] = (counts[v.target_id] || 0) + 1;
        });
        setRemovalVotes(counts);

        const myVoted = votesData.filter((v: any) => v.voter_id === myUser).map((v: any) => v.target_id);
        setUserVotedTargets(myVoted);
      }

    } catch (err) {
      console.error('Error fetching chat details:', err);
    }
  };

  // Real-time Supabase message subscription
  const subscribeToRoomMessages = (roomId: string) => {
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
    }

    subscriptionRef.current = supabase
      .channel(`room-messages-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const newMsg = payload.new as any;
          let rKey = roomKeys[roomId];

          // Re-fetch current user membership to get key if we don't have it
          if (!rKey && masterKey) {
            const myUser = session?.user?.id;
            const { data } = await supabase
              .from('room_members')
              .select('encrypted_room_key')
              .eq('room_id', roomId)
              .eq('profile_id', myUser)
              .single();
            if (data?.encrypted_room_key) {
              rKey = await decryptRoomKey(data.encrypted_room_key, masterKey);
              setRoomKeys(prev => ({ ...prev, [roomId]: rKey }));
            }
          }

          // Fetch sender profile details
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('display_name, stellar_address')
            .eq('id', newMsg.sender_id)
            .single();

          const decryptedText = rKey 
            ? await decryptMessage(newMsg.encrypted_text, rKey)
            : '🔒 [Encrypted Message]';

          const formattedMsg: Message = {
            ...newMsg,
            decryptedText,
            profiles: senderProfile || { display_name: 'Anon', stellar_address: '' }
          };

          setMessages((prev) => [...prev, formattedMsg]);
        }
      )
      .subscribe();
  };

  // Poll Mock Messages in Offline mode
  const pollMockMessages = async () => {
    if (!activeRoom) return;
    const allMockMessages = getLocalStorage('mock_messages', getInitialMockMessages());
    const filtered = allMockMessages.filter((m: any) => m.room_id === activeRoom.id);
    
    const rKey = roomKeys[activeRoom.id];
    if (filtered.length !== messages.length) {
      const decrypted = await Promise.all(
        filtered.map(async (m: any) => {
          let text = m.encrypted_text;
          if (m.isEncrypted !== false && rKey) {
            text = await decryptMessage(m.encrypted_text, rKey);
          }
          return { ...m, decryptedText: text };
        })
      );
      setMessages(decrypted);
    }
  };

  // Create Room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim() || !masterKey) return;

    if (offlineMode) {
      const newId = `room-${Date.now()}`;
      const newRoomObj = {
        id: newId,
        name: `🌌 ${newRoomName}`,
        created_at: new Date().toISOString(),
        created_by: 'current-user-id',
      };

      // Generate room key and encrypt it for self
      const rKey = generateRoomKey();
      const encKey = await encryptRoomKey(rKey, masterKey);

      // Save room
      const currentRooms = getLocalStorage('mock_rooms', []);
      setLocalStorage('mock_rooms', [newRoomObj, ...currentRooms]);

      // Save room member representation
      const currentMembers = getLocalStorage('mock_members', getInitialMockMembers());
      const newMember = {
        room_id: newId,
        profile_id: 'current-user-id',
        status: 'active',
        display_name: 'You',
        stellar_address: pubKey,
        encrypted_room_key: encKey,
        joined_at: new Date().toISOString()
      };
      setLocalStorage('mock_members', [...currentMembers, newMember]);

      // Cache raw key
      setRoomKeys(prev => ({ ...prev, [newId]: rKey }));

      setNewRoomName('');
      setShowCreateModal(false);
      fetchRooms();
      setActiveRoom(newRoomObj);
      return;
    }

    try {
      const myUser = session.user.id;

      // 1. Create the Room
      const { data: newRoom, error: roomError } = await supabase
        .from('rooms')
        .insert({
          name: newRoomName,
          created_by: myUser,
        })
        .select()
        .single();

      if (roomError) throw roomError;

      // 2. Generate E2E Room Key and encrypt it with creator's Master Key
      const rKey = generateRoomKey();
      const encryptedRoomKeyBase64 = await encryptRoomKey(rKey, masterKey);

      // Cache raw key
      setRoomKeys(prev => ({ ...prev, [newRoom.id]: rKey }));

      // 3. Insert creator as Room Member
      const { error: memberError } = await supabase
        .from('room_members')
        .insert({
          room_id: newRoom.id,
          profile_id: myUser,
          encrypted_room_key: encryptedRoomKeyBase64,
          status: 'active',
        });

      if (memberError) throw memberError;

      setNewRoomName('');
      setShowCreateModal(false);
      await fetchRooms();
      setActiveRoom(newRoom);
    } catch (err) {
      console.error('Error creating room:', err);
    }
  };

  // Send Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !activeRoom) return;

    // Check if the current user is active in the room
    const myId = offlineMode ? 'current-user-id' : session.user.id;
    const myMemberData = roomMembers.find(m => m.profile_id === myId);
    
    if (myMemberData && myMemberData.status === 'removed') {
      alert('❌ You have been removed from this room by democratic vote and can no longer send messages.');
      setNewMessageText('');
      return;
    }

    const currentText = newMessageText;
    setNewMessageText('');

    let rKey = roomKeys[activeRoom.id];
    if (!rKey && masterKey) {
      // Attempt to retrieve and decrypt key
      const myMembership = roomMembers.find((m: any) => m.profile_id === myId);
      if (myMembership?.encrypted_room_key) {
        rKey = await decryptRoomKey(myMembership.encrypted_room_key, masterKey);
        setRoomKeys(prev => ({ ...prev, [activeRoom.id]: rKey }));
      }
    }

    if (!rKey) {
      alert('Key mismatch: Encrypted room key could not be recovered.');
      return;
    }

    // Encrypt message text client-side
    const encryptedText = await encryptMessage(currentText, rKey);

    if (offlineMode) {
      const newMsgObj = {
        id: `msg-${Date.now()}`,
        room_id: activeRoom.id,
        sender_id: 'current-user-id',
        encrypted_text: encryptedText,
        created_at: new Date().toISOString(),
        sender_name: 'You',
        sender_address: pubKey,
      };

      const allMockMessages = getLocalStorage('mock_messages', getInitialMockMessages());
      setLocalStorage('mock_messages', [...allMockMessages, newMsgObj]);
      pollMockMessages();
      return;
    }

    try {
      const { error } = await supabase.from('messages').insert({
        room_id: activeRoom.id,
        sender_id: myId,
        encrypted_text: encryptedText,
      });
      if (error) throw error;
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  // Vote to remove a member
  const handleVoteRemove = async (targetId: string) => {
    if (!activeRoom) return;

    const myId = offlineMode ? 'current-user-id' : session.user.id;

    if (offlineMode) {
      // Record vote in localStorage
      const allMockVotes = getLocalStorage('mock_votes', []);
      
      // Check duplicate
      const alreadyVoted = allMockVotes.some(
        (v: any) => v.room_id === activeRoom.id && v.voter_id === myId && v.target_id === targetId
      );

      if (alreadyVoted) {
        alert('You have already cast a vote to remove this member.');
        return;
      }

      const newVote = {
        room_id: activeRoom.id,
        voter_id: myId,
        target_id: targetId,
        created_at: new Date().toISOString(),
      };

      const updatedVotes = [...allMockVotes, newVote];
      setLocalStorage('mock_votes', updatedVotes);

      // Re-trigger calculations
      const roomVotes = updatedVotes.filter((v: any) => v.room_id === activeRoom.id);
      const counts: Record<string, number> = {};
      roomVotes.forEach((v: any) => {
        counts[v.target_id] = (counts[v.target_id] || 0) + 1;
      });
      setRemovalVotes(counts);
      setUserVotedTargets(prev => [...prev, targetId]);

      // Calculate if threshold met (>50% of active members)
      const allMockMembers = getLocalStorage('mock_members', getInitialMockMembers());
      const roomMems = allMockMembers.filter((m: any) => m.room_id === activeRoom.id && m.status === 'active');
      const targetVotes = counts[targetId] || 0;

      if (targetVotes > (roomMems.length / 2)) {
        // Change status to removed
        const updatedMems = allMockMembers.map((m: any) => {
          if (m.room_id === activeRoom.id && m.profile_id === targetId) {
            return { ...m, status: 'removed' };
          }
          return m;
        });
        setLocalStorage('mock_members', updatedMems);
        alert('🗳️ Democratic threshold met! User expelled from room.');
        fetchMessagesAndMembers();
      }

      return;
    }

    try {
      const res = await fetch('/api/vote-remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          roomId: activeRoom.id,
          targetId: targetId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to submit vote');
      }

      const data = await res.json();
      if (data.removed) {
        alert('🗳️ Consensus reached! Target member has been removed.');
      } else {
        alert('Vote registered. Awaiting majority consensus.');
      }

      // Re-fetch chat data
      fetchMessagesAndMembers();
    } catch (err: any) {
      console.error(err);
      alert(`Error casting vote: ${err.message}`);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('stellar_whisper_session');
    localStorage.removeItem('stellar_whisper_pubkey');
    localStorage.removeItem('stellar_whisper_signature');
    router.push('/');
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(pubKey);
    alert('Public key copied to clipboard!');
  };

  const truncateAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  // Helper local storage wrappers
  const getLocalStorage = (key: string, fallback: any) => {
    if (typeof window === 'undefined') return fallback;
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  };

  const setLocalStorage = (key: string, value: any) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  };

  if (loading) {
    return (
      <div className="flex-grow flex flex-col justify-center items-center bg-black text-white h-screen">
        <Activity className="w-8 h-8 animate-spin text-purple-500 mb-4" />
        <span className="text-sm font-mono tracking-widest text-purple-400">LOADING WHISPER LAYER...</span>
      </div>
    );
  }

  // Get current user status in room
  const currentUserMemberObj = roomMembers.find(
    m => m.profile_id === (offlineMode ? 'current-user-id' : session?.user?.id)
  );
  const isExpelled = currentUserMemberObj ? currentUserMemberObj.status === 'removed' : false;

  return (
    <div className="flex-grow flex h-screen bg-[#06040c] overflow-hidden text-white relative">
      {/* Glow effect */}
      <div className="glow-circle bg-purple-900/10 w-96 h-96 -top-20 -left-20" />
      <div className="glow-circle bg-indigo-900/10 w-[500px] h-[500px] -bottom-40 -right-40" />

      {/* Sidebar */}
      <aside className="w-80 border-r border-white/5 flex flex-col justify-between bg-black/40 backdrop-blur-xl relative z-10">
        <div>
          {/* Logo & Status */}
          <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <span className="font-extrabold text-lg tracking-wider text-stellar-glow">
              STELLARWHISPER 🌌
            </span>
            {offlineMode ? (
              <span className="text-[10px] bg-yellow-950/60 border border-yellow-800/40 text-yellow-400 px-2 py-0.5 rounded font-mono">
                OFFLINE MODE
              </span>
            ) : (
              <span className="text-[10px] bg-green-950/60 border border-green-800/40 text-green-400 px-2 py-0.5 rounded font-mono">
                SECURE Web3
              </span>
            )}
          </div>

          {/* User Address display */}
          <div className="p-4 mx-4 my-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-stellar-light to-indigo-600 flex items-center justify-center font-bold text-sm text-white">
                W
              </div>
              <div className="text-left">
                <span className="block text-xs font-semibold text-gray-200">Wallet Connected</span>
                <span className="block text-[11px] text-gray-500 font-mono">
                  {truncateAddress(pubKey)}
                </span>
              </div>
            </div>
            <div className="flex space-x-1">
              <button 
                onClick={copyAddress}
                className="p-1.5 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                title="Copy Address"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button 
                onClick={handleSignOut}
                className="p-1.5 hover:bg-white/5 rounded text-red-400 hover:text-red-300 transition-colors"
                title="Disconnect"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Rooms Header */}
          <div className="px-6 py-2 flex justify-between items-center text-xs font-bold text-gray-400 tracking-wider uppercase">
            <span>Anonymous Rooms</span>
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-1 bg-white/5 hover:bg-purple-900/40 border border-white/10 rounded-md text-white hover:text-purple-300 transition-all"
              title="Create Room"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Rooms list */}
          <nav className="px-3 py-4 space-y-1 overflow-y-auto max-h-[calc(100vh-270px)]">
            {rooms.length === 0 ? (
              <div className="text-center py-8 text-gray-600 text-xs font-mono">
                No active rooms. Create one above!
              </div>
            ) : (
              rooms.map((room) => {
                const isActive = activeRoom?.id === room.id;
                return (
                  <button
                    key={room.id}
                    onClick={() => setActiveRoom(room)}
                    className={`w-full px-4 py-3 rounded-xl flex items-center justify-between text-left transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-purple-950/40 to-indigo-950/40 border border-purple-800/30 text-white font-medium shadow-md'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <Hash className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-purple-400' : 'text-gray-500'}`} />
                      <span className="truncate text-sm">{room.name}</span>
                    </div>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-sm" />
                  </button>
                );
              })
            )}
          </nav>
        </div>
      </aside>

      {/* Main Chat Workspace */}
      <section className="flex-grow flex flex-col justify-between bg-black/20 backdrop-blur-lg relative z-10">
        {activeRoom ? (
          <>
            {/* Room Header */}
            <header className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-black/40 backdrop-blur-md">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-purple-950/60 border border-purple-800/40 flex items-center justify-center">
                  <Hash className="w-5 h-5 text-purple-400" />
                </div>
                <div className="text-left">
                  <span className="block font-bold text-white text-base">{activeRoom.name}</span>
                  <span className="block text-xs text-gray-500 flex items-center">
                    <Lock className="w-3 h-3 mr-1 text-green-500" />
                    Zero-Knowledge E2E Encrypted
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowMembersModal(true)}
                  className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                >
                  <Users className="w-4 h-4 text-purple-400" />
                  <span>Room Members</span>
                </button>
              </div>
            </header>

            {/* Expelled Alert */}
            {isExpelled && (
              <div className="mx-6 mt-4 p-4 rounded-2xl bg-red-950/40 border border-red-800/40 text-red-300 text-sm flex items-start space-x-3">
                <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="block font-bold">You have been expelled from this room</span>
                  <span className="block text-xs text-red-400">
                    A democratic majority of active participants voted to remove your public address. You can no longer send or decrypt messages in this chat.
                  </span>
                </div>
              </div>
            )}

            {/* Message Feed */}
            <div className="flex-grow p-6 overflow-y-auto space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col justify-center items-center text-center text-gray-500 font-mono text-xs">
                  <Lock className="w-8 h-8 text-purple-800/50 mb-3 animate-pulse" />
                  <span>This is the start of the anonymous communication ledger.</span>
                  <span>All payloads are encrypted with AES-GCM client-side.</span>
                </div>
              ) : (
                messages.map((msg) => {
                  const myId = offlineMode ? 'current-user-id' : session?.user?.id;
                  const isMe = msg.sender_id === myId;
                  const senderName = msg.profiles?.display_name || msg.sender_name || 'Anon';
                  const senderAddress = msg.profiles?.stellar_address || msg.sender_address || '';
                  
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[70%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-xs text-gray-400 font-semibold">{senderName}</span>
                        {senderAddress && (
                          <span className="text-[9px] text-gray-600 font-mono">({truncateAddress(senderAddress)})</span>
                        )}
                      </div>
                      <div
                        className={`px-4 py-3 rounded-2xl text-sm leading-relaxed border transition-all ${
                          isMe
                            ? 'bg-gradient-to-br from-stellar-light to-indigo-700 text-white border-purple-600/20 rounded-tr-none'
                            : 'bg-white/5 text-gray-200 border-white/5 rounded-tl-none'
                        }`}
                      >
                        {isExpelled && !isMe ? '🔒 [Payload Redacted]' : msg.decryptedText || '🔒 [Ciphertext Decryption Failed]'}
                      </div>
                      <span className="text-[9px] text-gray-600 mt-1 font-mono">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messageEndRef} />
            </div>

            {/* Input Panel */}
            <div className="p-6 border-t border-white/5 bg-black/40">
              <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
                <input
                  type="text"
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  disabled={isExpelled}
                  placeholder={
                    isExpelled
                      ? 'You have been expelled and cannot chat...'
                      : 'Type an end-to-end encrypted whisper...'
                  }
                  className="flex-grow bg-white/5 border border-white/5 focus:border-purple-500 focus:outline-none rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isExpelled || !newMessageText.trim()}
                  className="p-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-lg hover:shadow-purple-500/20 disabled:opacity-50 transition-all transform active:scale-95"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-grow flex flex-col justify-center items-center text-center text-gray-500">
            <Lock className="w-12 h-12 text-purple-800/30 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No Active Room selected</h3>
            <p className="text-sm text-gray-400 max-w-sm">
              Please choose a chat room in the sidebar or create a new one to initialize cryptography handshakes.
            </p>
          </div>
        )}
      </section>

      {/* CREATE ROOM MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="glass-panel p-8 rounded-3xl max-w-md w-full border border-white/10 relative">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-mono"
            >
              &times;
            </button>
            <h3 className="text-xl font-bold text-white mb-2 flex items-center">
              <Plus className="w-5 h-5 mr-2 text-purple-400" />
              Create Anonymous Room
            </h3>
            <p className="text-gray-400 text-xs mb-6">
              Creating a room generates a local AES key. Your public key is registered as the key holder.
            </p>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Room Name
                </label>
                <input
                  type="text"
                  required
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. Stellar Hackers"
                  className="w-full bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 transition-colors"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-stellar-light to-indigo-600 hover:from-purple-600 hover:to-indigo-500 text-white rounded-xl font-bold text-sm transition-all"
              >
                Initialize Cryptography
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MEMBERS & VOTING MODAL */}
      {showMembersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="glass-panel p-8 rounded-3xl max-w-2xl w-full border border-white/10 relative">
            <button
              onClick={() => setShowMembersModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-mono"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-xl font-bold text-white mb-2 flex items-center">
              <Users className="w-5 h-5 mr-2 text-purple-400" />
              Room Members & Voting
            </h3>
            <p className="text-gray-400 text-xs mb-6">
              StellarWhisper supports decentralized moderation. Members can vote to expel any address. A democratic majority of active participants triggers an automatic database-level access key revocation.
            </p>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
              {roomMembers.length === 0 ? (
                <div className="text-center py-8 text-gray-500 font-mono text-xs">
                  No members yet, or you need to sign in.
                </div>
              ) : (
                roomMembers.map((member) => {
                  const mId = member.profile_id;
                  const currentUserId = offlineMode ? 'current-user-id' : session?.user?.id;
                  const isCurrent = mId === currentUserId;
                  
                  const address = member.profiles?.stellar_address || member.stellar_address || '';
                  const name = member.profiles?.display_name || member.display_name || 'Anon';
                  
                  const votesCount = removalVotes[mId] || 0;
                  const alreadyVoted = userVotedTargets.includes(mId);
                  
                  // Calculate active count
                  const activeMembersCount = roomMembers.filter(m => m.status === 'active').length;
                  const threshold = Math.floor(activeMembersCount / 2) + 1;

                  return (
                    <div
                      key={mId}
                      className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
                        member.status === 'removed'
                          ? 'bg-red-950/20 border-red-900/30 opacity-60'
                          : 'bg-white/5 border-white/5'
                      }`}
                    >
                      <div className="text-left">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-sm text-white">
                            {name} {isCurrent && <span className="text-xs text-purple-400 font-mono">(You)</span>}
                          </span>
                          {member.status === 'removed' ? (
                            <span className="text-[9px] bg-red-900/40 border border-red-800/40 text-red-300 px-2 py-0.5 rounded uppercase font-mono">
                              Expelled
                            </span>
                          ) : (
                            <span className="text-[9px] bg-green-900/40 border border-green-800/40 text-green-300 px-2 py-0.5 rounded uppercase font-mono">
                              Active
                            </span>
                          )}
                        </div>
                        <span className="block text-xs text-gray-500 font-mono mt-0.5">
                          {address}
                        </span>
                      </div>

                      {member.status !== 'removed' && !isCurrent && (
                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <span className="block text-xs text-gray-400 font-semibold">
                              {votesCount} / {threshold} Votes
                            </span>
                            <span className="block text-[10px] text-gray-500 font-mono">
                              needed to expel
                            </span>
                          </div>

                          <button
                            onClick={() => handleVoteRemove(mId)}
                            disabled={alreadyVoted}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all ${
                              alreadyVoted
                                ? 'bg-purple-950/30 text-purple-400 border border-purple-900/30 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-500 text-white'
                            }`}
                          >
                            <Vote className="w-3.5 h-3.5" />
                            <span>{alreadyVoted ? 'Voted' : 'Vote Expel'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// MOCK DATA GENERATION FALLBACKS FOR OFFLINE DEVELOPMENT
function getInitialMockMembers() {
  return [
    {
      room_id: 'room-1',
      profile_id: 'voter-1',
      status: 'active',
      display_name: 'StellarCypher',
      stellar_address: 'GD11111111111111111111111111111111111111111111111111111111',
    },
    {
      room_id: 'room-1',
      profile_id: 'voter-2',
      status: 'active',
      display_name: 'DecentraStrider',
      stellar_address: 'GD22222222222222222222222222222222222222222222222222222222',
    },
    {
      room_id: 'room-1',
      profile_id: 'current-user-id',
      status: 'active',
      display_name: 'You',
      stellar_address: 'GDEVELOPERMOCKKEYPAIRADDRESS111112222233333444445555566666',
    },
    {
      room_id: 'room-2',
      profile_id: 'voter-1',
      status: 'active',
      display_name: 'StellarCypher',
      stellar_address: 'GD11111111111111111111111111111111111111111111111111111111',
    },
    {
      room_id: 'room-2',
      profile_id: 'current-user-id',
      status: 'active',
      display_name: 'You',
      stellar_address: 'GDEVELOPERMOCKKEYPAIRADDRESS111112222233333444445555566666',
    },
  ];
}

function getInitialMockMessages() {
  return [
    {
      id: 'm1',
      room_id: 'room-1',
      sender_id: 'voter-1',
      encrypted_text: 'Welcome to StellarWhisper! Everything here is E2E encrypted client-side.',
      isEncrypted: false,
      sender_name: 'StellarCypher',
      sender_address: 'GD11111111111111111111111111111111111111111111111111111111',
      created_at: new Date(Date.now() - 600000).toISOString(),
    },
    {
      id: 'm2',
      room_id: 'room-1',
      sender_id: 'voter-2',
      encrypted_text: 'Awesome, Node 24 is fast! If someone spams, we can vote to remove them.',
      isEncrypted: false,
      sender_name: 'DecentraStrider',
      sender_address: 'GD22222222222222222222222222222222222222222222222222222222',
      created_at: new Date(Date.now() - 300000).toISOString(),
    },
  ];
}
