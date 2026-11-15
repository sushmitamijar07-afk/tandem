import type { NextConfig } from "next";

const stub = "./lib/stubs/empty-module.js";

const nextConfig: NextConfig = {
  // Mezo Passport ships untranspiled ESM builds.
  transpilePackages: ["@mezo-org/passport", "@mezo-org/orangekit", "@mezo-org/orangekit-smart-account", "@mezo-org/orangekit-contracts"],
  turbopack: {
    // @coinbase/cdp-sdk (via wagmi connectors) lazily imports x402 packages this app never uses.
    resolveAlias: {
      "@x402/core/client": stub,
      "@x402/evm": stub,
      "@x402/evm/exact/client": stub,
      "@x402/evm/upto/client": stub,
      "@x402/svm/exact/client": stub,
    },
  },
};

export default nextConfig;
