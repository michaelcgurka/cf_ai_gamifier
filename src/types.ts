/**
 * Type definitions for the LLM chat application.
 */

export interface Env {
	/**
	 * Binding for the Workers AI API.
	 */
	AI: Ai;

	/**
	 * Binding for static assets.
	 */
	ASSETS: { fetch: (request: Request) => Promise<Response> };

	/**
	 * Binding for KV namespace (session storage).
	 */
	SESSIONS_KV: KVNamespace;
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

/**
 * Represents a text chunk with its embedding for RAG.
 */
export interface Chunk {
	text: string;
	embedding: number[];
}

/**
 * Session data stored in KV for game generation.
 */
export interface SessionData {
	chunks: Chunk[];
	createdAt: number;
	originalFileName?: string;
}

/**
 * Supported game types.
 */
export type GameType = "quiz" | "simulation" | "puzzle";

/**
 * Request body for session initialization.
 */
export interface SessionInitRequest {
	text: string;
	fileName?: string;
}

/**
 * Response for session initialization.
 */
export interface SessionInitResponse {
	sessionId: string;
	chunkCount: number;
}

/**
 * Request body for game generation.
 */
export interface GameGenerateRequest {
	gameType: GameType;
	instructions?: string;
}
