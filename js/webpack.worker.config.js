const path = require('path');

const workerConfig = {
    mode: 'production',
    entry: './src/WebEyeTrackWorker.ts',
    target: 'webworker',
    resolve: {
        extensions: [".ts", ".js"],
        fallback: {
            "os": false
        }
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: 'ts-loader',
                options: {
                    configFile: 'tsconfig.json'
                }
            },
        ],
    },
    output: {
        filename: 'webeyetrack.worker.js',
        path: path.resolve(__dirname, 'dist'),
        globalObject: 'self'
    },
    devtool: 'source-map',
    optimization: {
        minimize: true
    }
};

module.exports = workerConfig;
