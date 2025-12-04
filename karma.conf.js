module.exports = function (config) {
    config.set({
        plugins: ["karma-webpack", "karma-jasmine", "karma-chrome-launcher"],

        webpack: {
            resolve: {
                fallback: { crypto: false },
                extensions: [".js", ".ts", ".json"],
            },
            module: {
                rules: [
                    {
                        test: /\.ts$/,
                        use: "ts-loader",
                    },
                ],
            },
            // Your webpack config here
        },

        // base path that will be used to resolve all patterns (eg. files, exclude)
        basePath: "",

        // frameworks to use
        // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
        frameworks: ["jasmine"],

        // list of files / patterns to load in the browser
        // Here I'm including all of the the Jest tests which are all under the __tests__ directory.
        // You may need to tweak this patter to find your test files/
        files: ["./karma.setup.js", "src/**/*.ts"],

        browsers: ["ChromeHeadless"],

        // preprocess matching files before serving them to the browser
        // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
        preprocessors: {
            "./karma.setup.js": ["webpack"],
            "src/**/*.ts": ["webpack"],
        },
    });
};
