// Speech Recognition Setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
    alert("Sorry, your browser doesn't support the Speech Recognition API. Try Chrome or Firefox.");
}
const recognition = new SpeechRecognition();
recognition.continuous = false;
recognition.interimResults = true;
recognition.lang = 'en-US';

// State
let conversationHistory = [];
let isListening = false;
let isProcessing = false;
let currentAudio = null;
let conversationStarted = false;

// DOM Elements
const circle = document.getElementById('circle');
const statusDiv = document.getElementById('status');
const circleIcon = document.querySelector('.circle-icon');

// Event Listeners
circle.addEventListener('click', toggleListening);

// Speech Recognition Events
recognition.onstart = () => {
    isListening = true;
    updateCircleState('listening');
    setStatus('Listening...');
};

recognition.onresult = (event) => {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
        // We only want the final transcript
        if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
        }
    }

    // Only process if we have a final transcript
    if (finalTranscript) {
        handleUserInput(finalTranscript);
    }
};

recognition.onerror = (event) => {
    if (event.error === 'no-speech') {
        setStatus('Didn\'t catch that. Tap to try again.');
        conversationStarted = false; // Reset conversation on no-speech
    } else {
        setStatus(`Error: ${event.error}`);
    }
    updateCircleState('idle');
    isListening = false;
};

recognition.onend = () => {
    isListening = false;
    if (!isProcessing && !conversationStarted) {
        updateCircleState('idle');
        clearStatus();
    } else if (!isProcessing && conversationStarted) {
        // If conversation is active but we stopped listening for some reason (e.g. timeout), restart listening.
        startListening();
    }
};

function startListening() {
    if (isListening) return;
    try {
        recognition.start();
    } catch (e) {
        console.error("recognition.start error", e);
        setStatus("Couldn't start listening.");
        updateCircleState('idle');
        conversationStarted = false;
    }
}

function stopListening() {
    if (isListening) {
        recognition.stop();
    }
    isListening = false;
}

function toggleListening() {
    if (isProcessing) return; // Don't interrupt processing

    if (!isListening) {
        conversationStarted = true;
        startListening();
    } else {
        conversationStarted = false;
        stopListening();
    }
}

function updateCircleState(state) {
    circle.classList.remove('idle', 'listening', 'processing');
    circle.classList.add(state);
    
    switch(state) {
        case 'listening':
            circleIcon.textContent = '...';
            break;
        case 'processing':
            circleIcon.textContent = '🧠';
            break;
        default:
            circleIcon.textContent = '🎤';
    }
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
    
    // Stop recognition explicitly, as we have the final result.
    stopListening();

    setStatus(`You said: "${userMessage.substring(0, 50)}..."`);

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

        // Convert to speech and wait for it to complete
        await speakResponse(aiResponse);

    } catch (error) {
        console.error('Error getting AI response:', error);
        setStatus('Oops, I had a problem thinking.');
        await speakOnDevice("I'm sorry, I seem to have a problem thinking right now. Please try again in a moment.");
    } finally {
        isProcessing = false;
        if (conversationStarted) {
            startListening();
        } else {
            updateCircleState('idle');
        }
    }
}

function speakOnDevice(text) {
    return new Promise((resolve) => {
        if (!('speechSynthesis' in window)) {
            console.error("Browser doesn't support SpeechSynthesis.");
            resolve();
            return;
        }
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => {
            resolve();
        };
        utterance.onerror = (e) => {
            console.error('SpeechSynthesis Error', e);
            resolve(); // Resolve anyway to not block the flow
        };
        window.speechSynthesis.speak(utterance);
    });
}

async function speakResponse(text) {
    return new Promise(async (resolve, reject) => {
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
                currentAudio.src = '';
            }

            // Play the audio
            currentAudio = new Audio(result.url);
            
            currentAudio.onended = () => {
                clearStatus();
                resolve();
            };

            currentAudio.onerror = (e) => {
                console.error("Audio playback error, falling back to on-device TTS.", e);
                setStatus('Audio error, using device voice...');
                speakOnDevice(text).then(resolve); // Resolve after fallback
            };

            currentAudio.play().catch(error => {
                console.error('Error playing audio, falling back to on-device TTS:', error);
                setStatus('Playback error, using device voice...');
                speakOnDevice(text).then(resolve); // Resolve after fallback
            });

        } catch (error) {
            console.error('Error with text-to-speech service, falling back to on-device TTS:', error);
            setStatus('TTS service error, using device voice...');
            speakOnDevice(text).then(resolve); // Resolve after fallback
        }
    });
}