const merge = require("webpack-merge");
const baseConfig = require("./webpack.base");
const webpack = require("webpack");

const devConfig = merge(baseConfig, {
    mode: "development",
    devtool: "eval-source-map",
    optimization: {
        minimize: true,
    },
    plugins: [
        new webpack.HotModuleReplacementPlugin(),
        new webpack.NamedModulesPlugin(),
        new webpack.NoEmitOnErrorsPlugin(),
    ].concat(baseConfig.plugins),
});

module.exports = devConfig;
