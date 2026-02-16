import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import styles from './jugnu-chat.css';

class JugnuChat extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            input: '',
            history: [],
            isThinking: false,
            isExecuting: false // Tracks if blocks are currently being placed
        };
        
        this.onChange = this.onChange.bind(this);
        this.onSend = this.onSend.bind(this);
        this.scrollToBottom = this.scrollToBottom.bind(this);
        this.callLLMAPI = this.callLLMAPI.bind(this);
        this.llmActionHistory = ""; // Now a rolling summary string instead of an array
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.state.history.length > prevState.history.length || this.state.isThinking !== prevState.isThinking) {
            this.scrollToBottom();
        }
    }

    scrollToBottom() {
        if (this.messagesEnd) {
            this.messagesEnd.scrollIntoView({ behavior: 'smooth' });
        }
    }

    onChange(e) {
        this.setState({ input: e.target.value });
    }
 // --- Updated System Prompt ---
 // --- Updated System Prompt ---
    getSystemInstruction() {
        return `You are an expert AI coding assistant, integrated directly into a custom Scratch 3.0 workspace, called JugnuAI. Your goal is to help users build, modify, and debug their block-based code.

### WHAT YOU GET
You are given a prompt, a question, or a request. You will also receive a JSON state of the current Scratch workspace, including all sprites, VARIABLES, blocks, and their connections. You also receive an 'actionHistory' string containing a condensed but comprehensve summary of your recent actions.

### YOUR BEHAVIOR & LIMITATIONS
1. PREFER MODIFICATION: Prefer modifying existing blocks (using MODIFY_INPUT) rather than deleting and replacing entire chains.
2. HANDLING INABILITY: If a user asks for something impossible in Scratch, outside your capabilities, or unsafe, you MUST NOT emit any code actions. Only use 'REPLY_IN_CHAT' to politely explain why you cannot fulfill the request.
3. HISTORY TRACKING: Every time you successfully modify the workspace, you MUST include an 'UPDATE_HISTORY' action to rewrite the rolling summary string.

### YOUR OUTPUT FORMAT
You must respond EXCLUSIVELY with a JSON array of action objects. Do not include plain text outside the JSON array.

#### Action 0: REPLY_IN_CHAT (MUST BE FIRST)
Talk to the user. Keep it brief if you are changing code.
Payload shape: { "action": "REPLY_IN_CHAT", "payload": { "message": "I added the speed variable!" } }

#### Action 1: UPDATE_HISTORY (USE ON EVERY CODE CHANGE)
Rewrite the action history. You must combine the existing 'actionHistory' string with your new actions into a single, continuous summary string. You MUST keep the total length under 50 words. Drop older or less relevant details to save space.
Payload shape: { "action": "UPDATE_HISTORY", "payload": { "summary": "Created Gravity var. Added jump script. Changed speed to 10." } }

#### Action 2: CREATE_VARIABLE
Creates a new variable in the VM. Invent a unique ID (e.g., "var_speed").
Payload shape: { "action": "CREATE_VARIABLE", "payload": { "id": "var_speed", "name": "Speed", "value": 10 } }

#### Action 3: SET_VARIABLE_VALUE
Hot-swaps a variable's value directly in memory instantly without blocks.
Payload shape: { "action": "SET_VARIABLE_VALUE", "payload": { "id": "existing_var_id", "value": 50 } }

#### Action 4: INSERT_CHAIN
Used to add new blocks. 
* Top-Level (Hats): Provide 'x' and 'y', omit 'afterBlockId' and 'insideInputOf'.
* Sequential: Use 'afterBlockId' to attach below another block.
* Nested: Use 'insideInputOf': { "blockId": "parent_id", "inputName": "SUBSTACK" }.
* Note on Variable Blocks: If adding a 'data_setvariableto' or 'data_changevariableby' block, you must map the field like this: "fields": { "VARIABLE": { "name": "VARIABLE", "id": "var_speed", "value": "Speed" } }

#### Action 5: MODIFY_INPUT & Action 6: DELETE_CHAIN
(Standard rules apply: MODIFY_INPUT takes 'blockId', 'inputName', 'newValue'. DELETE_CHAIN takes 'blockId', 'heal').

### USAGE EXAMPLES
User Prompt: "If the IR sensor 1 value is greater than 50, say Hi."
Expected Output:
[
  {
    "action": "REPLY_IN_CHAT",
    "payload": { "message": "I have created the sensor check for you!" }
  },
  {
    "action": "UPDATE_HISTORY",
    "payload": { "summary": "Added an if-statement checking if readIR0 > 50 to say Hi." }
  },
  {
    "action": "INSERT_CHAIN",
    "payload": { "id": "llm_if", "opcode": "control_if", "inputs": {}, "x": 150, "y": 150 }
  },
  {
    "action": "INSERT_CHAIN",
    "payload": { "id": "llm_gt", "opcode": "operator_gt", "inputs": { "OPERAND2": 50 }, "insideInputOf": { "blockId": "llm_if", "inputName": "CONDITION" } }
  },
  {
    "action": "INSERT_CHAIN",
    "payload": { "id": "llm_ir", "opcode": "goCore_readIR0", "inputs": {}, "insideInputOf": { "blockId": "llm_gt", "inputName": "OPERAND1" } }
  },
  {
    "action": "INSERT_CHAIN",
    "payload": { "id": "llm_say", "opcode": "looks_say", "inputs": { "MESSAGE": "Hi" }, "insideInputOf": { "blockId": "llm_if", "inputName": "SUBSTACK" } }
  }
]

### CRITICAL RULES - STRICTLY ENFORCED
1. NO SCRATCH INTERNAL FORMATS: Never use Scratch's internal array format for inputs (e.g., DO NOT USE [1, [10, "hi"]]). Use flat values ("inputs": { "MESSAGE": "hi" }).
2. NO SHADOW BLOCKS: Never manually generate 'math_number' or 'text' blocks.
3. NO BLOCKS ARRAYS: Never nest multiple blocks inside a "blocks": [] array. Every block must be its own independent 'INSERT_CHAIN' action.
4. NO SB3: Absolutely do not output standard Scratch .sb3 JSON.
5. When creating multiple chains, spawn them at different positions so that they don't overlap.
`;
    }

    //Make this sprite tell a joke and then move to the left a  bit when I press the flag.
    
    async callLLMAPI(userPrompt) {
        let compiledPayload = "";
        
        if (window.llmAgent && typeof window.llmAgent.compilePromptPayload === 'function') {
            const workspaceState = window.llmAgent.compilePromptPayload();
            compiledPayload = `\n\n### CURRENT WORKSPACE STATE:\n${JSON.stringify(workspaceState)}`;
        }

        const finalPrompt = userPrompt + compiledPayload;

        try {
            const res = await fetch('https://chat.markhor3d.com/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-secret-key': '218a75af-c7a9-454b-9a01-252e29ba330a',
                },
                body: JSON.stringify({
                    prompt: finalPrompt,
                    engine: 'GEMINI', 
                    systemInstruction: this.getSystemInstruction(),
                    useSearch: false
                })
            });

            if (!res.ok) throw new Error(`API Error: ${res.status}`);
            
            const data = await res.json();
            return data.response || data.text || data.reply || JSON.stringify(data);

        } catch (error) {
            console.error("LLM API Call Failed:", error);
            throw error;
        }
    }

    async onSend() {
        const { input } = this.state;
        const trimmedInput = input.trim();
        if (!trimmedInput) return;
        
        const userMsg = { from: 'user', text: trimmedInput, id: Date.now() };
        this.setState(({ history }) => ({ 
            history: [...history, userMsg], 
            input: '',
            isThinking: true 
        }));

        try {
            const rawReply = await this.callLLMAPI(trimmedInput);
            
            // 1. Sanitize the LLM output (strip markdown if it returned ```json ... ```)
            const cleanText = rawReply.replace(/```json/gi, '').replace(/```/g, '').trim();
            
            console.log('LLM Said: ', cleanText);
            let instructionSet;
            try {
                instructionSet = JSON.parse(cleanText);
            } catch (e) {
                // Fallback: If the LLM failed to output JSON, treat the whole response as a chat message
                instructionSet = [{ action: 'REPLY_IN_CHAT', payload: { message: cleanText } }];
            }

            // 2. Extract the chat messages and the code instructions
            const chatReplies = instructionSet.filter(inst => inst.action === 'REPLY_IN_CHAT');
            const codeInstructions = instructionSet.filter(inst => inst.action !== 'REPLY_IN_CHAT');

            // 3. Display the chat message immediately
            let combinedMessage = chatReplies.map(r => r.payload.message).join('\n\n');
            if (!combinedMessage && codeInstructions.length > 0) {
                combinedMessage = "Applying changes to your workspace...";
            }

            const agentMsg = { 
                from: 'agent', 
                text: combinedMessage, 
                id: Date.now() + 1
            };

            this.setState(({ history }) => ({ 
                history: [...history, agentMsg],
                isThinking: false,
                isExecuting: codeInstructions.length > 0
            }));

            // 4. Pass the code instructions to the VM Agent
            if (codeInstructions.length > 0 && window.llmAgent) {
                await window.llmAgent.executeInstructions(codeInstructions);
                // Turn off executing state
                this.setState({ isExecuting: false });
            }

        } catch (e) {
            const errMsg = { from: 'agent', text: 'Error: ' + e.message, id: Date.now() + 2 };
            this.setState(({ history }) => ({ history: [...history, errMsg], isThinking: false, isExecuting: false }));
        }
    }

    render() {
        const { input, history, isThinking, isExecuting } = this.state;
        
        return (
            <div className={styles.jugnuChatWrap}>
                <div className={styles.header}>
                    <div className={styles.headerTitle}>
                        <span>✨</span> JugnuAI
                    </div>
                </div>

                <div className={styles.messagesContainer}>
                    {history.length === 0 ? (
                        <div className={styles.emptyState}>
                            <h2>How can I help you code today?</h2>
                            <p>Ask me to generate blocks, modify your sprites, or explain logic.</p>
                        </div>
                    ) : (
                        history.map(m => (
                            <div key={m.id} className={classNames(styles.messageRow, m.from === 'user' ? styles.rowUser : styles.rowAgent)}>
                                <div className={styles.messageAvatar}>
                                    {m.from === 'user' ? 'U' : '✨'}
                                </div>
                                <div className={styles.messageContent}>
                                    {/* Render plain text immediately, no typewriter */}
                                    {m.text}
                                </div>
                            </div>
                        ))
                    )}
                    
                    {isThinking && (
                        <div className={classNames(styles.messageRow, styles.rowAgent)}>
                            <div className={styles.messageAvatar}>✨</div>
                            <div className={styles.messageContent}>
                                <span className={styles.thinkingDots}>
                                    <span>.</span><span>.</span><span>.</span>
                                </span>
                            </div>
                        </div>
                    )}

                    {isExecuting && !isThinking && (
                        <div className={styles.disclaimer} style={{ marginTop: 0, paddingBottom: '10px' }}>
                            <span className={styles.thinkingDots}>
                                Building blocks<span>.</span><span>.</span><span>.</span>
                            </span>
                        </div>
                    )}
                    
                    <div ref={(el) => { this.messagesEnd = el; }} />
                </div>

                <div className={styles.inputArea}>
                    <div className={styles.inputWrapper}>
                        <input
                            className={styles.inputField}
                            value={input}
                            onChange={this.onChange}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !isThinking && !isExecuting) this.onSend(); }}
                            placeholder={isThinking || isExecuting ? "JugnuAI is busy..." : "Message JugnuAI..."}
                            disabled={isThinking || isExecuting}
                        />
                        <button 
                            className={classNames(styles.sendBtn, { [styles.sendActive]: input.trim().length > 0 && !isThinking && !isExecuting })} 
                            onClick={this.onSend}
                            disabled={isThinking || isExecuting}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                    <div className={styles.disclaimer}>
                        JugnuAI can manipulate your workspace. Please verify logic before running.
                    </div>
                </div>
            </div>
        );
    }
}

JugnuChat.propTypes = {
    className: PropTypes.string
};

export default JugnuChat;