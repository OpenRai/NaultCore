const path = require('path');
const webpack = require('webpack');

module.exports = {
  resolve: {
    extensionAlias: {
      ".js": [".ts", ".js"],
      ".mjs": [".mts", ".mjs"]
    },
    fallback: {
      "buffer": require.resolve("buffer/"),
      "stream": require.resolve("stream-browserify"),
      "crypto": false
    },
    alias: {
      "node:stream": require.resolve("stream-browserify"),
      "@nanonyms/protocol": path.resolve(__dirname, "packages/protocol/src/index.ts"),
      "@nanonyms/crypto": path.resolve(__dirname, "packages/crypto/src/index.ts"),
      "@nanonyms/core": path.resolve(__dirname, "packages/core/src/index.ts"),
    }
  },
  plugins: [
    new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
      resource.request = resource.request.replace(/^node:/, '');
    }),
  ]
};
