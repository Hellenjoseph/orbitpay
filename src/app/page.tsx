'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Keypair } from '@stellar/stellar-sdk';
import { supabase } from '@/lib/supabase';
import confetti from 'canvas-confetti';
import { 
  ShieldAlert, 
  MessageSquareShare, 
  Cpu, 
  KeyRound, 
  Sparkles, 
  Activity, 
  Clock, 
  UserX,
  Vote
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#7f00ff', '#4f46e5', '#a78bfa'],
    });
  };

  /**
   * Handles signing using a dynamically generated developer keypair.
   * This runs the full Ed25519 signature handshake client-side and validates server-side.
   */
  const handleDevAuth = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch challenge nonce from server
      const challengeRes = await fetch('/api/auth/challenge');
      if (!challengeRes.ok) throw new Error('Failed to retrieve authentication challenge');
      const { challenge } = await challengeRes.json();

      // 2. Generate local cryptographic keypair
      const keypair = Keypair.random();
      const publicKey = keypair.publicKey();

      // 3. Sign the challenge text client-side
      const messageBuffer = Buffer.from(challenge, 'utf-8');
      const signatureBase64 = keypair.sign(messageBuffer).toString('base64');

      // 4. Submit signature verification payload to server
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey, signature: signatureBase64 }),
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json();
        throw new Error(errData.error || 'Signature verification failed');
      }

      const { session } = await verifyRes.json();

      // 5. Store session in localStorage/Supabase Client
      if (session && session.access_token) {
        localStorage.setItem('stellar_whisper_session', JSON.stringify(session));
        localStorage.setItem('stellar_whisper_pubkey', publicKey);
        
        // Also sign in Supabase client if configured
        try {
          await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
        } catch (e) {
          console.warn('Supabase offline fallback active');
        }
      }

      triggerConfetti();
      
      // Delay redirect slightly for animation
      setTimeout(() => {
        router.push('/chat');
      }, 1000);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during authentication');
      setLoading(false);
    }
  };

  /**
   * Handles Albedo Web3 Wallet signature
   */
  const handleAlbedoAuth = async () => {
    try {
      setLoading(true);
      setError(null);

      // albedo imports are browser-specific, dynamic import or standard check
      if (typeof window === 'undefined') return;

      const challengeRes = await fetch('/api/auth/challenge');
      if (!challengeRes.ok) throw new Error('Failed to retrieve challenge');
      const { challenge } = await challengeRes.json();

      // Dynamically access albedo or mock if missing
      const albedo = (window as any).albedo;
      if (!albedo) {
        throw new Error('Albedo wallet extension not detected. Please install Albedo or use the Developer Mock option.');
      }

      const signResult = await albedo.sign({
        message: challenge,
      });

      const { pubkey, signature } = signResult;

      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pubkey, signature }),
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json();
        throw new Error(errData.error || 'Verification failed');
      }

      const { session } = await verifyRes.json();

      if (session) {
        localStorage.setItem('stellar_whisper_session', JSON.stringify(session));
        localStorage.setItem('stellar_whisper_pubkey', pubkey);
      }

      triggerConfetti();
      setTimeout(() => {
        router.push('/chat');
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Albedo connection failed');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-hidden">
      {/* Dynamic Glow Circles */}
      <div className="glow-circle bg-purple-900 w-96 h-96 -top-20 -left-20" />
      <div className="glow-circle bg-indigo-900 w-[500px] h-[500px] -bottom-40 -right-40" />

      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex justify-between items-center relative z-20">
        <div className="flex items-center space-x-2">
          <span className="text-2xl font-bold tracking-tight text-white flex items-center">
            StellarWhisper <span className="ml-2 text-sm text-purple-400 font-mono tracking-widest uppercase">🌌</span>
          </span>
        </div>
        <button
          onClick={() => setShowWalletModal(true)}
          className="px-5 py-2.5 bg-gradient-to-r from-stellar-light to-indigo-600 hover:from-purple-600 hover:to-indigo-500 text-white rounded-xl font-medium shadow-lg hover:shadow-purple-500/20 transition-all duration-300 transform hover:-translate-y-0.5"
        >
          Enter Dashboard
        </button>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 pt-12 pb-24 grid md:grid-cols-12 gap-12 items-center relative z-20">
        <div className="md:col-span-7 flex flex-col justify-center space-y-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-purple-950/50 border border-purple-800/40 text-purple-300 text-xs font-semibold w-fit">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Stellar Open Source Initiative app candidate</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight tracking-tight text-white">
            Speak Freely.<br />
            <span className="text-stellar-glow">Stay Fully Anonymous.</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-xl">
            StellarWhisper is a decentralized, privacy-first chat application. Create groups, message securely, and authenticate cryptographically with Web3 wallets — without leaving trace metadata or profiles.
          </p>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
            <div className="p-4 rounded-2xl glass-panel">
              <span className="block text-2xl font-bold text-white">Zero</span>
              <span className="text-xs text-gray-500 uppercase font-medium">Logins / Emails</span>
            </div>
            <div className="p-4 rounded-2xl glass-panel">
              <span className="block text-2xl font-bold text-white">100%</span>
              <span className="text-xs text-gray-500 uppercase font-medium">E2E Encrypted</span>
            </div>
            <div className="p-4 rounded-2xl glass-panel">
              <span className="block text-2xl font-bold text-white">Stellar</span>
              <span className="text-xs text-gray-500 uppercase font-medium">Authentication</span>
            </div>
            <div className="p-4 rounded-2xl glass-panel">
              <span className="block text-2xl font-bold text-white">&lt; 1s</span>
              <span className="text-xs text-gray-500 uppercase font-medium">Latency</span>
            </div>
          </div>
        </div>

        {/* Access Widget */}
        <div className="md:col-span-5">
          <div className="glass-panel p-8 rounded-3xl border border-white/10 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
            <h3 className="text-2xl font-bold text-white mb-2 flex items-center">
              <KeyRound className="w-6 h-6 mr-2 text-purple-400" />
              Web3 Authentication
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              Access the chat ecosystem by signing a secure server challenge nonce with your Stellar address.
            </p>

            {error && (
              <div className="p-3 mb-4 rounded-lg bg-red-950/40 border border-red-800/40 text-red-300 text-xs flex items-start space-x-2">
                <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleDevAuth}
                disabled={loading}
                className="w-full p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-500/30 text-white rounded-2xl font-semibold flex items-center justify-between transition-all duration-300 group"
              >
                <div className="flex items-center text-left">
                  <div className="w-10 h-10 rounded-xl bg-purple-900/40 border border-purple-700/30 flex items-center justify-center mr-3 group-hover:bg-purple-600 transition-colors">
                    <Cpu className="w-5 h-5 text-purple-300 group-hover:text-white" />
                  </div>
                  <div>
                    <span className="block text-sm">Developer Mock Keypair</span>
                    <span className="block text-xs text-purple-400 font-mono">No extensions needed (crypto simulation)</span>
                  </div>
                </div>
                <span className="text-xs bg-purple-900/60 px-2.5 py-1 rounded-md text-purple-300 font-mono">Instant</span>
              </button>

              <button
                onClick={handleAlbedoAuth}
                disabled={loading}
                className="w-full p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/30 text-white rounded-2xl font-semibold flex items-center justify-between transition-all duration-300 group"
              >
                <div className="flex items-center text-left">
                  <div className="w-10 h-10 rounded-xl bg-indigo-900/40 border border-indigo-700/30 flex items-center justify-center mr-3 group-hover:bg-indigo-600 transition-colors">
                    <span className="font-bold text-white text-base">A</span>
                  </div>
                  <div>
                    <span className="block text-sm">Albedo Wallet</span>
                    <span className="block text-xs text-gray-500">Sign-in with Albedo plugin</span>
                  </div>
                </div>
                <span className="text-xs bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800">Web3</span>
              </button>
            </div>

            {loading && (
              <div className="flex items-center justify-center space-x-2 mt-4 text-purple-400 text-sm">
                <Activity className="w-4 h-4 animate-pulse" />
                <span>Running cryptographic handshake...</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="bg-black/40 border-y border-white/5 py-24 relative z-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Privacy Architecture</h2>
            <p className="text-gray-400">
              Built on custom Zero-Knowledge principles, mixing Stellar public key infrastructure with instant database synchronization.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl glass-panel glass-panel-hover transition-all">
              <div className="w-12 h-12 rounded-2xl bg-purple-900/40 border border-purple-800/40 flex items-center justify-center mb-6">
                <UserX className="w-6 h-6 text-purple-400" />
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Zero Tracking</h4>
              <p className="text-gray-400 text-sm leading-relaxed">
                No IP logs, no email databases, no cookie audits. Your presence on the platform is completely defined by your Stellar ledger public keys.
              </p>
            </div>

            <div className="p-8 rounded-3xl glass-panel glass-panel-hover transition-all">
              <div className="w-12 h-12 rounded-2xl bg-indigo-900/40 border border-indigo-800/40 flex items-center justify-center mb-6">
                <KeyRound className="w-6 h-6 text-indigo-400" />
              </div>
              <h4 className="text-xl font-bold text-white mb-2">E2E AES-GCM Encrypted</h4>
              <p className="text-gray-400 text-sm leading-relaxed">
                Rooms use unique room-level symmetric key handshakes. Message contents are encrypted locally inside your browser and can never be read by the database hosts.
              </p>
            </div>

            <div className="p-8 rounded-3xl glass-panel glass-panel-hover transition-all">
              <div className="w-12 h-12 rounded-2xl bg-violet-900/40 border border-violet-800/40 flex items-center justify-center mb-6">
                <Vote className="w-6 h-6 text-violet-400" />
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Democratic Expulsion</h4>
              <p className="text-gray-400 text-sm leading-relaxed">
                Rooms are entirely autonomous. If a participant behaves maliciously, room members can cast signatures to vote-remove them. When a majority votes, their key is revoked.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center text-gray-500 text-xs relative z-20">
        <span>&copy; {new Date().getFullYear()} StellarWhisper. Built with privacy for the Stellar Ecosystem.</span>
        <div className="flex space-x-6 mt-4 md:mt-0">
          <a href="/docs/RUN-VOTE-REMOVE.md" className="hover:text-purple-400 transition-colors">Documentation</a>
          <a href="/CONTRIBUTING.md" className="hover:text-purple-400 transition-colors">Contributing</a>
          <a href="/LICENSE" className="hover:text-purple-400 transition-colors">MIT License</a>
        </div>
      </footer>

      {/* Selection Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="glass-panel p-8 rounded-3xl max-w-md w-full border border-white/10 relative">
            <button 
              onClick={() => setShowWalletModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-mono"
            >
              &times;
            </button>
            <h3 className="text-xl font-bold text-white mb-4">Choose Wallet Provider</h3>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowWalletModal(false);
                  handleDevAuth();
                }}
                className="w-full p-4 bg-white/5 hover:bg-purple-900/20 border border-white/10 hover:border-purple-500 rounded-xl text-left flex items-center transition-all"
              >
                <Cpu className="w-5 h-5 mr-3 text-purple-400" />
                <div>
                  <span className="block text-sm font-semibold text-white">Developer Mock Keypair</span>
                  <span className="block text-xs text-gray-400">Perfect for local testing and reviewers</span>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowWalletModal(false);
                  handleAlbedoAuth();
                }}
                className="w-full p-4 bg-white/5 hover:bg-indigo-900/20 border border-white/10 hover:border-indigo-500 rounded-xl text-left flex items-center transition-all"
              >
                <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center mr-3">
                  <span className="font-bold text-indigo-400 text-xs">A</span>
                </div>
                <div>
                  <span className="block text-sm font-semibold text-white">Albedo Wallet Link</span>
                  <span className="block text-xs text-gray-400">Secure signature using your Stellar account</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
