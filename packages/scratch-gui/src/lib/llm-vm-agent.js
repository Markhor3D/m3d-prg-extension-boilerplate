class LLMVMAgent {
    /**
     * Initialize the LLM VM Agent
     * @param {VirtualMachine} vm - The Scratch VM instance
     */
    constructor(vm) {
        this.vm = vm;
        this.runtime = vm.runtime;
        this.llmActionHistory = ""; // a rolling summary string of recent LLM-driven changes for context in future prompts

        // Run dummy tests after 2 seconds to confirm API is operational
        setTimeout(() => this._runDummyTests(), 5000);
    }
compilePromptPayload() {
        if (!this.vm || !this.vm.editingTarget) return {};

        const target = this.vm.editingTarget;
        
        // 1. Extract Variables
        const variables = Object.values(target.variables).map(v => ({
            id: v.id,
            name: v.name,
            value: v.value,
            type: v.type // '' for scalar, 'list' for arrays
        }));

        // 2. Extract Rich Extension Block Metadata
        const extensionBlocks = [];
        
        if (this.vm.runtime && this.vm.runtime._blockInfo) {
            // Just use Object.values to get the extension info objects directly
            const extensions = Object.values(this.vm.runtime._blockInfo);
            
            for (const extInfo of extensions) {
                if (extInfo && Array.isArray(extInfo.blocks)) {
                    // Grab the true extension ID directly from the info object (e.g., 'goCore')
                    const actualExtId = extInfo.id; 
                    
                    for (const blockWrapper of extInfo.blocks) {
                        const block = blockWrapper.info || blockWrapper; 
                        
                        if (block && block.opcode) {
                            // Safely build the prefix
                            const prefix = actualExtId ? `${actualExtId}_` : '';
                            
                            // Append the prefix if it isn't already there
                            const fullOpcode = block.opcode.startsWith(prefix) 
                                ? block.opcode 
                                : `${prefix}${block.opcode}`;
                                
                            extensionBlocks.push({
                                category: extInfo.name || actualExtId || 'Custom Extension',
                                opcode: fullOpcode,
                                text: block.text || '', 
                                arguments: Object.keys(block.arguments || {})
                            });
                        }
                    }
                }
            }
        }

        // 3. Package the Payload
        return {
            activeTargetId: target.id,
            activeTargetName: target.getName(),
            actionHistory: this.llmActionHistory, 
            variables: variables,                 
            availableExtensions: extensionBlocks, 
            blocks: target.blocks._blocks         
        };
    }

    /**
     * Gathers all data for a specific target (sprite or stage)
     * @param {RenderedTarget} target 
     * @returns {Object} Target data including variables and code chains
     */
    getTargetData(target) {
        return {
            id: target.id,
            name: target.sprite.name,
            isStage: target.isStage,
            variables: Object.values(target.variables).map(v => ({
                id: v.id,
                name: v.name,
                type: v.type, 
                value: v.value
            })),
            scripts: this.getASTForTarget(target)
        };
    }

    /**
     * Parses the raw blocks of a target into an LLM-friendly AST
     * @param {RenderedTarget} target 
     * @returns {Array} Array of script chains
     */
    getASTForTarget(target) {
        const allBlocks = target.blocks._blocks;

        const traverse = (startId) => {
            const sequence = [];
            let currentId = startId;

            while (currentId && allBlocks[currentId]) {
                const block = allBlocks[currentId];
                const node = {
                    id: block.id,
                    opcode: block.opcode,
                    inputs: {},
                    fields: block.fields
                };

                for (const [inputName, inputObj] of Object.entries(block.inputs)) {
                    const childId = inputObj.block;
                    if (!childId || !allBlocks[childId]) continue;

                    const childBlock = allBlocks[childId];
                    if (childBlock.shadow) {
                        const fieldVal = Object.values(childBlock.fields)[0];
                        node.inputs[inputName] = fieldVal ? fieldVal.value : null;
                    } else {
                        node.inputs[inputName] = traverse(childId);
                    }
                }

                sequence.push(node);
                currentId = block.next;
            }
            return sequence;
        };

        const roots = Object.values(allBlocks).filter(b => b.topLevel && !b.shadow);
        
        return roots.map(root => ({
            rootId: root.id,
            sequence: traverse(root.id)
        }));
    }
    /**
     * Compiles a descriptive list of available blocks for the LLM
     * @returns {Object} Dictionary of categories and their block signatures
     */
    getAvailableOpcodes() {
        const dictionary = {};

        // 1. Parse rich block info (Extensions & GUI-registered blocks)
        if (this.runtime._blockInfo) {
            this.runtime._blockInfo.forEach(category => {
                if (!category.id || !category.blocks) return;

                const blocks = [];
                category.blocks.forEach(block => {
                    const info = block.info;
                    // Skip separators and internal/hidden blocks
                    if (!info || info.hideFromPalette) return; 

                    // Simplify arguments to just Name -> Type for the LLM
                    const args = {};
                    if (info.arguments) {
                        for (const [key, val] of Object.entries(info.arguments)) {
                            args[key] = val.type; // e.g., "number", "string", "boolean"
                        }
                    }

                    blocks.push({
                        opcode: info.opcode,
                        text: info.text,         // The human-readable label
                        type: info.blockType,    // 'command', 'reporter', 'boolean', 'hat'
                        args: Object.keys(args).length > 0 ? args : undefined
                    });
                });

                if (blocks.length > 0) {
                    dictionary[category.id] = blocks;
                }
            });
        }

        // 2. Fallback for raw internal primitives not mapped in _blockInfo
        dictionary._rawPrimitives = Object.keys(this.runtime._primitives);

        return dictionary;
    }

    // --- STATE MANAGEMENT (Legacy/Simple AST) ---

    getState() {
        if (!this.vm || !this.vm.editingTarget) return { error: "No active target found." };
        return {
            targetId: this.vm.editingTarget.id,
            targetName: this.vm.editingTarget.sprite.name,
            ast: this.getASTForTarget(this.vm.editingTarget)
        };
    }

    printState() {
        const state = this.getState();
        console.log('=== LLM VM Agent State ===');
        console.log(JSON.stringify(state, null, 2));
    }

    // --- EXECUTION ENGINE (API -> VM) ---
// --- EXECUTION ENGINE (API -> VM) ---

    /**
     * Dispatcher for the LLM instruction set payload
     * @param {Array} instructionSet - Array of JSON operations requested by the LLM
     *//**
     * Dispatcher for the LLM instruction set payload
     * @param {Array} instructionSet - Array of JSON operations requested by the LLM
     */
    async executeInstructions(instructionSet) {
        if (!this.vm || !this.vm.editingTarget) return false;

        for (const instruction of instructionSet) {
            // Skip chat replies; the UI handles those
            if (instruction.action === 'REPLY_IN_CHAT') continue;

            try {
                switch (instruction.action) {
                    case 'INSERT_CHAIN':
                        this._insertChain(instruction.payload);
                        break;
                    case 'DELETE_CHAIN':
                        this._deleteChain(instruction.payload);
                        break;
                    case 'MODIFY_INPUT':
                        this._modifyInput(instruction.payload);
                        break;
                    // --- NEW CASES BELOW ---
                    case 'CREATE_VARIABLE':
                        this._createVariable(instruction.payload);
                        break;
                    case 'SET_VARIABLE_VALUE':
                        this._setVariableValue(instruction.payload);
                        break;
                    case 'UPDATE_HISTORY':
                        this._updateHistory(instruction.payload);
                        break;
                    default:
                        console.warn(`Unknown LLM action: ${instruction.action}`);
                }

                // Force the GUI to re-render immediately after this single block is placed
                this.vm.emitWorkspaceUpdate();
                
                // Wait 200ms before applying the next instruction to create an animation effect
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (err) {
                console.error(`Error executing LLM action [${instruction.action}]:`, err);
            }
        }

        return true;
    }

    /**
     * Helper to generate a unique ID for new blocks
     */
    _generateId() {
        return 'llm_' + Math.random().toString(36).substring(2, 11);
    }
/**
     * Dynamically builds the menu map by combining native Scratch menus
     * with loaded custom M3D extension menus.
     */
    _getDynamicMenuMap() {
        // 1. The hardcoded vanilla Scratch map
        const menuMap = {
            // --- MOTION ---
            'motion_pointtowards': { 'TOWARDS': { type: 'shadow', shadowOpcode: 'motion_pointtowards_menu', fieldName: 'TOWARDS' } },
            'motion_goto': { 'TO': { type: 'shadow', shadowOpcode: 'motion_goto_menu', fieldName: 'TO' } },
            'motion_glideto': { 'TO': { type: 'shadow', shadowOpcode: 'motion_glideto_menu', fieldName: 'TO' } },

            // --- LOOKS ---
            'looks_switchcostumeto': { 'COSTUME': { type: 'shadow', shadowOpcode: 'looks_costume', fieldName: 'COSTUME' } },
            'looks_switchbackdropto': { 'BACKDROP': { type: 'shadow', shadowOpcode: 'looks_backdrops', fieldName: 'BACKDROP' } },
            'looks_changeeffectby': { 'EFFECT': { type: 'field' } },
            'looks_seteffectto': { 'EFFECT': { type: 'field' } },
            'looks_gotofrontback': { 'FRONT_BACK': { type: 'field' } },
            'looks_goforwardbackwardlayers': { 'FORWARD_BACKWARD': { type: 'field' } },
            'looks_costumenumbername': { 'NUMBER_NAME': { type: 'field' } },
            'looks_backdropnumbername': { 'NUMBER_NAME': { type: 'field' } },

            // --- SOUND ---
            'sound_play': { 'SOUND_MENU': { type: 'shadow', shadowOpcode: 'sound_sounds_menu', fieldName: 'SOUND_MENU' } },
            'sound_playuntildone': { 'SOUND_MENU': { type: 'shadow', shadowOpcode: 'sound_sounds_menu', fieldName: 'SOUND_MENU' } },
            'sound_changeeffectby': { 'EFFECT': { type: 'field' } },
            'sound_seteffectto': { 'EFFECT': { type: 'field' } },

            // --- EVENTS ---
            'event_whenkeypressed': { 'KEY_OPTION': { type: 'field' } },
            'event_whenbackdropswitchesto': { 'BACKDROP': { type: 'field' } },
            'event_whengreaterthan': { 'WHENGREATERTHANMENU': { type: 'field' } },
            'event_broadcast': { 'BROADCAST_OPTION': { type: 'shadow', shadowOpcode: 'event_broadcast_menu', fieldName: 'BROADCAST_OPTION' } },
            'event_broadcastandwait': { 'BROADCAST_OPTION': { type: 'shadow', shadowOpcode: 'event_broadcast_menu', fieldName: 'BROADCAST_OPTION' } },

            // --- CONTROL ---
            'control_create_clone_of': { 'CLONE_OPTION': { type: 'shadow', shadowOpcode: 'control_create_clone_of_menu', fieldName: 'CLONE_OPTION' } },
            'control_stop': { 'STOP_OPTION': { type: 'field' } },

            // --- SENSING ---
            'sensing_touchingobject': { 'TOUCHINGOBJECTMENU': { type: 'shadow', shadowOpcode: 'sensing_touchingobjectmenu', fieldName: 'TOUCHINGOBJECTMENU' } },
            'sensing_distanceto': { 'DISTANCETOMENU': { type: 'shadow', shadowOpcode: 'sensing_distancetomenu', fieldName: 'DISTANCETOMENU' } },
            'sensing_keypressed': { 'KEY_OPTION': { type: 'shadow', shadowOpcode: 'sensing_keyoptions', fieldName: 'KEY_OPTION' } },
            'sensing_of': { 
                'PROPERTY': { type: 'field' }, 
                'OBJECT': { type: 'shadow', shadowOpcode: 'sensing_of_object_menu', fieldName: 'OBJECT' } 
            },

            // --- OPERATORS ---
            'operator_mathop': { 'OPERATOR': { type: 'field' } }
        };

        // 2. Dynamically append extension menus at runtime
        if (this.vm && this.vm.runtime && this.vm.runtime._blockInfo) {
            const extensions = Object.values(this.vm.runtime._blockInfo);
            
            for (const ext of extensions) {
                if (ext && ext.menus && Array.isArray(ext.blocks)) {
                    const extId = ext.id;

                    for (const blockWrapper of ext.blocks) {
                        const block = blockWrapper.info || blockWrapper;
                        
                        if (block.opcode && block.arguments) {
                            const fullOpcode = block.opcode.startsWith(`${extId}_`) ? block.opcode : `${extId}_${block.opcode}`;
                            
                            // Check if any arguments require a menu
                            for (const [argName, argData] of Object.entries(block.arguments)) {
                                if (argData.menu) {
                                    if (!menuMap[fullOpcode]) menuMap[fullOpcode] = {};
                                    
                                    // Based on your JSON, Scratch extension shadow blocks are formatted like: "extId_menu_menuName"
                                    menuMap[fullOpcode][argName] = {
                                        type: 'shadow',
                                        shadowOpcode: `${extId}_menu_${argData.menu}`,
                                        fieldName: argData.menu
                                    };
                                }
                            }
                        }
                    }
                }
            }
        }

        return menuMap;
    }
    /**
     * Handles injecting a block. Automatically generates shadow inputs and heals pointers.
     * Payload shape: { opcode: "...", inputs: {"STEPS": 10}, afterBlockId: "xyz" }
     */
    _insertChain(payload) {
        // --- HALLUCINATION CATCHES ---
        if (payload.parent && payload.inputName && !payload.insideInputOf) {
            payload.insideInputOf = { blockId: payload.parent, inputName: payload.inputName };
        }
        if (payload.blocks && Array.isArray(payload.blocks)) {
            let previousId = null;
            for (const b of payload.blocks) {
                const subPayload = { ...b, x: payload.x || b.x, y: payload.y || b.y, afterBlockId: previousId || b.parent || null };
                this._insertChain(subPayload);
                previousId = b.id || b.blockId;
            }
            return;
        }

        if (!payload.opcode) return;

        const blocks = this.vm.editingTarget.blocks;
        const newBlockId = payload.id || payload.blockId || this._generateId();
        const isTopLevel = !payload.afterBlockId && !payload.insideInputOf;
        const initialParent = payload.afterBlockId || (payload.insideInputOf ? payload.insideInputOf.blockId : null);

        const parentBlock = {
            id: newBlockId,
            opcode: payload.opcode,
            inputs: {},
            fields: {}, // We will populate this dynamically
            next: null,
            topLevel: isTopLevel,
            parent: initialParent,
            shadow: false,
            x: payload.x || 150,
            y: payload.y || 150
        };

        // --- THE UNIVERSAL MENU MAPPER ---
        // This dictionary knows exactly how Scratch 3.0 handles every dropdown menu.
        const SCRATCH_MENU_MAP = this._getDynamicMenuMap();

        // Normalize inputs (move hallucinated fields back to inputs so we can process them)
        payload.inputs = payload.inputs || {};
        if (payload.fields) {
            for (const [key, val] of Object.entries(payload.fields)) {
                if (key !== 'VARIABLE' && key !== 'LIST') {
                    payload.inputs[key] = val.value || val;
                } else {
                    parentBlock.fields[key] = val; // Preserve actual Scratch Variables
                }
            }
        }

        // Process all inputs through the Mapper
        for (const [inputName, rawInputValue] of Object.entries(payload.inputs)) {
            let inputValue = rawInputValue;
            if (Array.isArray(inputValue)) inputValue = Array.isArray(inputValue[1]) ? inputValue[1][1] : (inputValue[1] || inputValue[0]);

            const blockMapping = SCRATCH_MENU_MAP[payload.opcode];
            const inputMapping = blockMapping ? blockMapping[inputName] : null;

            // Scenario A: It's a native Field (like 'pitch' or 'loudness')
            if (inputMapping && inputMapping.type === 'field') {
                parentBlock.fields[inputName] = { name: inputName, value: String(inputValue) };
            } 
            // Scenario B: It requires a Shadow Block (Text, Number, or Menu)
            else {
                const shadowId = this._generateId();
                let shadowOpcode, fieldName;

                if (inputMapping && inputMapping.type === 'shadow') {
                    shadowOpcode = inputMapping.shadowOpcode;
                    fieldName = inputMapping.fieldName;
                } else {
                    // Fallback for standard text and numbers
                    const isNum = !isNaN(inputValue) && inputValue !== "";
                    shadowOpcode = isNum ? 'math_number' : 'text';
                    fieldName = isNum ? 'NUM' : 'TEXT';
                }

                const shadowBlock = {
                    id: shadowId,
                    opcode: shadowOpcode,
                    inputs: {},
                    fields: { [fieldName]: { name: fieldName, value: String(inputValue) } },
                    next: null,
                    topLevel: false,
                    parent: newBlockId,
                    shadow: true
                };
                
                blocks.createBlock(shadowBlock);
                parentBlock.inputs[inputName] = { name: inputName, block: shadowId, shadow: shadowId };
            }
        }

        blocks.createBlock(parentBlock);

        // Splice into chain
        if (payload.afterBlockId) {
            const targetBlock = blocks.getBlock(payload.afterBlockId);
            if (targetBlock) {
                const oldNextId = targetBlock.next;
                targetBlock.next = newBlockId;
                parentBlock.parent = payload.afterBlockId;
                parentBlock.next = oldNextId;
                if (oldNextId) blocks.getBlock(oldNextId).parent = newBlockId;
            }
        } else if (payload.insideInputOf) {
            const parentCBlock = blocks.getBlock(payload.insideInputOf.blockId);
            const inputName = payload.insideInputOf.inputName;
            if (parentCBlock) {
                parentBlock.parent = parentCBlock.id;
                parentCBlock.inputs[inputName] = { name: inputName, block: newBlockId, shadow: null };
            }
        }
    }

    /**
     * Removes a block and optionally connects the block above it to the block below it.
     * Payload shape: { blockId: "xyz", heal: true }
     */
    _deleteChain(payload) {
        const blocks = this.vm.editingTarget.blocks;
        const targetBlock = blocks.getBlock(payload.blockId);
        
        if (!targetBlock) return;

        const parentId = targetBlock.parent;
        const nextId = targetBlock.next;

        // If 'heal' is true, bypass the deleted block and stitch the chain back together
        if (payload.heal && parentId) {
            const parentBlock = blocks.getBlock(parentId);
            let isInsideCBlock = false;
            
            // Check if this block was inside an input (like inside an IF/ELSE SUBSTACK)
            for (const [inputName, inputData] of Object.entries(parentBlock.inputs)) {
                if (inputData.block === payload.blockId) {
                    inputData.block = nextId; // Connect the C-block directly to the next block
                    isInsideCBlock = true;
                    break;
                }
            }

            // If it's a standard vertical stack connection
            if (!isInsideCBlock) {
                blocks.changeBlock({
                    id: parentId,
                    element: 'nextConnection',
                    value: nextId || null
                });
            }
            
            // Update the trailing block's parent pointer
            if (nextId) {
                const nextBlock = blocks.getBlock(nextId);
                if (nextBlock) nextBlock.parent = parentId;
            }
        }

        // Execute the deletion. The VM automatically cleans up attached shadow blocks.
        blocks.deleteBlock(payload.blockId);
    }

    /**
     * Updates an inline value (like text or numbers) without replacing the whole block.
     * Payload shape: { blockId: "xyz", inputName: "STEPS", newValue: 50 }
     */
    _modifyInput(payload) {
        const blocks = this.vm.editingTarget.blocks;
        const targetBlock = blocks.getBlock(payload.blockId);
        
        if (!targetBlock || !targetBlock.inputs[payload.inputName]) return;

        // Get the ID of the shadow block (the actual bubble holding the value)
        const shadowId = targetBlock.inputs[payload.inputName].block;
        const shadowBlock = blocks.getBlock(shadowId);
        
        if (shadowBlock && shadowBlock.shadow) {
            // Find the active field (usually 'NUM' or 'TEXT') dynamically
            const fieldNames = Object.keys(shadowBlock.fields);
            if (fieldNames.length > 0) {
                const fieldName = fieldNames[0];
                
                // Use the official VM mutation method
                blocks.changeBlock({
                    id: shadowId,
                    element: 'field',
                    name: fieldName,
                    value: String(payload.newValue)
                });
            }
        }
    }
    /**
     * Creates a new Scratch variable for the current sprite
     */
    _createVariable(payload) {
        if (!this.vm.editingTarget) return;
        const id = payload.id || this._generateId();
        const type = payload.type || ''; // '' is scalar, 'list' is list
        
        // Scratch VM method to create a variable
        this.vm.editingTarget.createVariable(id, payload.name, type, false);
        
        // Optionally set an initial value
        if (payload.value !== undefined) {
            this.vm.editingTarget.variables[id].value = payload.value;
        }
    }

    /**
     * Hot-swaps the value of a variable directly in VM memory
     */
    _setVariableValue(payload) {
        if (!this.vm.editingTarget) return;
        const variable = this.vm.editingTarget.variables[payload.id];
        if (variable) {
            variable.value = payload.value;
        }
    }

    /**
     * Overwrites the agent's short-term memory with the newly compressed summary string
     */
    _updateHistory(payload) {
        if (payload.summary !== undefined) {
            this.llmActionHistory = payload.summary;
        }
    }
    // --- INITIALIZATION TESTS ---

    _runDummyTests() {
        console.log("🧪 Running LLM API Dummy Tests...");

        // 1. Test Prompt Compilation (What Gemini will see)
        const promptPayload = this.compilePromptPayload();
        console.log("-> Compiled Prompt Payload for LLM:");
        console.log(JSON.stringify(promptPayload, null, 2));
        const mockLlmResponse = [
            {
                // 1. The Hat Block
                action: 'INSERT_CHAIN',
                payload: { id: 'hat', opcode: 'event_whenflagclicked', inputs: {}, x: 200, y: 150 }
            },
            {
                // 2. The If/Else Block
                action: 'INSERT_CHAIN',
                payload: { id: 'ifelse', afterBlockId: 'hat', opcode: 'control_if_else', inputs: {} }
            },
            {
                // 3. The Condition (1 > 0) -> Goes into CONDITION
                action: 'INSERT_CHAIN',
                payload: {
                    id: 'condition',
                    insideInputOf: { blockId: 'ifelse', inputName: 'CONDITION' },
                    opcode: 'operator_gt',
                    inputs: { OPERAND1: 1, OPERAND2: 0 }
                }
            },
            {
                // 4. Repeat Loop -> Goes into SUBSTACK (The "If" branch)
                action: 'INSERT_CHAIN',
                payload: {
                    id: 'repeat',
                    insideInputOf: { blockId: 'ifelse', inputName: 'SUBSTACK' },
                    opcode: 'control_repeat',
                    inputs: { TIMES: 10 }
                }
            },
            {
                // 5. Move 10 Steps -> Goes into SUBSTACK of the Repeat Loop
                action: 'INSERT_CHAIN',
                payload: {
                    id: 'move',
                    insideInputOf: { blockId: 'repeat', inputName: 'SUBSTACK' },
                    opcode: 'motion_movesteps',
                    inputs: { STEPS: 10 }
                }
            },
            {
                // 6. Say "Hello from M3D!" -> Attached below Move
                action: 'INSERT_CHAIN',
                payload: { id: 'say1', afterBlockId: 'move', opcode: 'looks_say', inputs: { MESSAGE: 'Hello from M3D!' } }
            },
            {
                // 7. Wait 1 second -> Attached below Say
                action: 'INSERT_CHAIN',
                payload: { id: 'wait1', afterBlockId: 'say1', opcode: 'control_wait', inputs: { DURATION: 1 } }
            },
            {
                // 8. Say "Done" -> Attached below Wait
                action: 'INSERT_CHAIN',
                payload: { id: 'say2', afterBlockId: 'wait1', opcode: 'looks_say', inputs: { MESSAGE: 'Done' } }
            },
            {
                // 9. Wait 1 second -> Attached below second Say
                action: 'INSERT_CHAIN',
                payload: { id: 'wait2', afterBlockId: 'say2', opcode: 'control_wait', inputs: { DURATION: 1 } }
            },
            {
                // 10. Play Sound -> Goes into SUBSTACK2 (The "Else" branch)
                action: 'INSERT_CHAIN',
                payload: {
                    id: 'sound',
                    insideInputOf: { blockId: 'ifelse', inputName: 'SUBSTACK2' },
                    opcode: 'sound_playuntildone',
                    // Note: Scratch uses a special dropdown shadow for sound menus, 
                    // but standard text injection works as a fallback in the VM!
                    inputs: { SOUND_MENU: 'pop' } 
                }
            }
        ];
        // const mockLlmresponse = [
        //     {
        //         // 1. hat block
        //         action: 'insert_chain',
        //         payload: { id: 'hat', opcode: 'event_whenflagclicked', inputs: {}, x: 200, y: 150 }
        //     },
        //     {
        //         // 2. forever loop
        //         action: 'insert_chain',
        //         payload: { id: 'forever', afterblockid: 'hat', opcode: 'control_forever', inputs: {} }
        //     },
        //     {
        //         // 3. the "counter" (change x by 1) -> inside the forever loop
        //         action: 'insert_chain',
        //         payload: {
        //             id: 'increment',
        //             insideinputof: { blockid: 'forever', inputname: 'substack' },
        //             opcode: 'motion_changexby',
        //             inputs: { dx: 1 }
        //         }
        //     },
        //     {
        //         // 4. wait 1 second -> below the increment
        //         action: 'insert_chain',
        //         payload: {
        //             id: 'wait',
        //             afterblockid: 'increment',
        //             opcode: 'control_wait',
        //             inputs: { duration: 1 }
        //         }
        //     }
        // ];

        console.log("-> Executing mock LLM instruction set...");
        this.executeInstructions(mockLlmResponse);

        console.log("✅ Dummy tests complete. Check your Scratch workspace.");
    }
}

export default LLMVMAgent;