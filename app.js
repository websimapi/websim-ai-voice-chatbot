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
let abortController = null; // To manage and abort AI requests

// DOM Elements
const circle = document.getElementById('circle');
const statusDiv = document.getElementById('status');
const circleIcon = document.querySelector('.circle-icon');

// Event Listeners
circle.addEventListener('click', toggleListening);

// Speech Recognition Events
recognition.onstart = () => {
    isListening = true;
    if (conversationStarted) {
      updateCircleState('listening');
      setStatus('Listening...');
    }
};

recognition.onresult = (event) => {
    // We can be interrupted while the AI is speaking or thinking.
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
        }
    }

    if (finalTranscript) {
        // Interrupt any ongoing AI processing or speaking
        if (isProcessing || currentAudio) {
            console.log("User interruption detected.");
            // Abort any pending AI fetch request
            if (abortController) {
                abortController.abort();
            }
            // Stop any currently playing audio
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.src = '';
                currentAudio = null;
            }
        }
        handleUserInput(finalTranscript);
    }
};

recognition.onerror = (event) => {
    if (event.error === 'no-speech' && conversationStarted) {
        // Don't stop the conversation for a simple no-speech timeout, just let it continue listening.
        setStatus('Listening...');
        return;
    }
    if (event.error === 'aborted' || event.error === 'audio-capture') {
        // These can happen, often not a critical error.
        // If conversation is supposed to be active, the `onend` handler will restart it.
        console.warn(`Recognition error: ${event.error}`);
        return;
    }

    setStatus(`Error: ${event.error}`);
    console.error(`Recognition error: ${event.error}`);
    updateCircleState('idle');
    isListening = false;
    conversationStarted = false;
};

recognition.onend = () => {
    isListening = false;

    if (conversationStarted) {
        // If conversation is active and recognition stopped for any reason (e.g., browser timeout, network error),
        // restart it immediately to maintain the "always on" feeling.
        console.log("Recognition ended, restarting to maintain session.");
        startListening();
    } else {
        updateCircleState('idle');
        clearStatus();
    }
};

function startListening() {
    if (isListening) return;
    try {
        recognition.start();
    } catch (e) {
        // This can happen if start() is called while it's already starting.
        // The onend handler will catch other states.
        console.error("recognition.start() error:", e.message);
        if (e.name === 'InvalidStateError') {
             // It's already running or stopping, which is fine.
             isListening = true; // Correct the state
        } else {
            setStatus("Couldn't start listening.");
            updateCircleState('idle');
            conversationStarted = false;
        }
    }
}

function stopListening() {
    if (isListening) {
        // Stop recognition and prevent it from auto-restarting.
        conversationStarted = false; 
        recognition.stop();
    }
    isListening = false;
}

function toggleListening() {
    if (!conversationStarted) {
        conversationStarted = true;
        startListening();
    } else {
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

    isProcessing = true; // Set processing flag immediately
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
    updateCircleState('processing');
    setStatus('Thinking...');

    // Create a new AbortController for this request.
    abortController = new AbortController();
    const signal = abortController.signal;

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
            ],
            // Pass the signal to the API call if it supports it.
            // (Assuming websim might support it; if not, it won't break anything)
            signal: signal 
        });
        
        // If the request was aborted while waiting, completion might be undefined or an error was thrown.
        if (signal.aborted) {
            console.log("AI request was aborted. Not processing response.");
            // isProcessing will be set to false in the 'finally' block of the new request.
            return;
        }

        const aiResponse = completion.content;
        
        // Add AI message to history
        conversationHistory.push({
            role: 'assistant',
            content: aiResponse
        });

        // Convert to speech and wait for it to complete
        await speakResponse(aiResponse, signal);

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('AI response fetch was aborted.');
        } else {
            console.error('Error getting AI response:', error);
            setStatus('Oops, I had a problem thinking.');
            await speakResponse("I'm sorry, I seem to have a problem thinking right now. Please try again in a moment.", signal);
        }
    } finally {
        // This is important: only set isProcessing to false if the request was NOT aborted.
        // If it was aborted, a new request has already taken over, and it controls the isProcessing state.
        if (!signal.aborted) {
            isProcessing = false;
            if (conversationStarted) {
                updateCircleState('listening');
                setStatus('Listening...');
            } else {
                updateCircleState('idle');
                clearStatus();
            }
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

async function speakResponse(text, signal) { // Pass signal to check for interruptions
    return new Promise(async (resolve) => {
        let fallbackTriggered = false;

        const cleanupAndResolve = () => {
            if (currentAudio) {
                 currentAudio.onended = null;
                 currentAudio.onerror = null;
                 currentAudio = null;
            }
            resolve();
        };

        const triggerFallback = async () => {
            if (fallbackTriggered) return;
            fallbackTriggered = true;

            console.log("Triggering fallback TTS.");

            if (currentAudio) {
                currentAudio.pause();
                currentAudio.src = '';
            }
            
            setStatus('Using device voice...');
            await speakOnDevice(text);
            cleanupAndResolve();
        };

        try {
            if (signal && signal.aborted) {
                 console.log("Speak response cancelled before starting.");
                 return resolve();
            }

            setStatus('Speaking...');
            const result = await websim.textToSpeech({
                text: text,
                voice: 'en-male'
            });

            if (signal && signal.aborted) {
                 console.log("Speak response cancelled after TTS generation.");
                 return resolve();
            }

            if (currentAudio) {
                currentAudio.pause();
                currentAudio.src = '';
            }

            currentAudio = new Audio(result.url);

            currentAudio.onended = () => {
                if (!fallbackTriggered) {
                    clearStatus();
                    cleanupAndResolve();
                }
            };

            currentAudio.onerror = (e) => {
                console.error("Audio playback error, falling back.", e);
                triggerFallback();
            };

            const playPromise = currentAudio.play();
            if (playPromise) {
                playPromise.catch(error => {
                    console.error('Error playing audio (autoplay likely prevented), falling back.', error);
                    triggerFallback();
                });
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('TTS service fetch was aborted.');
                cleanupAndResolve();
            } else {
                console.error('Error with TTS service, falling back.', error);
                triggerFallback();
            }
        }
    });
}