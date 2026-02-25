const path = require('path');

/**
 * We export an array of two configurations:
 * 1. `extensionConfig` targets Node and produces `dist/extension.js` for the
 *    VS Code host.
 * 2. `webviewConfig` targets web and bundles the React/Three.js SPA sitting in
 *    `frontend/src` into `dist/webview/bundle.js` which is later injected into
 *    the panel HTML.
 */

const extensionConfig = {
  target: 'node',
  mode: 'development',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode',
    serialport: 'commonjs serialport' // native module, don't bundle
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true
            }
          }
        ]
      }
    ]
  },
  optimization: {
    minimize: false
  }
};

const webviewConfig = {
  target: 'web',
  mode: 'development',
  entry: './frontend/src/main.jsx',
  output: {
    path: path.resolve(__dirname, 'dist', 'webview'),
    filename: 'bundle.js',
    publicPath: ''
  },
  devtool: 'source-map',
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    // permit imports without explicit extensions (frontend code uses this)
    fullySpecified: false
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              '@babel/preset-react'
            ]
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  }
};

module.exports = [extensionConfig, webviewConfig];