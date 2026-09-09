/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // sodium-native is a Node.js native addon used optionally by
      // @stellar/stellar-base for signing. The browser build falls back to
      // tweetnacl automatically — we just need to prevent webpack from
      // trying to bundle the native module.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "sodium-native",
      ];
    }
    return config;
  },
};

module.exports = nextConfig;
