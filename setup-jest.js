const axios = require("axios");

const wrap =
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
globalThis.test = wrap(test);
globalThis.it = wrap(it);
