const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');

// Block the RN debugger frontend — it uses import.meta which Metro web can't handle
config.resolver.blockList = [
  /node_modules\/@react-native\/debugger-frontend\/.*/,
];

module.exports = config;
