# Educational Game Generator

An AI-powered educational game generator that transforms uploaded educational content into interactive learning games using RAG (Retrieval Augmented Generation) and Cloudflare Workers AI.

## Features

- **Multi-Format Support**: Upload TXT, MD, PDF, or DOCX files
- **RAG System**: Custom lightweight RAG implementation with semantic search
- **Three Game Types**:
  - **Quiz Games**: Multiple choice, true/false, fill-in-blank questions
  - **Interactive Simulations**: Visual demonstrations with controls
  - **Puzzle Games**: Matching, word search, sorting, memory games
- **Edge-First Architecture**: Runs globally on Cloudflare Workers
- **Session-Based**: No database needed, 1-hour session TTL
- **Full-Screen Games**: Sandboxed iframe rendering for security
- **Responsive Design**: Works on mobile and desktop
- **Streaming Generation**: Real-time progress updates
- **Modern UI**: Built with TailwindCSS for a clean, minimalist design

## Demo

1. Upload an educational file (e.g., lecture notes, textbook content)
2. AI processes and creates knowledge chunks with embeddings
3. Select a game type (Quiz, Simulation, or Puzzle)
4. Add optional instructions for customization
5. AI generates a complete, self-contained HTML game
6. Play the game in full-screen mode

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- A Cloudflare account (free tier supported)

### Installation

1. Clone or download this repository:

   ```bash
   cd llm-chat-app-template
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. The KV namespace is already created. If you need to recreate it:

   ```bash
   npx wrangler kv namespace create SESSIONS_KV
   ```

   Then update the `id` in `wrangler.jsonc` with the returned ID.

### Development

Start a local development server:

```bash
npm run dev
# or
npx wrangler dev
```

This will start a local server at **http://localhost:8787**.

**Important Note**: Workers AI accesses your Cloudflare account even during local development, which may incur usage charges on the paid tier. On the free tier, you'll be limited to approximately 50 games per day.

### Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
# or
npx wrangler deploy
```

Your app will be available at `https://llm-chat-app-template.YOUR_SUBDOMAIN.workers.dev`

## Project Structure

```
/
├── public/                 # Frontend
│   ├── index.html          # UI with file upload & game controls
│   └── chat.js             # File parsing, RAG client, game renderer
├── src/                    # Backend (Cloudflare Workers)
│   ├── index.ts            # Main Worker with API endpoints
│   ├── types.ts            # TypeScript type definitions
│   ├── rag.ts              # RAG utilities (chunking, embeddings, search)
│   └── prompts.ts          # Game generation prompt templates
├── wrangler.jsonc          # Cloudflare Worker configuration
├── tsconfig.json           # TypeScript configuration
├── sample-content.txt      # Sample educational content for testing
└── README.md               # This documentation
```

## Architecture

### Backend Flow

```
1. User uploads file → Client parses (PDF.js, Mammoth.js)
2. POST /api/session/init → Creates session
   - Chunks text (~500 chars/chunk)
   - Generates embeddings (Workers AI: bge-base-en-v1.5)
   - Stores in KV with 1-hour TTL
3. POST /api/generate/{sessionId} → Generates game
   - Creates query embedding
   - RAG retrieval (top 5 relevant chunks)
   - Generates game (Workers AI: Llama 3.3 70B)
   - Streams HTML response
4. Client validates & renders game in sandboxed iframe
5. Cron trigger (daily at midnight UTC) → Cleanup & monitoring
   - Lists active sessions
   - Logs statistics
   - Removes orphaned sessions
```

### RAG Implementation

- **Text Chunking**: Sentence-based with ~500 character chunks
- **Embeddings**: Workers AI `@cf/baai/bge-base-en-v1.5` (768 dimensions)
- **Storage**: Cloudflare KV (session-based, 1-hour TTL)
- **Retrieval**: Cosine similarity search (top-K)
- **Generation**: Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast`

### Why Custom RAG? (No LangChain)

- **Tiny Bundle**: ~10KB vs ~1MB+ with LangChain
- **Workers Compatible**: No Node.js dependencies
- **Fast**: Optimized for edge computing
- **Simple**: Easy to understand and modify

## Cost & Free Tier Limits

### Cloudflare Free Tier

**Workers AI:**
- **10,000 Neurons per day** (free)
- Per game: ~150-550 neurons
- **Approximately 50 games per day** on free tier

**Other Services:**
- **KV Namespace**: 100,000 reads/day, 1,000 writes/day (free)
- **Workers Requests**: 100,000 requests/day (free)

### What Happens When Limits Are Reached?

- **Requests will FAIL** with user-friendly error message
- **NO automatic charges** (you must add payment method to upgrade)
- Limits reset daily at **midnight UTC**
- Error message: "Daily AI limit reached. Please try again tomorrow."

### Production Costs (Paid Tier)

Per game generation:
- **Embeddings**: ~50 chunks × $0.004/1000 = **$0.0002**
- **Game Generation**: ~4000 tokens × $0.012/1000 = **$0.048**
- **Total**: ~**$0.05 per game**

## Game Types

### 1. Quiz Games
- Multiple choice questions
- True/False questions
- Fill-in-the-blank
- Immediate feedback
- Score tracking

### 2. Interactive Simulations
- Visual demonstrations
- Interactive controls (sliders, buttons)
- Step-by-step walkthroughs
- Real-time parameter adjustments
- Great for science, math, algorithms

### 3. Puzzle Games
- Matching (terms to definitions)
- Word search
- Sorting/ordering events
- Memory/concentration
- Drag-and-drop challenges

## Security

### HTML Validation

Generated games are validated to ensure:
- No external scripts (`<script src=...>`)
- No external stylesheets (`<link href=...>`)
- No import/require statements
- Size limits (<300KB)
- Complete HTML structure

### Sandboxed Rendering

Games run in a sandboxed iframe:
```javascript
iframe.sandbox = 'allow-scripts allow-same-origin';
```

## API Endpoints

### `POST /api/session/init`

Initialize a session with uploaded content.

**Request:**
```json
{
  "text": "Educational content...",
  "fileName": "lecture.pdf"
}
```

**Response:**
```json
{
  "sessionId": "uuid-here",
  "chunkCount": 42
}
```

### `POST /api/generate/{sessionId}`

Generate a game from session content.

**Request:**
```json
{
  "gameType": "quiz",
  "instructions": "Focus on key concepts"
}
```

**Response:** Streaming HTML (SSE format)

## Usage Tips

### Best Content Types

- Lecture notes
- Textbook chapters
- Study guides
- Technical documentation
- Historical articles
- Scientific papers

### Optimal File Size

- **Recommended**: 1-10 pages (500-5000 words)
- **Minimum**: ~500 words
- **Maximum**: 10MB file size limit

### Custom Instructions Examples

- "Focus on dates and key events"
- "Make it challenging for advanced students"
- "Include explanations for each answer"
- "Add difficulty progression"
- "Keep it simple for beginners"

## Customization

### Change Embedding Model

Edit `src/rag.ts`:
```typescript
const EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5'; // 384 dimensions (smaller, faster)
```

### Change LLM Model

Edit `src/index.ts`:
```typescript
const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct"; // Smaller, faster model
```

Available models: [Cloudflare Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)

### Adjust Chunk Size

Edit `src/rag.ts`:
```typescript
const chunks = chunkText(text, 1000); // Larger chunks (default: 500)
```

### Modify Game Prompts

Edit prompt templates in `src/prompts.ts` to customize game generation behavior.

### Styling

The UI is built with **TailwindCSS** for modern, utility-first styling. Customize the design by editing the Tailwind config in `public/index.html`:

```javascript
// Modify colors and theme
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: '#6366f1',      // Change primary color
        'primary-dark': '#4f46e5',
      },
    },
  },
}
```

Or modify Tailwind classes directly in the HTML for component-specific changes:
```html
<!-- Change button gradient -->
<button class="bg-gradient-to-r from-blue-600 to-cyan-600">

<!-- Change card styling -->
<div class="bg-white rounded-3xl shadow-2xl">
```

## Monitoring & Debugging

### View Logs

```bash
npx wrangler tail
```

### Check Usage

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** → **AI**
3. View real-time usage and costs

### Debug Mode

Open browser console (F12) to see:
- File parsing status
- Session creation details
- RAG retrieval logs
- Generation progress

### Automated Maintenance (Cron Trigger)

The application includes a **scheduled cleanup task** that runs daily at midnight UTC:

**What it does:**
- Lists all active sessions in KV
- Logs session statistics
- Cleans up orphaned sessions older than 2 hours (belt and suspenders approach)
- Provides monitoring checkpoint for session health

**Configuration:**
```jsonc
// wrangler.jsonc
"triggers": {
  "crons": ["0 0 * * *"]  // Daily at midnight UTC
}
```

**View cron execution logs:**
```bash
npx wrangler tail
# Watch for "Running scheduled cleanup task" messages
```

**Customize schedule:**
Edit `wrangler.jsonc` to change the cron schedule:
- `"0 */6 * * *"` - Every 6 hours
- `"0 12 * * *"` - Daily at noon UTC
- `"*/30 * * * *"` - Every 30 minutes

[Learn more about cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

## Testing

A sample file is included for testing:

```bash
# File: sample-content.txt
# Content: Introduction to Machine Learning
```

Test workflow:
1. Start dev server: `npm run dev`
2. Open http://localhost:8787
3. Upload `sample-content.txt`
4. Select "Quiz" game type
5. Click "Generate Game"
6. Play the generated quiz

## Limitations

### Free Tier
- Approximately 50 games per day
- Rate limit errors show user-friendly messages
- No automatic charges

### Generated Games
- Must be simple (no WebGL, complex Canvas operations)
- Self-contained (no external dependencies)
- Size limit: 300KB per game
- Complexity guard prevents overly complex requests

### Session Duration
- Sessions expire after 1 hour
- Users must re-upload file after expiration

## Contributing

This is a personal project, but feel free to:
- Fork and modify for your needs
- Report issues
- Share improvements
- Create your own game templates

## Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Workers AI Documentation](https://developers.cloudflare.com/workers-ai/)
- [Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)
- [Cloudflare KV Documentation](https://developers.cloudflare.com/kv/)
- [RAG Overview](https://www.cloudflare.com/learning/ai/what-is-retrieval-augmented-generation/)

## License

MIT License - Feel free to use and modify.

## Acknowledgments

- Built on Cloudflare Workers infrastructure
- Uses Meta's Llama 3.3 70B model via Workers AI
- PDF.js for PDF parsing
- Mammoth.js for DOCX parsing
- Original template from Cloudflare

---

For questions or issues, check the browser console or Wrangler logs for debugging information.
