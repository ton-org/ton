import { isAxiosError } from "axios";

const wrapFlat =
    (original: FlatClbk): FlatClbk =>
    (...args) => {
        const clbk = args[1];
        args[1] = (...args) => {
            const res = clbk(args);
            if (res instanceof Promise) {
                return res.catch((err) => {
                    // axios errors contains node (request + response)
                    // each of them is reqursive as hell
                    // so we need to strip them
                    if (isAxiosError(err)) {
                        err.request = null;
                        err.response = undefined;
                        throw err;
                    } else throw err;
                });
            }

            return res;
        };

        return original(...args);
    };

const recursiveKeys = ["only", "failing", "skip", "concurrent"] as const;
const recusiveKeyError = () => {
    throw new Error("TODO: support recursive keys");
};
const defineRecursiveError = (value: TestFn) => {
    for (const key of recursiveKeys) {
        Object.defineProperty(value, key, {
            get: recusiveKeyError,
        });
    }
};

type FlatClbk = {
    (
        name: unknown,
        clbk: (...args: unknown[]) => unknown,
        ...args: unknown[]
    ): unknown;
};

type TestFn = FlatClbk & {
    skip: TestFn;
    only: TestFn;
    failing: TestFn;
    concurrent: TestFn;
};

const wrap = (original: TestFn): TestFn => {
    const modified = wrapFlat(original) as TestFn;
    Object.assign(modified, original);

    for (const key of recursiveKeys) {
        if (key in modified) {
            const next = wrapFlat(modified[key]) as TestFn;
            Object.assign(next, modified);
            defineRecursiveError(next);

            modified[key] = next;
        }
    }

    return modified;
};
(globalThis.test as TestFn) = wrap(test as TestFn);
(globalThis.it as TestFn) = wrap(it as TestFn);
