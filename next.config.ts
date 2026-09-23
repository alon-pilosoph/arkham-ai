import { withAui } from "@assistant-ui/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Rules Reference is read from disk into the system prompt.
  outputFileTracingIncludes: { "/api/chat": ["./data/rules.md"] },
};

export default withAui(nextConfig);
