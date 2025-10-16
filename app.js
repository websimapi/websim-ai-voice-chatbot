// Speech Recognition Setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
    alert("Sorry, your browser doesn't support the Speech Recognition API. Try Chrome or Firefox.");
}
const recognition = new SpeechRecognition();
recognition.continuous = true; // Enable continuous listening
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
    // Check if we can be interrupted. We can be interrupted while the AI is speaking,
    // but not while we are processing the AI's response from the server.
    if (isProcessing && !currentAudio) {
        return; 
    }
    
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
        }
    }

    if (finalTranscript) {
        // If the AI is currently speaking, interrupt it.
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.src = '';
            currentAudio = null;
        }
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
    if (isProcessing) {
        // This can happen if the AI is taking a long time to respond and the recognition times out.
        // We'll let getAIResponse handle restarting.
        return;
    }
    
    if (conversationStarted) {
        // If conversation is active and we stopped listening for some reason (e.g. browser timeout), restart.
        startListening();
    } else {
        updateCircleState('idle');
        clearStatus();
    }
};

function startListening() {
    if (isListening || isProcessing) return;
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

    if (!conversationStarted) {
        conversationStarted = true;
        startListening();
    } else {
        conversationStarted = false;
        stopListening();
        updateCircleState('idle');
        clearStatus();
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
        return;
    }
    
    // We no longer stop listening here. The recognition service runs continuously.
    // isProcessing flag will prevent onresult from firing new events.
    
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
        // Use speakResponse for the error message as well, to benefit from its fallback logic
        await speakResponse("I'm sorry, I seem to have a problem thinking right now. Please try again in a moment.");
    } finally {
        isProcessing = false;
        // After speaking, go back to listening state if conversation is active
        if (conversationStarted) {
            updateCircleState('listening');
            setStatus('Listening...');
            // No need to call startListening() here as it should be running continuously.
            // onend will handle restarts if it disconnects for some reason.
        } else {
            updateCircleState('idle');
            clearStatus();
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
    return new Promise(async (resolve) => {
        let fallbackTriggered = false;

        const triggerFallback = async () => {
            if (fallbackTriggered) return;
            fallbackTriggered = true;

            console.log("Triggering fallback TTS.");

            if (currentAudio) {
                // Prevent the original audio from ever playing
                currentAudio.pause();
                currentAudio.src = '';
                currentAudio.onended = null;
                currentAudio.onerror = null;
                currentAudio = null;
            }
            
            setStatus('Using device voice...');
            await speakOnDevice(text);
            resolve();
        };

        try {
            setStatus('Speaking...');
            const result = await websim.textToSpeech({
                text: text,
                voice: 'en-male'
            });

            if (currentAudio) {
                currentAudio.pause();
                currentAudio.src = '';
                currentAudio.onended = null;
                currentAudio.onerror = null;
            }

            currentAudio = new Audio(result.url);

            currentAudio.onended = () => {
                if (!fallbackTriggered) {
                    clearStatus();
                    resolve();
                }
            };

            currentAudio.onerror = (e) => {
                console.error("Audio playback error, falling back.", e);
                triggerFallback();
            };

            // The play() method returns a Promise which can be rejected.
            const playPromise = currentAudio.play();
            if (playPromise) {
                playPromise.catch(error => {
                    console.error('Error playing audio (autoplay likely prevented), falling back.', error);
                    triggerFallback();
                });
            }

        } catch (error) {
            console.error('Error with TTS service, falling back.', error);
            triggerFallback();
        }
    });
}