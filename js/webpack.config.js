const path = require('path');

const umdBrowserConfig = {
    mode: 'production',
    entry: './src/index.ts',
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
        filename: 'index.umd.js',
        path: path.resolve(__dirname, 'dist'),
        library: {
            name: 'WebEyeTrack',
            type: 'umd'
        },
        globalObject: 'typeof self !== \'undefined\' ? self : this'
    },
    devtool: 'source-map'
};

module.exports = [umdBrowserConfig];

