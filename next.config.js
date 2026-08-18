/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // firebase-admin must NOT be bundled by webpack. It resolves some of
    // its transitive deps (grpc, protobufjs, the credential providers)
    // with dynamic requires that the bundler cannot statically follow,
    // so a bundled copy loads locally and then throws at module-eval
    // time inside a Vercel serverless function — surfacing as a generic
    // 500 HTML page before any of the route's own error handling runs.
    // Listing it here leaves it as a plain runtime require from
    // node_modules. Server-only; nothing about this reaches the client.
    serverComponentsExternalPackages: ["firebase-admin"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
  },
};

module.exports = nextConfig;
