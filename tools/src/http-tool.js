// ============================================================================
// ZEN AI SDK — HTTP Tool
// Make HTTP GET/POST requests.
// ============================================================================
/** Maximum response size (512KB). */
const MAX_RESPONSE_SIZE = 512 * 1024;
/** HTTP request tool. */
export const httpTool = {
    name: "http_request",
    description: "Make an HTTP request (GET or POST) to a URL and return the response.",
    parameters: {
        type: "object",
        properties: {
            url: { type: "string", description: "The URL to request" },
            method: {
                type: "string",
                description: "HTTP method: GET or POST (default: GET)",
            },
            body: {
                type: "string",
                description: "Request body for POST requests (JSON string)",
            },
            headers: {
                type: "string",
                description: "JSON string of headers to include",
            },
        },
        required: ["url"],
    },
    async execute(params) {
        try {
            const url = params.url;
            const method = (params.method ?? "GET").toUpperCase();
            const headers = params.headers
                ? JSON.parse(params.headers)
                : {};
            const fetchOptions = {
                method,
                headers: {
                    "User-Agent": "ZEN-AI-SDK/1.0",
                    ...headers,
                },
                signal: AbortSignal.timeout(30_000),
            };
            if (method === "POST" && params.body) {
                fetchOptions.body = params.body;
                if (!headers["Content-Type"]) {
                    fetchOptions.headers["Content-Type"] =
                        "application/json";
                }
            }
            const response = await fetch(url, fetchOptions);
            const text = await response.text();
            // Truncate if too large
            const output = text.length > MAX_RESPONSE_SIZE
                ? text.slice(0, MAX_RESPONSE_SIZE) + "\n[TRUNCATED]"
                : text;
            return {
                success: response.ok,
                output: {
                    status: response.status,
                    statusText: response.statusText,
                    body: output,
                },
                error: response.ok
                    ? undefined
                    : `HTTP ${response.status}: ${response.statusText}`,
            };
        }
        catch (error) {
            return {
                success: false,
                output: null,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
};
//# sourceMappingURL=http-tool.js.map