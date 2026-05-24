import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
      // Add your own CDN domains here
    ],
  },
  // Supabase Edge Functions live outside Next.js — no special rewrites needed.
  // The AI chat route proxies to SUPABASE_AI_CHAT_URL when set.
};

export default nextConfig;
