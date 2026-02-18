// ============================================================================
// ZEN AI SDK — MockLLMAdapter (Deterministic Testing)
//
// A queue-based LLM adapter that returns pre-defined responses in order.
// Used for E2E integration tests where real API calls are undesirable.
// ============================================================================

import type {
    LLMAdapter,
    ChatMessage,
    ChatResponse,
    LLMToolDefinition,
} from "../../src/types.js";

/** A single queued response for the mock LLM. */
export interface MockResponse {
    /** Response for complete() calls — returns a Delta JSON string. */
    complete?: string;
    /** Response for chat() calls — can include tool calls. */
    chat?: ChatResponse;
}

/**
 * Deterministic LLM adapter for testing.
 * Responses are consumed from a queue in FIFO order.
 * If the queue is exhausted, returns a DONE signal.
 */
export class MockLLMAdapter implements LLMAdapter {
    private completeQueue: string[] = [];
    private chatQueue: ChatResponse[] = [];
    private embedVector: number[];

    /** Track all calls for assertions. */
    public completeCalls: string[] = [];
    public chatCalls: { messages: ChatMessage[]; tools?: LLMToolDefinition[] }[] = [];
    public embedCalls: string[] = [];

    constructor(opts?: {
        completeResponses?: string[];
        chatResponses?: ChatResponse[];
        embedVector?: number[];
    }) {
        this.completeQueue = [...(opts?.completeResponses ?? [])];
        this.chatQueue = [...(opts?.chatResponses ?? [])];
        this.embedVector = opts?.embedVector ?? [0.1, 0.2, 0.3, 0.4, 0.5];
    }

    async complete(prompt: string): Promise<string> {
        this.completeCalls.push(prompt);
        if (this.completeQueue.length > 0) {
            return this.completeQueue.shift()!;
        }
        // Default: task is complete
        return JSON.stringify({
            description: "All tasks completed.",
            progress: 1.0,
            gaps: [],
            isComplete: true,
            sufferingDelta: -0.1,
            egoNoise: 0.0,
        });
    }

    async embed(text: string): Promise<number[]> {
        this.embedCalls.push(text);
        return [...this.embedVector];
    }

    async chat(
        messages: ChatMessage[],
        options?: { tools?: LLMToolDefinition[] },
    ): Promise<ChatResponse> {
        this.chatCalls.push({ messages, tools: options?.tools });
        if (this.chatQueue.length > 0) {
            return this.chatQueue.shift()!;
        }
        // Default: signal DONE
        return { content: "DONE", toolCalls: undefined };
    }

    /** Push additional responses mid-test. */
    addCompleteResponse(response: string): void {
        this.completeQueue.push(response);
    }

    addChatResponse(response: ChatResponse): void {
        this.chatQueue.push(response);
    }

    /** Reset all state for reuse. */
    reset(): void {
        this.completeQueue = [];
        this.chatQueue = [];
        this.completeCalls = [];
        this.chatCalls = [];
        this.embedCalls = [];
    }
}
