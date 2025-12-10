/**
 * RAG (Retrieval Augmented Generation) utilities for the educational game generator.
 */

import type { Env, Chunk } from './types';

/**
 * Default embedding model for Workers AI.
 */
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

/**
 * Chunks text into smaller pieces based on sentence boundaries.
 *
 * @param text - The text to chunk
 * @param maxChunkSize - Maximum characters per chunk (default: 500)
 * @returns Array of text chunks
 */
export function chunkText(text: string, maxChunkSize: number = 500): string[] {
	// Split into sentences (handles ., !, ?)
	const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
	const chunks: string[] = [];
	let currentChunk = '';

	for (const sentence of sentences) {
		const trimmedSentence = sentence.trim();

		// If adding this sentence exceeds max size, save current chunk and start new one
		if (currentChunk && (currentChunk.length + trimmedSentence.length + 1) > maxChunkSize) {
			chunks.push(currentChunk.trim());
			currentChunk = trimmedSentence;
		} else {
			currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
		}
	}

	// Add final chunk if it exists
	if (currentChunk.trim()) {
		chunks.push(currentChunk.trim());
	}

	// Handle case where no sentences were found but we have text
	if (chunks.length === 0 && text.trim()) {
		// Split by character limit as fallback
		for (let i = 0; i < text.length; i += maxChunkSize) {
			chunks.push(text.slice(i, i + maxChunkSize).trim());
		}
	}

	return chunks;
}

/**
 * Generates embeddings for an array of text chunks using Workers AI.
 *
 * @param texts - Array of text strings to embed
 * @param env - Environment bindings
 * @returns Array of embedding vectors
 */
export async function generateEmbeddings(texts: string[], env: Env): Promise<number[][]> {
	// Workers AI can handle batch requests
	const embeddings: number[][] = [];

	// Process in batches to avoid timeout (batch size: 10)
	const batchSize = 10;
	for (let i = 0; i < texts.length; i += batchSize) {
		const batch = texts.slice(i, i + batchSize);

		// Generate embeddings for batch in parallel
		const batchPromises = batch.map(text =>
			env.AI.run(EMBEDDING_MODEL, { text: [text] })
		);

		const batchResults = await Promise.all(batchPromises);

		// Extract embedding vectors
		for (const result of batchResults) {
			if (result && result.data && result.data[0]) {
				embeddings.push(result.data[0]);
			} else {
				throw new Error('Failed to generate embedding');
			}
		}
	}

	return embeddings;
}

/**
 * Calculates cosine similarity between two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Similarity score between -1 and 1 (higher is more similar)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error('Vectors must have the same length');
	}

	let dotProduct = 0;
	let magnitudeA = 0;
	let magnitudeB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		magnitudeA += a[i] * a[i];
		magnitudeB += b[i] * b[i];
	}

	magnitudeA = Math.sqrt(magnitudeA);
	magnitudeB = Math.sqrt(magnitudeB);

	if (magnitudeA === 0 || magnitudeB === 0) {
		return 0;
	}

	return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Finds the top K most similar chunks to a query embedding.
 *
 * @param queryEmbedding - The query embedding vector
 * @param chunks - Array of chunks with embeddings
 * @param k - Number of top results to return (default: 5)
 * @returns Array of top K chunks sorted by similarity (highest first)
 */
export function findTopK(queryEmbedding: number[], chunks: Chunk[], k: number = 5): Chunk[] {
	// Calculate similarity for each chunk
	const chunksWithSimilarity = chunks.map(chunk => ({
		chunk,
		similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
	}));

	// Sort by similarity (descending)
	chunksWithSimilarity.sort((a, b) => b.similarity - a.similarity);

	// Return top K chunks
	return chunksWithSimilarity.slice(0, k).map(item => item.chunk);
}

/**
 * Creates chunks with embeddings from raw text.
 *
 * @param text - Raw text to process
 * @param env - Environment bindings
 * @returns Array of chunks with embeddings
 */
export async function createChunksWithEmbeddings(text: string, env: Env): Promise<Chunk[]> {
	// Chunk the text
	const textChunks = chunkText(text);

	// Generate embeddings
	const embeddings = await generateEmbeddings(textChunks, env);

	// Combine into Chunk objects
	const chunks: Chunk[] = textChunks.map((text, i) => ({
		text,
		embedding: embeddings[i]
	}));

	return chunks;
}
