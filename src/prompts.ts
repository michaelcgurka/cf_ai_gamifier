/**
 * Prompt templates for game generation.
 */

import type { GameType } from './types';

/**
 * System prompt for the game generator LLM.
 */
export const GAME_GENERATOR_SYSTEM_PROMPT = `You are an educational game generator. Your task is to create complete, self-contained HTML games that help users learn from educational content.

CRITICAL REQUIREMENTS:
1. Generate a SINGLE, complete HTML file with ALL code inline
2. NO external dependencies (no CDN links, no imports, no external scripts/stylesheets)
3. ALL CSS must be in <style> tags within the HTML
4. ALL JavaScript must be in <script> tags within the HTML
5. Use only vanilla JavaScript (no frameworks, no libraries)
6. Game must be fully playable immediately when loaded
7. Game must be simple and work in any modern browser
8. Include clear instructions for the user
9. Provide immediate feedback on user actions
10. Make it engaging and educational

STRUCTURE TEMPLATE:
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Educational Game</title>
    <style>
        /* All styles here */
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 30px;
            max-width: 800px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Game content here -->
    </div>
    <script>
        // All game logic here
    </script>
</body>
</html>

STYLE GUIDELINES:
- Mobile-first responsive design
- Large, easy-to-tap buttons (min 44px height)
- High contrast for readability
- Clear visual feedback (hover states, active states)
- Use colors meaningfully (green for correct, red for incorrect)
- Smooth transitions for better UX

NEVER USE:
- External libraries or frameworks
- ES6 imports or requires
- Async module loading
- External API calls
- Complex 3D graphics or WebGL
- File system access
- LocalStorage (unless specifically requested)

ALWAYS INCLUDE:
- Clear game title
- Instructions
- Score/progress tracking
- Feedback messages
- Restart/reset functionality`;

/**
 * Creates a prompt for quiz game generation.
 */
function createQuizPrompt(context: string, instructions?: string): string {
	return `Generate a multiple-choice quiz game based on the educational content below.

GAME TYPE: Interactive Quiz

REQUIREMENTS:
- Create 5-10 multiple choice questions based on the content
- Each question should have 4 answer options (A, B, C, D)
- Only one correct answer per question
- Show immediate feedback when user selects an answer
- Track score and display at the end
- Include a "Next Question" button
- Show final score with encouraging message
- Include a "Play Again" button

VARIATIONS YOU CAN INCLUDE:
- Different question types (true/false, fill-in-blank if appropriate)
- Difficulty progression (easier questions first)
- Fun facts or explanations after each answer
- Progress bar showing question number

EDUCATIONAL CONTENT:
${context}

${instructions ? `ADDITIONAL INSTRUCTIONS: ${instructions}` : ''}

Generate the complete, self-contained HTML game now:`;
}

/**
 * Creates a prompt for interactive simulation game generation.
 */
function createSimulationPrompt(context: string, instructions?: string): string {
	return `Generate an interactive simulation or demonstration game based on the educational content below.

GAME TYPE: Interactive Simulation

REQUIREMENTS:
- Create an interactive visual demonstration of concepts from the content
- Use HTML buttons, sliders, or clickable elements for interaction
- Provide visual feedback (changing colors, sizes, positions)
- Include clear labels and explanations
- Show real-time updates as user interacts
- Keep it simple (no Canvas or WebGL unless absolutely necessary)
- Include a reset button

SIMULATION IDEAS BASED ON CONTENT TYPE:
- Scientific concepts: Interactive diagrams with sliders/controls
- Mathematical concepts: Visual calculators or demonstrations
- Historical events: Timeline interactions or decision trees
- Processes: Step-by-step interactive walkthroughs
- Algorithms: Visual step-through with controls

EXAMPLE INTERACTIONS:
- Sliders to adjust parameters
- Buttons to trigger actions
- Click areas to reveal information
- Drag-and-drop (using simple HTML5)
- Input fields for user values

EDUCATIONAL CONTENT:
${context}

${instructions ? `ADDITIONAL INSTRUCTIONS: ${instructions}` : ''}

Generate the complete, self-contained HTML simulation now:`;
}

/**
 * Creates a prompt for puzzle game generation.
 */
function createPuzzlePrompt(context: string, instructions?: string): string {
	return `Generate a puzzle game based on the educational content below.

GAME TYPE: Educational Puzzle

REQUIREMENTS:
- Create a puzzle that requires knowledge from the content to solve
- Make it engaging and fun
- Provide hints if user is stuck
- Track moves or time (optional)
- Clear win condition with celebration
- Include restart button

PUZZLE IDEAS:
- Matching game: Match terms with definitions
- Word search: Find key terms from the content
- Crossword: Clues based on the content
- Sorting: Put events/items in correct order
- Fill-in-the-blank: Complete sentences with correct words
- Jigsaw: Arrange information in correct order/categories
- Memory/Concentration: Flip cards to match pairs

RECOMMENDATIONS:
- Use simple HTML elements (divs, buttons) for game pieces
- Drag-and-drop can be done with simple mouse events
- Use CSS for visual effects (transforms, transitions)
- Keep track of state in simple JavaScript object
- Provide visual feedback for correct/incorrect moves

EDUCATIONAL CONTENT:
${context}

${instructions ? `ADDITIONAL INSTRUCTIONS: ${instructions}` : ''}

Generate the complete, self-contained HTML puzzle game now:`;
}

/**
 * Builds the complete game generation prompt based on game type and context.
 *
 * @param gameType - Type of game to generate
 * @param context - Educational content from RAG retrieval
 * @param instructions - Optional additional instructions from user
 * @returns Complete prompt for LLM
 */
export function buildGamePrompt(
	gameType: GameType,
	context: string,
	instructions?: string
): string {
	switch (gameType) {
		case 'quiz':
			return createQuizPrompt(context, instructions);
		case 'simulation':
			return createSimulationPrompt(context, instructions);
		case 'puzzle':
			return createPuzzlePrompt(context, instructions);
		default:
			throw new Error(`Unknown game type: ${gameType}`);
	}
}

/**
 * Validates generated HTML to ensure it meets requirements.
 *
 * @param html - Generated HTML string
 * @returns Validation result with any errors
 */
export function validateGeneratedHTML(html: string): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	// Check for external scripts
	if (/<script[^>]+src=/i.test(html)) {
		errors.push('Contains external script tags (<script src=...>)');
	}

	// Check for external stylesheets
	if (/<link[^>]+href=/i.test(html)) {
		errors.push('Contains external stylesheet links (<link href=...>)');
	}

	// Check for imports
	if (/\bimport\s+/i.test(html) || /\brequire\s*\(/i.test(html)) {
		errors.push('Contains import or require statements');
	}

	// Check for basic HTML structure
	if (!html.includes('<!DOCTYPE html>') && !html.includes('<!doctype html>')) {
		errors.push('Missing DOCTYPE declaration');
	}

	if (!/<html/i.test(html)) {
		errors.push('Missing <html> tag');
	}

	if (!/<body/i.test(html)) {
		errors.push('Missing <body> tag');
	}

	// Check size (should be reasonable, not too large)
	const sizeKB = new Blob([html]).size / 1024;
	if (sizeKB > 200) {
		errors.push(`Game is too large (${sizeKB.toFixed(1)}KB). Keep games under 200KB.`);
	}

	// Check for inline styles and scripts (should have at least one)
	const hasInlineStyle = /<style/i.test(html);
	const hasInlineScript = /<script(?!.*src)/i.test(html);

	if (!hasInlineStyle) {
		errors.push('No inline <style> tag found. All CSS must be inline.');
	}

	if (!hasInlineScript) {
		errors.push('No inline <script> tag found. All JavaScript must be inline.');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}
