/**
 * Scratch 3.0 extension for M3D Gemini AI.
 * Simplified interface for kids - no API keys or URLs to configure.
 */
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');


const EXTENSION_ID = 'geminiAI';

class M3DGeminiAI {
    constructor(runtime) {
        this.runtime = runtime;
        
        // Fixed configuration (set in code)
        this.SERVER_URL = 'https://chat.markhor3d.com';
        this.SECRET_KEY = '218a75af-c7a9-454b-9a01-252e29ba330a'; // Same as chat extension
        
        // State
        this.lastResponse = '';
        this.lastError = '';
        this.isLoading = false;
        this.userProfile = ''; // Additional user-defined profile
        
        // Base context (always applied)
        this.BASE_CONTEXT = 'Short answer, must not exceed 3 sentences. Reply in single values if the user requires that. Don\'t use any resources other than the basic LLM.';
        
        this.runtime.registerPeripheralExtension(EXTENSION_ID, this);
    }

    getInfo() {
        return {
            id: EXTENSION_ID,
            name: 'M3D Gemini AI',
            color1: '#FF6B6B', // Coral red
            color2: '#4ECDC4', // Turquoise
            menuIconURI: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyQzIgMTcuNTIgNi40OCAyMiAxMiAyMkMxNy41MiAyMiAyMiAxNy41MiAyMiAxMkMyMiA2LjQ4IDE3LjUyIDIgMTIgMlpNMTIgMjBDNy41OCAyMCA0IDE2LjQyIDQgMTJDNCA3LjU4IDcuNTggNCAxMiA0QzE2LjQyIDQgMjAgNy41OCAyMCAxMkMyMCAxNi40MiAxNi40MiAyMCAxMiAyMFoiIGZpbGw9IiNGRjZCNkIiLz4KPHBhdGggZD0iTTEyIDZMMTcgMTJMMTIgMThMNyAxMkwxMiA2WiIgZmlsbD0iIzRFQ0RDNCIvPgo8L3N2Zz4K',
            showStatusButton: false,
            
            blocks: [
                // --- Main AI Blocks ---
                {
                    opcode: 'askAI',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'gemini.askAI',
                        default: 'ask AI [QUESTION]',
                        description: 'Ask the AI a question. Gets response that can be read with "AI answer" block.'
                    }),
                    arguments: {
                        QUESTION: {
                            type: ArgumentType.STRING,
                            defaultValue: 'Tell me a fun fact'
                        }
                    }
                },
                // {
                //     opcode: 'askAIWithSearch',
                //     blockType: BlockType.COMMAND,
                //     text: formatMessage({
                //         id: 'gemini.askAIWithSearch',
                //         default: 'search the web for [QUESTION]',
                //         description: 'Ask AI with web search enabled for current information.'
                //     }),
                //     arguments: {
                //         QUESTION: {
                //             type: ArgumentType.STRING,
                //             defaultValue: 'What is the weather today?'
                //         }
                //     }
                // },
                {
                    opcode: 'aiAnswer',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'gemini.aiAnswer',
                        default: 'AI answer',
                        description: 'Returns the last answer from the AI.'
                    })
                },
                '---',
                
                // --- Profile/Customization ---
                {
                    opcode: 'setAIProfile',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'gemini.setAIProfile',
                        default: 'set AI profile to [PROFILE]',
                        description: 'Tell the AI how to behave (e.g., "be funny", "explain like I\'m 5")'
                    }),
                    arguments: {
                        PROFILE: {
                            type: ArgumentType.STRING,
                            defaultValue: 'be helpful and friendly'
                        }
                    }
                },
                '---',
                
                // --- Status Blocks ---
                {
                    opcode: 'aiIsThinking',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'gemini.aiIsThinking',
                        default: 'AI is thinking?',
                        description: 'Returns true if AI is currently processing a question.'
                    })
                },
                {
                    opcode: 'aiHadError',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'gemini.aiHadError',
                        default: 'AI had error?',
                        description: 'Returns true if the last request had an error.'
                    })
                },
                {
                    opcode: 'clearAI',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'gemini.clearAI',
                        default: 'clear AI response',
                        description: 'Clears the last AI answer and any errors.'
                    })
                },
                "---",
                {
                    opcode: 'findInSentence',
                    blockType: BlockType.COMMAND, // Changed from REPORTER
                    text: formatMessage({
                        id: 'gemini.findInSentence',
                        default: 'find [COMPONENT] in [SENTENCE]',
                        description: 'Finds specific grammar components and stores answer in "AI answer"'
                    }),
                    arguments: {
                        COMPONENT: {
                            type: ArgumentType.STRING,
                            menu: 'grammarMenu'
                        },
                        SENTENCE: {
                            type: ArgumentType.STRING,
                            defaultValue: 'The quick brown fox jumps over the lazy dog'
                        }
                    }
                },// Add to blocks array:
                {
                    opcode: 'phrasesMeanSame',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'gemini.phrasesMeanSame',
                        default: '[PHRASE1] means the same as [PHRASE2]',
                        description: 'Checks if two phrases have similar meaning (synonyms, same intent, related concepts)'
                    }),
                    arguments: {
                        PHRASE1: {
                            type: ArgumentType.STRING,
                            defaultValue: 'I\'m tired'
                        },
                        PHRASE2: {
                            type: ArgumentType.STRING,
                            defaultValue: 'I need sleep'
                        }
                    }
                },
            ], 
            menus: {
                grammarMenu: {
                    items: [
                        { text: 'noun', value: 'noun' },
                        { text: 'verb', value: 'verb' },
                        { text: 'adjective', value: 'adjective' },
                        { text: 'adverb', value: 'adverb' },
                        { text: 'pronoun', value: 'pronoun' },
                        { text: 'preposition', value: 'preposition' },
                        { text: 'conjunction', value: 'conjunction' },
                        { text: 'interjection', value: 'interjection' },
                        { text: 'subject', value: 'subject' },
                        { text: 'object', value: 'object' },
                        { text: 'action word', value: 'action word' },
                        { text: 'describing word', value: 'describing word' },
                        { text: 'person/place/thing', value: 'person/place/thing' }
                    ]
                }
            }
        };
    }

    // ------------------------------------------------------------------
    // PROFILE SETTING
    // ------------------------------------------------------------------
    
    setAIProfile(args) {
        this.userProfile = Cast.toString(args.PROFILE).trim();
        console.log(`M3D Gemini: AI profile set to "${this.userProfile}"`);
    }
    
    // ------------------------------------------------------------------
    // AI REQUEST BLOCKS
    // ------------------------------------------------------------------
    
    async askAI(args) {
        return this._makeAIRequest(args.QUESTION, false);
    }
    
    async askAIWithSearch(args) {
        return this._makeAIRequest(args.QUESTION, true);
    }
    async _makeAIRequest(question, useSearch) {
        const questionText = Cast.toString(question);
        
        if (!questionText.trim()) {
            this.lastError = 'Question cannot be empty';
            this.lastResponse = '';
            return;
        }
        
        this.isLoading = true;
        this.lastError = '';
        
        // Build the full system instruction
        let systemInstruction = this.BASE_CONTEXT;
        if (this.userProfile) {
            systemInstruction += ` The user additionally wants you to be: ${this.userProfile}`;
        }
        
        console.log(`M3D Gemini: Asking AI: "${questionText.substring(0, 50)}..."`);
        
        // Prepare headers
        const headers = {
            'Content-Type': 'application/json',
            'X-Secret-Key': this.SECRET_KEY
        };
        
        // Add session ID header if we have one from previous response
        if (this.sessionId) {
            headers['X-Session-ID'] = this.sessionId;
            console.log(`M3D Gemini: Using session ID: ${this.sessionId}`);
        } else {
            console.log('M3D Gemini: First request, no session ID yet');
        }
        
        try {
            const response = await fetch(`${this.SERVER_URL}/generate`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    prompt: questionText,
                    systemInstruction: systemInstruction,
                    useSearch: useSearch
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.lastResponse = data.text || '';
                
                // Store session ID from response for next request
                if (data.sessionId) {
                    this.sessionId = data.sessionId;
                    console.log(`M3D Gemini: Received new session ID: ${this.sessionId}`);
                }
                
                console.log(`M3D Gemini: AI response received (${this.lastResponse.length} chars)`);
            } else {
                this.lastError = data.message || `Server error: ${response.status}`;
                this.lastResponse = '';
                console.error(`M3D Gemini: AI error: ${this.lastError}`);
            }
        } catch (error) {
            this.lastError = `Network error: ${error.message}`;
            this.lastResponse = '';
            console.error(`M3D Gemini: Request failed: ${error.message}`);
        } finally {
            this.isLoading = false;
        }
    }

    // ------------------------------------------------------------------
    // RESPONSE & STATUS BLOCKS
    // ------------------------------------------------------------------
    
    aiAnswer() {
        return this.lastResponse || '';
    }
    
    aiIsThinking() {
        return this.isLoading;
    }
    
    aiHadError() {
        return !!this.lastError;
    }
    
    clearAI() {
        this.lastResponse = '';
        this.lastError = '';
        console.log('M3D Gemini: Cleared AI response and error');
    }
    async findInSentence(args) {
        const component = Cast.toString(args.COMPONENT);
        const sentence = Cast.toString(args.SENTENCE).trim();
        
        if (!sentence) {
            this.lastError = 'Please enter a sentence first!';
            this.lastResponse = '';
            return;
        }
        
        // Save current profile to restore later
        const originalProfile = this.userProfile;
        
        // Set temporary context for grammar analysis
        this.userProfile = 'a grammar expert. Identify ONLY the specific part of speech requested. Return JUST the word(s), no explanations. If multiple, separate with commas. If none found, return "none".';
        
        // Map kid-friendly terms to grammar terms
        const componentMap = {
            'action word': 'verb',
            'describing word': 'adjective',
            'person/place/thing': 'noun',
            // Others use the same term
        };
        
        const grammarTerm = componentMap[component] || component;
        
        const question = `Find all ${grammarTerm}s in this sentence: "${sentence}"`;
        
        console.log(`M3D Gemini: Finding ${grammarTerm} in: "${sentence}"`);
        
        // This will automatically save to this.lastResponse
        await this._makeAIRequest(question, false);
        
        // Restore original profile
        this.userProfile = originalProfile;
        
        // No return needed - answer is in this.lastResponse for "AI answer" block
    }
    // Add the implementation:
    async phrasesMeanSame(args) {
        const phrase1 = Cast.toString(args.PHRASE1).trim();
        const phrase2 = Cast.toString(args.PHRASE2).trim();
        
        if (!phrase1 || !phrase2) {
            return false;
        }
        
        // Quick check: if they're exactly the same (case-insensitive)
        if (phrase1.toLowerCase() === phrase2.toLowerCase()) {
            return true;
        }
        
        // Save current state
        const originalProfile = this.userProfile;
        const originalResponse = this.lastResponse;
        const originalError = this.lastError;
        
        // Set context for semantic comparison
        const comparisonContext = `You are a language understanding expert. Compare if two phrases have similar meaning, intent, or describe the same thing. Consider:
        1. Synonyms and related words (e.g., "happy" and "joyful")
        2. Same intent/meaning in different words (e.g., "I'm gonna sleep" and "I'm going to crash" both mean going to bed)
        3. Category relationships (e.g., "orange" is a type of "citrus", "dog" is a type of "animal")
        4. Informal/slang equivalents (e.g., "cool" and "awesome")
        
        Return ONLY "true" if they have similar meaning or are closely related.
        Return ONLY "false" if they are different or unrelated.
        No explanations.`;
        
        this.userProfile = comparisonContext;
        
        const question = `Do these have similar meaning or are they closely related? Answer only true or false.
        
        Phrase 1: "${phrase1}"
        Phrase 2: "${phrase2}"`;
        
        console.log(`M3D Gemini: Comparing meaning: "${phrase1}" vs "${phrase2}"`);
        
        await this._makeAIRequest(question, false);
        
        const aiResponse = this.lastResponse.toLowerCase().trim();
        
        // Restore original state
        this.userProfile = originalProfile;
        this.lastResponse = originalResponse;
        this.lastError = originalError;
        
        // Parse response
        const truePatterns = ['true', 'yes', 'similar', 'same meaning', 'related', 'equivalent', 'synonym'];
        const falsePatterns = ['false', 'no', 'different', 'unrelated', 'not similar', 'not the same'];
        
        // Check for true patterns first
        for (const pattern of truePatterns) {
            if (aiResponse.includes(pattern)) {
                console.log(`M3D Gemini: Phrases mean the SAME (matched: ${pattern})`);
                return true;
            }
        }
        
        // Check for false patterns
        for (const pattern of falsePatterns) {
            if (aiResponse.includes(pattern)) {
                console.log(`M3D Gemini: Phrases mean DIFFERENT (matched: ${pattern})`);
                return false;
            }
        }
        
        // If response is just "true" or "false" (exact match)
        if (aiResponse === 'true' || aiResponse === 'yes') {
            return true;
        }
        if (aiResponse === 'false' || aiResponse === 'no') {
            return false;
        }
        
        // Default to false if unclear
        console.log(`M3D Gemini: Could not determine, defaulting to false. AI said: "${aiResponse}"`);
        return false;
    }
}

module.exports = M3DGeminiAI;