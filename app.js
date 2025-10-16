// Speech Recognition Setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.continuous = false;
recognition.interimResults = true;

// State
let conversationHistory = [];
let isListening = false;
let isProcessing = false;
let currentAudio = null;

// DOM Elements
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const clearBtn = document.getElementById('clear-btn');
const messagesDiv = document.getElementById('messages');
const statusDiv = document.getElementById('status');
const languageSelect = document.getElementById('language-select');

// Event Listeners
startBtn.addEventListener('click', startListening);
stopBtn.addEventListener('click', stopListening);
clearBtn.addEventListener('click', clearChat);

// Speech Recognition Events
recognition.onstart = () => {
    isListening = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusDiv.textContent = '🎤 Listening...';
    statusDiv.className = 'status recording';
};

recognition.onresult = (event) => {
    let transcript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptSegment = event.results[i][0].transcript;
        transcript += transcriptSegment;
    }
    
    if (event.isFinal) {
        handleUserInput(transcript);
    }
};

recognition.onerror = (event) => {
    statusDiv.textContent = `❌ Error: ${event.error}`;
    statusDiv.className = 'status';
    isListening = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
};

recognition.onend = () => {
    isListening = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
};

function startListening() {
    if (!isListening && !isProcessing) {
        recognition.start();
    }
}

function stopListening() {
    if (isListening) {
        recognition.stop();
    }
}

function clearChat() {
    messagesDiv.innerHTML = '';
    conversationHistory = [];
    statusDiv.textContent = '';
}

async function handleUserInput(userMessage) {
    if (!userMessage.trim()) return;

    // Add user message to UI and history
    addMessageToUI('user', userMessage);
    conversationHistory.push({
        role: 'user',
        content: userMessage
    });

    // Process with AI
    await getAIResponse();
}

async function getAIResponse() {
    isProcessing = true;
    statusDiv.textContent = '🤖 Thinking...';
    statusDiv.className = 'status processing';
    startBtn.disabled = true;

    try {
        // Keep only last 10 messages for context
        const recentHistory = conversationHistory.slice(-10);

        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'You are a friendly and helpful AI assistant. Keep your responses concise and conversational, suitable for voice interaction. Use short sentences.'
                },
                ...recentHistory
            ]
        });

        const aiResponse = completion.content;
        
        // Add AI message to history and UI
        conversationHistory.push({
            role: 'assistant',
            content: aiResponse
        });
        
        addMessageToUI('ai', aiResponse);

        // Convert to speech
        await speakResponse(aiResponse);

    } catch (error) {
        console.error('Error getting AI response:', error);
        statusDiv.textContent = '❌ Error getting response';
        statusDiv.className = 'status';
    }

    isProcessing = false;
    startBtn.disabled = false;
    statusDiv.textContent = '';
}

async function speakResponse(text) {
    try {
        statusDiv.textContent = '🔊 Speaking...';
        statusDiv.className = 'status playing';

        const voice = languageSelect.value;
        
        const result = await websim.textToSpeech({
            text: text,
            voice: voice
        });

        // Stop any currently playing audio
        if (currentAudio) {
            currentAudio.pause();
        }

        // Play the audio
        currentAudio = new Audio(result.url);
        
        currentAudio.onended = () => {
            statusDiv.textContent = '';
            statusDiv.className = 'status';
        };

        currentAudio.onerror = () => {
            statusDiv.textContent = '❌ Error playing audio';
            statusDiv.className = 'status';
        };

        currentAudio.play();

    } catch (error) {
        console.error('Error with text-to-speech:', error);
        statusDiv.textContent = '❌ Error with audio';
        statusDiv.className = 'status';
    }
}

function addMessageToUI(sender, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timeDiv);
    
    messagesDiv.appendChild(messageDiv);
    
    // Auto-scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

