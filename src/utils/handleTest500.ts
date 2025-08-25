import * as dotenv from "dotenv";
dotenv.config();

import { AxiosError } from "axios";

export function handleTest500(err: unknown) {
  if (!process.env.IGNORE_500 || (err as AxiosError)?.response?.status !== 500) {
    throw err;
  }
  console.warn(`AxiosError: ${(err as AxiosError)?.message}`)
}
