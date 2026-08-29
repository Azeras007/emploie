import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "mammoth", "bcryptjs"],
};

export default nextConfig;
