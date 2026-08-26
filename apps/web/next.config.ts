import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * output: 'standalone' — Docker ke liye zaruri setting
   *
   * Ye Next.js ko ek self-contained '.next/standalone' folder banana sikhata hai
   * jisme sirf production ke liye zaruri files hoti hain (node_modules nahi).
   * Isse Docker image ~800MB ki jagah ~200MB ki banti hai!
   *
   * Without this: Docker image mein poora node_modules copy karna padta
   * With this: Sirf traced/required files copy hoti hain
   */
  output: 'standalone',
};

export default nextConfig;
