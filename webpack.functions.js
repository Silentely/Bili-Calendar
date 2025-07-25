// webpack.functions.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /(node_modules)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: [
              '@babel/plugin-proposal-object-rest-spread',
              '@babel/plugin-transform-runtime'
            ]
          }
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.json']
  }
}; 