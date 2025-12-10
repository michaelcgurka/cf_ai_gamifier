/**
 * Educational Game Generator Frontend
 *
 * Handles file upload, parsing, session management, and game generation.
 */

// DOM elements
const fileInput = document.getElementById('file-input');
const fileUploadArea = document.getElementById('file-upload-area');
const fileStatus = document.getElementById('file-status');
const gameControls = document.getElementById('game-controls');
const gameTypeBtns = document.querySelectorAll('.game-type-btn');
const generateBtn = document.getElementById('generate-game-btn');
const gameInstructions = document.getElementById('game-instructions');
const progressIndicator = document.getElementById('progress-indicator');
const progressText = document.getElementById('progress-text');
const progressFill = document.getElementById('progress-fill');
const statusMessage = document.getElementById('status-message');

// State
let sessionId = null;
let selectedGameType = null;
let uploadedFileName = null;

// Configure PDF.js
if (typeof pdfjsLib !== 'undefined') {
	pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

// File upload handlers
fileUploadArea.addEventListener('click', () => fileInput.click());

fileUploadArea.addEventListener('dragover', (e) => {
	e.preventDefault();
	fileUploadArea.style.borderColor = 'var(--primary-color)';
});

fileUploadArea.addEventListener('dragleave', () => {
	fileUploadArea.style.borderColor = 'var(--border-color)';
});

fileUploadArea.addEventListener('drop', async (e) => {
	e.preventDefault();
	fileUploadArea.style.borderColor = 'var(--border-color)';
	const file = e.dataTransfer.files[0];
	if (file) {
		await handleFileUpload(file);
	}
});

fileInput.addEventListener('change', async (e) => {
	const file = e.target.files[0];
	if (file) {
		await handleFileUpload(file);
	}
});

// Game type selection
gameTypeBtns.forEach(btn => {
	btn.addEventListener('click', () => {
		gameTypeBtns.forEach(b => b.classList.remove('selected'));
		btn.classList.add('selected');
		selectedGameType = btn.dataset.type;
		updateGenerateButton();
	});
});

// Generate game button
generateBtn.addEventListener('click', generateGame);

/**
 * Handles file upload and parsing
 */
async function handleFileUpload(file) {
	try {
		// Validate file size (10MB max)
		const maxSize = 10 * 1024 * 1024;
		if (file.size > maxSize) {
			showStatus('error', 'File is too large. Maximum size is 10MB.');
			return;
		}

		// Validate file type
		const validTypes = ['.txt', '.md', '.pdf', '.docx'];
		const fileExt = '.' + file.name.split('.').pop().toLowerCase();
		if (!validTypes.includes(fileExt)) {
			showStatus('error', 'Invalid file type. Supported formats: TXT, MD, PDF, DOCX');
			return;
		}

		uploadedFileName = file.name;
		fileUploadArea.classList.add('has-file');
		fileStatus.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

		showProgress('Parsing file...');

		// Parse file based on type
		let text = '';
		if (fileExt === '.txt' || fileExt === '.md') {
			text = await parseTextFile(file);
		} else if (fileExt === '.pdf') {
			text = await parsePDF(file);
		} else if (fileExt === '.docx') {
			text = await parseDOCX(file);
		}

		if (!text || text.trim().length === 0) {
			throw new Error('No text content found in file');
		}

		showProgress('Creating session...');

		// Initialize session
		const response = await fetch('/api/session/init', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text,
				fileName: file.name
			})
		});

		if (!response.ok) {
			const error = await response.json();

			// Handle rate limit specifically
			if (response.status === 429) {
				throw new Error('⏰ ' + (error.message || 'Daily AI limit reached. Please try again tomorrow!'));
			}

			throw new Error(error.error || 'Failed to initialize session');
		}

		const data = await response.json();
		sessionId = data.sessionId;

		hideProgress();
		showStatus('success', `✓ File processed successfully! Created ${data.chunkCount} knowledge chunks.`);
		gameControls.classList.add('visible');
		updateGenerateButton();

	} catch (error) {
		console.error('Error handling file upload:', error);
		hideProgress();
		showStatus('error', error.message);
		fileUploadArea.classList.remove('has-file');
	}
}

/**
 * Parses text files (.txt, .md)
 */
async function parseTextFile(file) {
	return await file.text();
}

/**
 * Parses PDF files
 */
async function parsePDF(file) {
	if (typeof pdfjsLib === 'undefined') {
		throw new Error('PDF.js library not loaded');
	}

	const arrayBuffer = await file.arrayBuffer();
	const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

	let text = '';
	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
		const content = await page.getTextContent();
		const pageText = content.items.map(item => item.str).join(' ');
		text += pageText + '\n\n';
	}

	return text;
}

/**
 * Parses DOCX files
 */
async function parseDOCX(file) {
	if (typeof mammoth === 'undefined') {
		throw new Error('Mammoth.js library not loaded');
	}

	const arrayBuffer = await file.arrayBuffer();
	const result = await mammoth.extractRawText({ arrayBuffer });
	return result.value;
}

/**
 * Generates the game
 */
async function generateGame() {
	if (!sessionId || !selectedGameType) {
		return;
	}

	try {
		generateBtn.disabled = true;
		showProgress('Generating your game...');

		const instructions = gameInstructions.value.trim();

		const response = await fetch(`/api/generate/${sessionId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				gameType: selectedGameType,
				instructions: instructions || undefined
			})
		});

		if (!response.ok) {
			const error = await response.json();

			// Handle rate limit specifically
			if (response.status === 429) {
				throw new Error('⏰ ' + (error.message || 'Daily AI limit reached. Please try again tomorrow!'));
			}

			throw new Error(error.error || 'Failed to generate game');
		}

		// Process streaming response
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let gameHTML = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value, { stream: true });
			const lines = chunk.split('\n');

			for (const line of lines) {
				try {
					const jsonData = JSON.parse(line);
					if (jsonData.response) {
						gameHTML += jsonData.response;
						// Update progress based on content received
						const progress = Math.min(90, (gameHTML.length / 5000) * 100);
						setProgress(progress);
					}
				} catch (e) {
					// Ignore parse errors for incomplete JSON
				}
			}
		}

		// Validate the generated HTML
		const validation = validateHTML(gameHTML);
		if (!validation.valid) {
			throw new Error('Generated game contains invalid content: ' + validation.errors.join(', '));
		}

		setProgress(100);
		hideProgress();

		// Render the game
		renderGameFullScreen(gameHTML);

	} catch (error) {
		console.error('Error generating game:', error);
		hideProgress();
		showStatus('error', 'Error generating game: ' + error.message);
		generateBtn.disabled = false;
	}
}

/**
 * Validates generated HTML for security
 */
function validateHTML(html) {
	const errors = [];

	// Check for external dependencies
	if (/<script[^>]+src=/i.test(html)) {
		errors.push('External script tags');
	}
	if (/<link[^>]+href=/i.test(html)) {
		errors.push('External stylesheet links');
	}
	if (/\bimport\s+/i.test(html) || /\brequire\s*\(/i.test(html)) {
		errors.push('Import/require statements');
	}

	// Check for basic HTML structure
	if (!/<html/i.test(html)) {
		errors.push('Missing HTML structure');
	}

	// Check size
	const sizeKB = new Blob([html]).size / 1024;
	if (sizeKB > 300) {
		errors.push('Game too large (>300KB)');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Renders the game in full-screen mode
 */
function renderGameFullScreen(htmlContent) {
	// Create overlay
	const overlay = document.createElement('div');
	overlay.id = 'game-overlay';
	overlay.style.cssText = `
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: white;
		z-index: 9999;
		overflow: hidden;
	`;

	// Create iframe
	const iframe = document.createElement('iframe');
	iframe.style.cssText = `
		width: 100%;
		height: 100%;
		border: none;
	`;
	iframe.sandbox = 'allow-scripts allow-same-origin';

	// Create close button
	const closeBtn = document.createElement('button');
	closeBtn.textContent = '✕ Close Game';
	closeBtn.style.cssText = `
		position: absolute;
		top: 15px;
		right: 15px;
		z-index: 10000;
		padding: 12px 24px;
		background: #f44336;
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
		box-shadow: 0 2px 8px rgba(0,0,0,0.2);
		transition: background 0.3s;
	`;
	closeBtn.onmouseover = () => closeBtn.style.background = '#d32f2f';
	closeBtn.onmouseout = () => closeBtn.style.background = '#f44336';
	closeBtn.onclick = () => {
		overlay.remove();
		generateBtn.disabled = false;
		showStatus('success', '✓ Game closed. Generate another one or upload a new file!');
	};

	// Assemble and show
	overlay.appendChild(iframe);
	overlay.appendChild(closeBtn);
	document.body.appendChild(overlay);

	// Write content to iframe
	iframe.contentWindow.document.open();
	iframe.contentWindow.document.write(htmlContent);
	iframe.contentWindow.document.close();
}

/**
 * Shows progress indicator
 */
function showProgress(message) {
	progressText.textContent = message;
	progressIndicator.classList.add('visible');
	setProgress(10);
}

/**
 * Hides progress indicator
 */
function hideProgress() {
	progressIndicator.classList.remove('visible');
	setProgress(0);
}

/**
 * Sets progress bar percentage
 */
function setProgress(percentage) {
	progressFill.style.width = `${percentage}%`;
}

/**
 * Shows status message
 */
function showStatus(type, message) {
	statusMessage.textContent = message;
	statusMessage.className = `status-message ${type} visible`;
	setTimeout(() => {
		statusMessage.classList.remove('visible');
	}, 5000);
}

/**
 * Updates generate button state
 */
function updateGenerateButton() {
	generateBtn.disabled = !(sessionId && selectedGameType);
}

// Initialize
console.log('Educational Game Generator initialized');
