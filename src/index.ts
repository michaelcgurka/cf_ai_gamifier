/**
 * LLM Chat Application Template
 *
 * A simple chat application using Cloudflare Workers AI.
 * This template demonstrates how to implement an LLM-powered chat interface with
 * streaming responses using Server-Sent Events (SSE).
 *
 * @license MIT
 */
import { Env, ChatMessage, SessionInitRequest, SessionInitResponse, SessionData, GameGenerateRequest } from "./types";
import { createChunksWithEmbeddings, generateEmbeddings, findTopK } from "./rag";
import { buildGamePrompt, GAME_GENERATOR_SYSTEM_PROMPT, validateGeneratedHTML } from "./prompts";

// Model ID for Workers AI model
// https://developers.cloudflare.com/workers-ai/models/
const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Default system prompt
const SYSTEM_PROMPT =
	"You are a helpful, friendly assistant. Provide concise and accurate responses.";

export default {
	/**
	 * Main request handler for the Worker
	 */
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// Handle static assets (frontend)
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// API Routes
		if (url.pathname === "/api/chat") {
			// Handle POST requests for chat
			if (request.method === "POST") {
				return handleChatRequest(request, env);
			}

			// Method not allowed for other request types
			return new Response("Method not allowed", { status: 405 });
		}

		// Session initialization endpoint
		if (url.pathname === "/api/session/init") {
			if (request.method === "POST") {
				return handleSessionInit(request, env);
			}
			return new Response("Method not allowed", { status: 405 });
		}

		// Game generation endpoint
		const generateMatch = url.pathname.match(/^\/api\/generate\/([a-f0-9-]+)$/);
		if (generateMatch) {
			if (request.method === "POST") {
				const sessionId = generateMatch[1];
				return handleGameGeneration(request, env, sessionId);
			}
			return new Response("Method not allowed", { status: 405 });
		}

		// Handle 404 for unmatched routes
		return new Response("Not found", { status: 404 });
	},

	/**
	 * Scheduled handler for cron triggers (runs daily at midnight UTC)
	 */
	async scheduled(
		event: ScheduledEvent,
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		console.log("Running scheduled cleanup task at", new Date().toISOString());

		try {
			// List all session keys in KV
			const list = await env.SESSIONS_KV.list({ prefix: "session:" });
			const sessionCount = list.keys.length;

			console.log(`Found ${sessionCount} active sessions in KV`);

			// Log session statistics
			if (sessionCount > 0) {
				console.log("Session IDs:", list.keys.map(k => k.name).join(", "));
			}

			// KV automatically expires sessions based on TTL (1 hour)
			// This cron job mainly serves as a monitoring/logging checkpoint

			// Optional: Clean up any very old sessions (belt and suspenders approach)
			const now = Date.now();
			let cleanedCount = 0;

			for (const key of list.keys) {
				try {
					const data = await env.SESSIONS_KV.get(key.name);
					if (data) {
						const sessionData = JSON.parse(data) as SessionData;
						const age = now - sessionData.createdAt;

						// If session is older than 2 hours (TTL is 1 hour, so this catches orphans)
						if (age > 2 * 60 * 60 * 1000) {
							await env.SESSIONS_KV.delete(key.name);
							cleanedCount++;
							console.log(`Cleaned up orphaned session: ${key.name}`);
						}
					}
				} catch (err) {
					console.error(`Error processing session ${key.name}:`, err);
				}
			}

			console.log(`Cleanup complete. Removed ${cleanedCount} orphaned sessions.`);
		} catch (error) {
			console.error("Error during scheduled cleanup:", error);
		}
	},
} satisfies ExportedHandler<Env>;

/**
 * Handles chat API requests
 */
async function handleChatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		// Parse JSON request body
		const { messages = [] } = (await request.json()) as {
			messages: ChatMessage[];
		};

		// Add system prompt if not present
		if (!messages.some((msg) => msg.role === "system")) {
			messages.unshift({ role: "system", content: SYSTEM_PROMPT });
		}

		const response = (await env.AI.run(
			MODEL_ID,
			{
				messages,
				max_tokens: 1024,
			},
			// @ts-expect-error tags is no longer required
			{
				returnRawResponse: true,
				// Uncomment to use AI Gateway
				// gateway: {
				//   id: "YOUR_GATEWAY_ID", // Replace with your AI Gateway ID
				//   skipCache: false,      // Set to true to bypass cache
				//   cacheTtl: 3600,        // Cache time-to-live in seconds
				// },
			},
		)) as unknown as Response;

		// Return streaming response
		return response;
	} catch (error) {
		console.error("Error processing chat request:", error);
		return new Response(
			JSON.stringify({ error: "Failed to process request" }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			},
		);
	}
}

/**
 * Handles session initialization - processes uploaded text and creates RAG chunks
 */
async function handleSessionInit(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const body = (await request.json()) as SessionInitRequest;
		const { text, fileName } = body;

		if (!text || text.trim().length === 0) {
			return new Response(
				JSON.stringify({ error: "Text content is required" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Generate session ID
		const sessionId = crypto.randomUUID();

		// Create chunks with embeddings
		const chunks = await createChunksWithEmbeddings(text, env);

		// Store session data in KV with 1 hour TTL
		const sessionData: SessionData = {
			chunks,
			createdAt: Date.now(),
			originalFileName: fileName,
		};

		await env.SESSIONS_KV.put(
			`session:${sessionId}`,
			JSON.stringify(sessionData),
			{ expirationTtl: 3600 }, // 1 hour
		);

		// Return session info
		const response: SessionInitResponse = {
			sessionId,
			chunkCount: chunks.length,
		};

		return new Response(JSON.stringify(response), {
			headers: {
				"Content-Type": "application/json",
				"Set-Cookie": `session_id=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600; Path=/`,
			},
		});
	} catch (error) {
		console.error("Error initializing session:", error);

		// Check for rate limit errors
		const errorMessage = error instanceof Error ? error.message : String(error);
		const isRateLimit =
			errorMessage.includes("rate limit") ||
			errorMessage.includes("quota") ||
			errorMessage.includes("429") ||
			errorMessage.includes("too many requests");

		if (isRateLimit) {
			return new Response(
				JSON.stringify({
					error: "Daily AI usage limit reached",
					message: "The free tier daily limit has been reached. Please try again tomorrow (resets at midnight UTC) or contact the administrator to upgrade.",
					retryAfter: "tomorrow",
				}),
				{
					status: 429,
					headers: {
						"Content-Type": "application/json",
						"Retry-After": "86400" // 24 hours
					},
				},
			);
		}

		return new Response(
			JSON.stringify({
				error: "Failed to initialize session",
				details: errorMessage,
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}

/**
 * Handles game generation using RAG retrieval
 */
async function handleGameGeneration(
	request: Request,
	env: Env,
	sessionId: string,
): Promise<Response> {
	try {
		const body = (await request.json()) as GameGenerateRequest;
		const { gameType, instructions } = body;

		// Validate game type
		if (!["quiz", "simulation", "puzzle"].includes(gameType)) {
			return new Response(
				JSON.stringify({ error: "Invalid game type" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Retrieve session data
		const sessionDataStr = await env.SESSIONS_KV.get(`session:${sessionId}`);
		if (!sessionDataStr) {
			return new Response(
				JSON.stringify({
					error: "Session not found or expired. Please upload your file again.",
				}),
				{
					status: 404,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const sessionData = JSON.parse(sessionDataStr) as SessionData;

		// Generate query embedding for game type
		const query = `Create a ${gameType} game based on this educational content`;
		const queryEmbeddings = await generateEmbeddings([query], env);

		// Find top relevant chunks using RAG
		const relevantChunks = findTopK(queryEmbeddings[0], sessionData.chunks, 5);
		const context = relevantChunks.map((c) => c.text).join("\n\n");

		// Build game generation prompt
		const gamePrompt = buildGamePrompt(gameType, context, instructions);

		// Generate game using LLM with streaming
		const response = (await env.AI.run(
			MODEL_ID,
			{
				messages: [
					{ role: "system", content: GAME_GENERATOR_SYSTEM_PROMPT },
					{ role: "user", content: gamePrompt },
				],
				max_tokens: 4096, // Larger for complete games
			},
			// @ts-expect-error tags is no longer required
			{
				returnRawResponse: true,
			},
		)) as unknown as Response;

		// Return streaming response
		return response;
	} catch (error) {
		console.error("Error generating game:", error);

		// Check for rate limit errors
		const errorMessage = error instanceof Error ? error.message : String(error);
		const isRateLimit =
			errorMessage.includes("rate limit") ||
			errorMessage.includes("quota") ||
			errorMessage.includes("429") ||
			errorMessage.includes("too many requests");

		if (isRateLimit) {
			return new Response(
				JSON.stringify({
					error: "Daily AI usage limit reached",
					message: "The free tier daily limit has been reached. Please try again tomorrow (resets at midnight UTC) or contact the administrator to upgrade.",
					retryAfter: "tomorrow",
				}),
				{
					status: 429,
					headers: {
						"Content-Type": "application/json",
						"Retry-After": "86400" // 24 hours
					},
				},
			);
		}

		return new Response(
			JSON.stringify({
				error: "Failed to generate game",
				details: errorMessage,
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}
