'use strict';
var webpack = require('webpack');

module.exports = function(_path) {
  return {
    context: _path,
    devtool: 'source-map',
		entry: {
      app: [_path + '/src/app/index.bootstrap.js', 'webpack-hot-middleware/client?reload=true']
    },
    devServer: {
      contentBase: './dist',
      hot: true,
      inline: true
    },
		output: {
      publicPath: 'http://localhost:3000/'
    },
    plugins: [
      new webpack.HotModuleReplacementPlugin()
    ]
  };
};
