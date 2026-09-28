// Retry read-only source requests, including a timeout while reading the body.
export function createCarFetcher({ fetchImpl = fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), attempts = 3, timeoutMs = 30000 } = {}) {
  return async function fetchCarSource(url, options = {}) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok) {
          const error = new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
          error.permanent = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
          await response.body?.cancel();
          throw error;
        }
        const body = await response.text();
        return new Response(body, { status: response.status, headers: response.headers });
      } catch (error) {
        if (error.permanent || attempt === attempts) throw error;
        console.warn(`${new URL(url).hostname}: 재시도 ${attempt + 1}/${attempts} (${error.message})`);
        await wait(2000 * attempt);
      }
    }
  };
}

export const fetchCarSource = createCarFetcher();
