import axios, { Axios, AxiosAdapter, InternalAxiosRequestConfig } from "axios";

/**
 * Creates an Axios adapter that adds a delay to every request
 * @param delayMs Delay in milliseconds
 * @param baseAdapter Optional base adapter to use
 * @returns Axios adapter with delay
 */
export function createDelayAdapter(
  delayMs: number = 1000,
  baseAdapter?: AxiosAdapter,
): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => {
    // Wait for the specified delay
    await new Promise(resolve => setTimeout(resolve, delayMs));

    // If no base adapter is provided, use the default axios adapter
    if (!baseAdapter) {
      return axios({ ...config, adapter: undefined });
    }

    // Use the provided base adapter
    return baseAdapter({ ...config, adapter: undefined });
  };
}
