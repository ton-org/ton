const axios = require("axios");

const wrapFlat =
    (original) =>
    (...args) => {
        const clbk = args[1];
        args[1] = (...args) => {
            const res = clbk(args);
            if (res instanceof Promise) {
                return res.catch((err) => {
                    // axios errors contains node (request + response)
                    // each of them is reqursive as hell
                    // so we need to strip them
                    if (axios.isAxiosError(err)) {
                        err.request = null;
                        err.response = null;
                        throw err;
                    } else throw err;
                });
            }

            return res;
        };

        original(...args);
    };

const recursiveKeys = ["only", "failing", "skip", "concurrent"];
const recusiveKeyError = () => {
    throw new Error("TODO: support recursive keys");
};
const defineRecursiveError = (value) => {
    for (const key of recursiveKeys) {
        Object.defineProperty(value, key, {
            get: recusiveKeyError,
        });
    }
};

const wrap = (original) => {
    const modified = wrapFlat(original);
    Object.assign(modified, original);

    for (const key of recursiveKeys) {
        if (key in modified) {
            const next = wrapFlat(modified[key]);
            Object.assign(next, modified);
            defineRecursiveError(next);

            modified[key] = next;
        }
    }

    return modified;
};
globalThis.test = wrap(test);
globalThis.it = wrap(it);
