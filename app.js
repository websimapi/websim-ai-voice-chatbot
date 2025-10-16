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
const circle = document.getElementById('circle');
const statusDiv = document.getElementById('status');

// Event Listeners
circle.addEventListener('click', toggleListening);

// Speech Recognition Events
recognition.onstart = () => {
    isListening = true;
    updateCircleState('listening');
    setStatus('Listening...');
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
    setStatus(`Error: ${event.error}`);
    updateCircleState('idle');
    isListening = false;
};

recognition.onend = () => {
    isListening = false;
    if (!isProcessing) {
        updateCircleState('idle');
        clearStatus();
    }
};

function toggleListening() {
    if (!isListening && !isProcessing) {
        recognition.start();
    } else if (isListening) {
        recognition.stop();
    }
}

function updateCircleState(state) {
    circle.classList.remove('idle', 'listening', 'processing');
    circle.classList.add(state);
}

function setStatus(text) {
    statusDiv.textContent = text;
    statusDiv.classList.add('active');
}

function clearStatus() {
    statusDiv.classList.remove('active');
}

async function handleUserInput(userMessage) {
    if (!userMessage.trim()) {
        updateCircleState('idle');
        return;
    }

    // Add to history
    conversationHistory.push({
        role: 'user',
        content: userMessage
    });

    // Process with AI
    await getAIResponse();
}

async function getAIResponse() {
    isProcessing = true;
    updateCircleState('processing');
    setStatus('Thinking...');

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
        
        // Add AI message to history
        conversationHistory.push({
            role: 'assistant',
            content: aiResponse
        });

        // Convert to speech
        await speakResponse(aiResponse);

    } catch (error) {
        console.error('Error getting AI response:', error);
        setStatus('Error');
        updateCircleState('idle');
    }

    isProcessing = false;
}

async function speakResponse(text) {
    try {
        setStatus('Speaking...');

        // Use English male as default voice
        const result = await websim.textToSpeech({
            text: text,
            voice: 'en-male'
        });

        // Stop any currently playing audio
        if (currentAudio) {
            currentAudio.pause();
        }

        // Play the audio
        currentAudio = new Audio(result.url);
        
        currentAudio.onended = () => {
            updateCircleState('idle');
            clearStatus();
        };

        currentAudio.onerror = () => {
            setStatus('Audio error');
            updateCircleState('idle');
        };

        updateCircleState('idle');
        currentAudio.play();

    } catch (error) {
        console.error('Error with text-to-speech:', error);
        setStatus('Audio error');
        updateCircleState('idle');
    }
}