import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Rules Reference is read from disk into the system prompt.
  outputFileTracingIncludes: { "/api/chat": ["./data/rules.md"] },
  poweredByHeader: false,
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    },
  ],
};

export default nextConfig;
