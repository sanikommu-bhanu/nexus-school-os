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
    //
    // jwks-rsa and jose must also be externalised: jwks-rsa is CJS and
    // jose v6 is ESM-only. When the bundler inlines them both, the
    // CJS require('jose') call fails at runtime with "require() of
    // ES Module ... not supported". Keeping them unbundled lets Node's
    // own module resolver handle the CJS→ESM interop correctly.
    serverComponentsExternalPackages: ["firebase-admin", "jwks-rsa", "jose"],
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
