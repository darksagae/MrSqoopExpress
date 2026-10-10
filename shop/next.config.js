/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Kokoro voice (/api/assist/tts) loads native ONNX code at runtime, so it
  // is not bundled. Its GPU and other-platform binaries are left out: they are
  // most of the package and would push the function past Vercel's size limit.
  serverExternalPackages: ['kokoro-js', '@huggingface/transformers', 'onnxruntime-node'],
  // The ONNX binding loads libonnxruntime.so at runtime; file tracing can't see
  // that, so ship it explicitly.
  outputFileTracingIncludes: {
    '/api/assist/tts': [
      './node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime.so.1',
      './node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime.so.1.21.0',
      './node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_shared.so',
    ],
  },
  outputFileTracingExcludes: {
    '/api/assist/tts': [
      '**/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_cuda.so',
      '**/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_tensorrt.so',
      '**/onnxruntime-node/bin/napi-v3/linux/arm64/**',
      '**/onnxruntime-node/bin/napi-v3/darwin/**',
      '**/onnxruntime-node/bin/napi-v3/win32/**',
    ],
  },
  async redirects() {
    return [{ source: '/aliexpress-uganda', destination: '/international-shopping-uganda', permanent: true }];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.aliexpress.com',
      },
      {
        protocol: 'https',
        hostname: '**.alicdn.com',
      },
    ],
  },
};

module.exports = nextConfig;
