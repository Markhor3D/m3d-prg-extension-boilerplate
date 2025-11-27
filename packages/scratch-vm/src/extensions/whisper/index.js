/**
 * Scratch 3.0 extension for M3D Whisper ChatEngine.
 * Enables bot-to-bot and user-to-bot real-time messaging using Socket.IO.
 * * Required: Node.js server running the ChatEngine (server.js) on http://localhost:3000
 * * NOTE ON CONNECTION FLOW: The connection process below simulates the UI interaction
 * using browser alert/prompt/confirm because custom modals are not available in a standard
 * extension environment.
 */
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');

// Global Socket.IO client library URL
const SOCKET_IO_URL = "http://localhost:3000";
const SOCKET_IO_CDN = "https://cdn.socket.io/4.7.2/socket.io.min.js";

// Internal ID for the extension, used for registration
const EXTENSION_ID = 'whisper';

// Utility to load external scripts (Socket.IO client)
const loadScript = (src) => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
};

class M3DWhisper {
    constructor(runtime) {
        this.runtime = runtime;
        
        // Instance State
        this.socket = null;
        this.roomId = '';
        this.username = '';
        this.deleteCode = '';
        this.usersList = [];
        
        this.messageQueue = []; // FIFO Queue for incoming messages (user-to-user only)

        // State for Peripheral API compatibility
        this.peripheralId = null; // Represents the connected room ID
        
        // Connection status tracker (renamed for clarity, but fulfills peripheral API contract)
        this.isCircleConnected = false; 

        // --- NECESSARY SCRATCH VM REGISTRATIONS & BINDINGS ---
        
        // 1. Register this instance as a peripheral extension
        this.runtime.registerPeripheralExtension(EXTENSION_ID, this);

        // 2. Bind event handlers
        this.stopEmitted = this.stopEmitted.bind(this);
        this.startEmitted = this.startEmitted.bind(this);
        
        // 3. Register listeners for project lifecycle events
        runtime.on('PROJECT_STOPPED', this.stopEmitted);
        runtime.on('PROJECT_START', this.startEmitted);

        // 4. Attempt initial connection (needed for Socket.IO setup)
        this.beginSocketIO();
    }
    
    /**
     * Called when the project is stopped (e.g., stop button clicked).
     */
    stopEmitted() {
        // You might want to disconnect or clear the message queue here
        console.log('M3D Whisper: Project stopped. Clearing message queue.');
        this.messageQueue = [];
    }
    
    /**
     * Called when the project is started (e.g., green flag clicked).
     */
    startEmitted() {
        // You might want to re-establish state or ensure connectivity here
        console.log('M3D Whisper: Project started. Ensuring connectivity...');
        this.beginSocketIO();
        // If the user wants the bot to leave the room every time the project starts, you'd call this:
        // this.leaveCircle(); 
    }

    /**
     * Updates the connection status in the Scratch VM and emits the appropriate event.
     * @param {boolean} connected - True if connected (in a room), false otherwise.
     */
    _setConnectionStatus(connected) {
        this.isCircleConnected = connected;
        
        if (connected) {
            // PERIPHERAL_CONNECTED is a static property on the Runtime constructor
            this.runtime.emit(this.runtime.constructor.PERIPHERAL_CONNECTED);
            console.log("M3D Whisper: Connection Status: CONNECTED (Room Joined)");
        } else {
            this.runtime.emit(this.runtime.constructor.PERIPHERAL_DISCONNECTED);
            console.log("M3D Whisper: Connection Status: DISCONNECTED (No Room)");
        }
    }


    /**
     * Connects to the ChatEngine server using Socket.IO.
     * Loads the Socket.IO script if not already present.
     */
    async beginSocketIO() {
        if (this.socket && this.socket.connected) return;

        // Ensure socket.io client script is loaded
        if (typeof io === 'undefined') {
            await loadScript(SOCKET_IO_CDN);
        }

        // Initialize Socket.IO connection
        this.socket = io(SOCKET_IO_URL, {
            autoConnect: true,
            reconnectionAttempts: 3,
        });

        this.socket.on('connect', () => {
            console.log("M3D Whisper: Connected to ChatEngine server.");
        });

        this.socket.on('disconnect', () => {
            console.log("M3D Whisper: Disconnected from ChatEngine server.");
            // If the socket disconnects, clear room state and update status
            this._clearRoomState(); 
        });

        this.socket.on('connect_error', (err) => {
            console.error("M3D Whisper: Connection Error: ", err);
        });

        // Handle incoming messages from the server
        this.socket.on('incoming_message', (data) => {
            this._handleIncomingMessage(data);
        });
        
        // 1. Handle user list changes (Join/Leave) -> AUTOMATICALLY UPDATE USER LIST
        this.socket.on('user_list_changed', () => {
            console.log("M3D Whisper: User list change detected. Updating users...");
            this.updateUserList();
        });

        // Handle room destruction
        this.socket.on('room_destroyed', (data) => {
            console.log(`M3D Whisper: Room ${data.roomId} was destroyed.`);
            if (this.roomId === data.roomId) {
                this._clearRoomState();
            }
        });
    }

    /**
     * Processes an incoming message, pushes it to the queue, and fires Scratch Runtime events.
     * Admin/Server messages are filtered out.
     * @param {object} data - Message data (roomId, fromUser, message)
     */
    _handleIncomingMessage(data) {

        //data.fromUser is in the form admin:SKFJ7S
        if (data.fromUser.startsWith('admin:')) {
            var room = data.fromUser.split(':')[1];
            console.log(`M3D Whisper (Rx): Admin message for room ${room}: ${data.message}`);
            // check if the admin message is for our current room
            if (room === this.roomId) {                
                // update the user list.
                this.updateUserList();
            }
            return; // Ignore admin messages for user-to-user queue
        }

        const newMessage = {
            from: data.fromUser,
            text: data.message || '',
        };
        
        this.messageQueue.push(newMessage);
        
        // 1. Fire a generic event for ANY incoming message (for 'hasWhispers' logic)
        this.runtime.emit('EVENT_M3D_WHISPER_RECEIVED');

        // 2. Fire a specific event with the sender's username (for 'heard a whisper from []' HAT block)
        this.runtime.emit('EVENT_M3D_WHISPER_FROM', data.fromUser);

        console.log(`M3D Whisper (Rx): User-to-user message queued. From: ${data.fromUser}, Msg: "${data.message}"`);
    }
    
    _clearRoomState() {
        this.roomId = '';
        this.username = '';
        this.deleteCode = '';
        this.usersList = [];
        this.messageQueue = []; // Clear queue on leaving
        this.peripheralId = null; // Clear connection ID
        
        // Update connection status
        this._setConnectionStatus(false);
    }

    /**
     * Block definitions for the M3D Whisper extension.
     * @returns {object} - Block information object
     */
    getInfo() {
        return {
            id: EXTENSION_ID,
            name: 'M3D Whisper',
            color1: '#8A2BE2', // BlueViolet
            color2: '#6A5ACD', // SlateBlue
            menuIconURI: 'data:image/svg+xml;base64,...', // Placeholder for the machine/chat icon
            showStatusButton: true,
            
            // --- PERIPHERAL CONNECTION API INTEGRATION ---
            peripheral: {
                id: 'whisper_chat', // Internal ID for the VM to recognize the device
                name: 'M3D Whisper Circle', // Name shown in the connection modal
                
                // CRITICAL: This enables the connection status dot next to the extension name.
                showStatusButton: true, 
                
                programMode: ['do-not-show'], 
                connection: {
                    type: 'extension', // Use 'extension' type for custom logic
                    message: formatMessage({
                        id: 'whisper.connect.message',
                        default: 'Click Connect to set up your Whisper Circle.',
                        description: 'Instructions for the connection modal.'
                    })
                }
            },
            // --- END PERIPHERAL CONNECTION API INTEGRATION ---
            
            blocks: [
                // --- Event Block ---
                {
                    opcode: 'whenHeardWhisper',
                    blockType: BlockType.EVENT, // Starting block type
                    text: formatMessage({
                        id: 'whisper.whenHeard',
                        default: 'when heard a whisper from [SENDER_USER]',
                        description: 'Triggers when a message is received from the selected user.'
                    }),
                    arguments: {
                        SENDER_USER: {
                            type: ArgumentType.STRING,
                            menu: 'usersMenu' // Dynamic menu for usernames
                        }
                    },
                    filter: 'EVENT_M3D_WHISPER_FROM' 
                },
                '---',
                {
                    opcode: 'setUsername',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'whisper.setUsername',
                        default: 'set name to [USERNAME]',
                        description: 'Sets the local username before joining a circle.'
                    }),
                    arguments: {
                        USERNAME: {
                            type: ArgumentType.STRING,
                            defaultValue: 'bot-1'
                        }
                    }
                },
                '---',
                {
                    opcode: 'createWhisperCircle',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'whisper.create',
                        default: 'create whisper circle',
                        description: 'Creates a new chat room and joins it. Stores deletion code internally.'
                    })
                },
                {
                    opcode: 'joinCircle',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'whisper.join',
                        default: 'join circle [ROOM_ID]',
                        description: 'Joins an existing chat room.'
                    }),
                    arguments: {
                        ROOM_ID: {
                            type: ArgumentType.STRING,
                            defaultValue: 'ABC123'
                        }
                    }
                },
                {
                    opcode: 'getRoomID',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'whisper.getRoomID',
                        default: 'room ID',
                        description: 'Returns the ID of the currently joined room.'
                    })
                },
                '---',
                {
                    opcode: 'updateUserList',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'whisper.updateUsers',
                        default: 'update user list',
                        description: 'Fetches the list of connected users in the room.'
                    })
                },
                {
                    opcode: 'whisperMessage',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'whisper.sendMessage',
                        default: 'whisper [MESSAGE] to [TO_USER]',
                        description: 'Sends a direct message to a specific user in the circle.'
                    }),
                    arguments: {
                        MESSAGE: {
                            type: ArgumentType.STRING,
                            defaultValue: 'Hello!'
                        },
                        TO_USER: {
                            type: ArgumentType.STRING,
                            menu: 'usersMenu' // Dynamic menu for usernames
                        }
                    }
                },
                // --- Message Queue Blocks ---
                {
                    opcode: 'hasWhispers',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'whisper.hasWhispers',
                        default: 'whisper waiting?',
                        description: 'Returns true if there are unread whispers in the queue (excluding admin messages).'
                    })
                },
                {
                    opcode: 'getWhisperedMessage',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'whisper.getWhisperedMessage',
                        default: 'retrieve whisper [SENDER_USER]',
                        description: 'Gets and removes the oldest unread whisper (sender or text) from the queue.'
                    }),
                    arguments: {
                        SENDER_USER: {
                            type: ArgumentType.STRING,
                            menu: 'usersMenu' // Dynamic menu for usernames
                        }
                    }
                },
                '---',
                {
                    opcode: 'leaveCircle',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'whisper.leave',
                        default: 'leave circle',
                        description: 'Leaves the currently joined chat room.'
                    })
                },
                {
                    opcode: 'deleteCreatedCircle',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'whisper.delete',
                        default: 'delete created circle',
                        description: 'Deletes the room if this bot created it and has the deletion code.'
                    })
                }
            ],

            menus: {
                usersMenu: {
                    acceptsReporters: true,
                    items: '_getUsersMenu'
                },
                messagePropertyMenu: {
                    items: [
                        { text: 'Sender', value: 'sender' },
                        { text: 'Message Text', value: 'text' }
                    ]
                }
            }
        };
    }

    // ------------------------------------------------------------------
    // DYNAMIC MENU HANDLER
    // ------------------------------------------------------------------

    /**
     * Provides the dynamic menu items for usernames.
     * Filters out the current user's name.
     * @returns {Array<object>} - Array of menu objects {text: string, value: string}
     */
    _getUsersMenu() {
        // 1. Get unique users from the list fetched from the server
        const uniqueUsers = Array.from(new Set(this.usersList));
        
        // 2. Filter out the current user's name (as requested)
        let targetableUsers = uniqueUsers.filter(username => username !== this.username);
        
        if (targetableUsers.length === 0) {
            return [{ text: 'No Other Users', value: '' }];
        }
        
        // Optional: Sort alphabetically for clean UI
        targetableUsers.sort();

        return targetableUsers.map(username => ({
            text: username,
            value: username
        }));
    }

    // ------------------------------------------------------------------
    // PERIPHERAL API IMPLEMENTATION (Connection Flow)
    // ------------------------------------------------------------------

    /**
     * Returns true if the bot is currently in a room. Called by VM frequently.
     * @returns {boolean} Connection status.
     */
    isConnected() {
        // Connection is based on being in a room, reflected by peripheralId
        return !!this.peripheralId;
    }

    /**
     * Called by the VM to initiate a scan or check for devices.
     */
    scan() {
        // Only log and ensure the Socket.IO connection is initialized (if not already).
        console.log('M3D Whisper: Scan called by VM. Attempting to ensure socket connection...');
        this.beginSocketIO(); 
        this.connect();
    }
    
    /**
     * Called by the VM when the user clicks the "Disconnect" icon in the Scratch editor.
     * @returns {Promise} A promise that resolves when disconnected.
     */
    disconnect() {
        console.log('M3D Whisper: Disconnect called by VM (via status icon). Leaving circle...');
        // Use our core logic to leave the room, clear state, and update status
        return this.leaveCircle(); 
    }
    
    /**
     * Called by the VM to reset the device state.
     * @returns {Promise} A promise that resolves when reset is complete.
     */
    reset() {
        console.log('M3D Whisper: Reset called by VM. Clearing state.');
        this._clearRoomState();
        return Promise.resolve();
    }


    /**
     * Gets the ID of the connected peripheral (the room ID).
     * @returns {string} The current room ID, or null.
     */
    getPeripheralId() {
        return this.peripheralId;
    }

    /**
     * Simulates scanning by providing a single "device" (the Whisper Circle setup).
     * @returns {Promise<Array<object>>} A promise that resolves to an array of peripheral objects.
     */
    scanForPeripherals() {
        // We only return one virtual peripheral for setup
        return Promise.resolve([{
            peripheralId: 'whisper_chat', 
            name: this.isConnected() ? `Connected to ${this.roomId}` : 'M3D Whisper Circle Setup',
            rssi: -1, // Not applicable
        }]);
    }

    /**
     * Handles the interactive connection process (Create or Join).
     * This is where the browser prompts/alerts start.
     * @returns {Promise} A promise that resolves when connected or rejects on failure.
     */
    connect() {
        return new Promise(async (resolve, reject) => {
            
            console.log("M3D Whisper: Connect called. Starting interactive setup.");

            // 1. Check if already connected (Handling user's request for disconnect option)
            if (this.isConnected()) {
                // Use confirm to give the user a choice to disconnect
                const disconnectPrompt = confirm(`You are already connected to circle: ${this.roomId} as ${this.username}. Do you want to DISCONNECT now?`);
                
                if (disconnectPrompt) {
                    await this.leaveCircle(); // Disconnects and updates state/status
                    alert("Disconnected successfully. Please click Connect button again to join a new circle.");
                    return resolve(); 
                }
                alert(`Staying connected to ${this.roomId}.`);
                return resolve(); // Keep connected
            }

            // 2. Get Username (If not already set by a block)
            if (!this.username) {
                const newUsername = prompt("Enter your bot's unique name (e.g., bot-alpha):");
                if (!newUsername) return reject(new Error("Username is required to connect."));
                this.setUsername({ USERNAME: newUsername });
            }
            
            // 3. Choose Action (Create or Join)
            const action = prompt(`Hello ${this.username}! If you already have a Circle ID, enter it or leave blank to CREATE a new circle.`);
            
            if (action && action.toUpperCase() !== '') {
                // B. JOIN ROOM
                const roomId = action.toUpperCase();
                if (!roomId) return reject(new Error("Room ID is required to join."));
                
                try {
                    await this.beginSocketIO();
                    const res = await this._joinRoomInternal(roomId, this.username);
                    if (res.status === 'ok') {
                        alert(`✅ Successfully joined circle ${this.roomId}.`);
                        this.peripheralId = this.roomId; // Set peripheral ID
                        this._setConnectionStatus(true); // Update status
                        resolve();
                    } else {
                        reject(new Error(`Failed to join circle ${roomId}: ${res.message}`));
                    }
                } catch (e) {
                    reject(e);
                }

            } else {
                // A. CREATE ROOM
                try {
                    await this.beginSocketIO();
                    const response = await this._createRoomInternal();
                    if (response.status === 'ok') {
                        alert(`✅ Circle Created! ID: ${this.roomId}.`);
                        this.peripheralId = this.roomId; // Set peripheral ID
                        this._setConnectionStatus(true); // Update status
                        resolve();
                    } else {
                        reject(new Error(`Failed to create circle: ${response.message}`));
                    }
                } catch (e) {
                    reject(e);
                }

            }
        });
    }

    
    // --- Internal Helpers for Connection Flow ---
    
    _createRoomInternal() {
        return new Promise(resolve => {
            this.socket.emit('create_room', (response) => {
                if (response.status === 'ok') {
                    this.roomId = response.roomId;
                    this.deleteCode = response.deleteCode;
                    // Automatically join the newly created room after creation
                    this._joinRoomInternal(this.roomId, this.username).then(() => {
                        resolve({ status: 'ok', roomId: this.roomId });
                    });
                } else {
                    resolve({ status: 'error', message: response.message });
                }
            });
        });
    }

    // Existing _joinRoomInternal modified to return the status object AND update connection status
    async _joinRoomInternal(roomId, username) {
        return new Promise(resolve => {
            this.socket.emit('join_room', { roomId, username }, (res) => {
                if (res.status === 'ok') {
                    this.roomId = roomId;
                    this.username = username;
                    console.log(`M3D Whisper: Successfully joined circle ${roomId} as ${username}.`);
                    
                    // Update connection status here for both peripheral and block flow
                    this._setConnectionStatus(true); 

                    // Update user list immediately after joining
                    this.updateUserList().then(() => resolve({ status: 'ok' })); 
                } else {
                    console.error(`M3D Whisper: Failed to join circle ${roomId}: ${res.message}`);
                    this._clearRoomState();
                    resolve(res); // resolve with error status
                }
            });
        });
    }

    // ------------------------------------------------------------------
    // BLOCK IMPLEMENTATION - COMMANDS
    // ------------------------------------------------------------------

    setUsername(args) {
        this.username = Cast.toString(args.USERNAME).trim();
        if (this.username) {
            console.log(`M3D Whisper: Local username set to: ${this.username}`);
        } else {
            console.error("M3D Whisper: Username cannot be empty.");
        }
    }

    async createWhisperCircle() {
        // Check if already connected via the peripheral flow
        if (this.peripheralId) {
             console.warn("M3D Whisper: Already connected via peripheral flow. Use peripheral disconnect/connect.");
             return;
        }

        await this.beginSocketIO();
        
        if (!this.username) {
            console.error("M3D Whisper: Please set a username before creating a circle.");
            return;
        }
        
        return new Promise(resolve => {
            this.socket.emit('create_room', (response) => {
                if (response.status === 'ok') {
                    this.roomId = response.roomId;
                    this.deleteCode = response.deleteCode;
                    console.log(`M3D Whisper: New Circle Created. ID: ${this.roomId}, Deletion Code: ${this.deleteCode} (KEEP SECRET!)`);
                    
                    // Automatically join the newly created room
                    this._joinRoomInternal(this.roomId, this.username).then(() => {
                        // Notify user about the room ID they need to share
                        this.runtime.emit('EVENT_M3D_WHISPER_INFO', `Circle ID: ${this.roomId}`);
                        resolve();
                    });
                } else {
                    console.error("M3D Whisper: Failed to create circle.", response.message);
                    resolve();
                }
            });
        });
    }

    async joinCircle(args) {
        // Check if already connected via the peripheral flow
        if (this.peripheralId) {
             console.warn("M3D Whisper: Already connected via peripheral flow. Use peripheral disconnect/connect.");
             return;
        }

        await this.beginSocketIO();
        
        const roomId = Cast.toString(args.ROOM_ID).trim();
        
        if (!this.username) {
            console.error("M3D Whisper: Please set a username before joining a circle.");
            return;
        }

        // We use the existing internal helper, ignoring the returned status object here since it's an async block command
        await this._joinRoomInternal(roomId, this.username);
    }

    async whisperMessage(args) {
        await this.beginSocketIO();
        
        if (!this.roomId) {
            console.error("M3D Whisper: Not currently in a circle. Join or create one first.");
            return;
        }
        
        const message = Cast.toString(args.MESSAGE);
        const toUser = Cast.toString(args.TO_USER);

        if (!toUser) {
            console.warn("M3D Whisper: Target user is empty. Cannot send message.");
            return;
        }

        return new Promise(resolve => {
            this.socket.emit('send_message', {
                roomId: this.roomId,
                toUser: toUser,
                msg: message
            }, (res) => {
                if (res.status !== 'ok') {
                    console.error(`M3D Whisper: Failed to whisper to ${toUser}: ${res.message}`);
                }
                resolve();
            });
        });
    }
    
    async updateUserList() {
        await this.beginSocketIO();

        if (!this.roomId) {
            console.error("M3D Whisper: Not currently in a circle. Cannot fetch user list.");
            return;
        }
        
        return new Promise(resolve => {
            this.socket.emit('get_users', { roomId: this.roomId }, (res) => {
                if (res.status === 'ok') {
                    // Update the list that feeds the dynamic menu
                    this.usersList = res.users || [];
                    console.log(`M3D Whisper: User list updated. Users: ${this.usersList.join(', ')}`);
                } else {
                    console.error(`M3D Whisper: Failed to get users: ${res.message}`);
                    this.usersList = [];
                }
                // Resolve immediately to avoid blocking
                resolve(); 
            });
        });
    }

    async leaveCircle() {
        await this.beginSocketIO();

        if (!this.roomId) {
            console.warn("M3D Whisper: Not currently in a circle.");
            return;
        }

        const roomIdToLeave = this.roomId;
        const usernameToLeave = this.username;

        // Clear local state first, which calls _setConnectionStatus(false)
        this._clearRoomState(); 

        return new Promise(resolve => {
            this.socket.emit('leave_room', { roomId: roomIdToLeave, username: usernameToLeave }, (res) => {
                console.log(`M3D Whisper: Left circle ${roomIdToLeave}.`);
                // Server handles the response, just resolve
                resolve();
            });
        });
    }
    
    async deleteCreatedCircle() {
        await this.beginSocketIO();
        
        if (!this.roomId || !this.deleteCode) {
            console.error("M3D Whisper: Cannot delete circle. You must be the creator, or you already left/deleted it.");
            return;
        }
        
        const roomIdToDelete = this.roomId;
        const deleteCode = this.deleteCode;
        
        // Clear state before sending, as the server will broadcast room_destroyed
        this._clearRoomState();

        return new Promise(resolve => {
            this.socket.emit('delete_room', { roomId: roomIdToDelete, deleteCode: deleteCode }, (res) => {
                if (res.status === 'ok') {
                    console.log(`M3D Whisper: Successfully deleted circle ${roomIdToDelete}.`);
                } else {
                    console.error(`M3D Whisper: Failed to delete circle: ${res.message}`);
                }
                resolve();
            });
        });
    }


    // ------------------------------------------------------------------
    // BLOCK IMPLEMENTATION - REPORTERS
    // ------------------------------------------------------------------
    
    /**
     * Boolean block: Checks if the message queue is non-empty.
     * Only counts user-to-user messages, excluding admin/server messages.
     * @returns {boolean} True if there is at least one message waiting.
     */
    hasWhispers() {
        return this.messageQueue.length > 0;
    }

    /**
     * Reporter block: Retrieves and removes the oldest whisper from the queue.
     * Since admin messages are filtered in _handleIncomingMessage, this only handles
     * user-to-user messages.
     * @param {object} args - Arguments containing the property to return (sender or text).
     * @returns {string} The requested property of the dequeued message.
     */
    getWhisperedMessage(args) {
        const user = Cast.toString(args.SENDER_USER).trim();

        console.log(`M3D Whisper: Retrieving whispered message for: ${user || '<any user>'}`);

        // If there are no messages, return an empty string (Scratch-friendly)
        if (!this.messageQueue || this.messageQueue.length === 0) return '';

        // Find the index of the oldest message that matches the requested user.
        // If `user` is empty, return the very first message (FIFO behavior).
        let index;
        if (!user) {
            index = 0;
        } else {
            index = this.messageQueue.findIndex(msg => msg.from === user);
        }

        // If no matching message was found, return empty string.
        if (index === -1 || index === undefined) return '';

        // Remove the message from the queue and return its text.
        const dequeuedMessage = this.messageQueue.splice(index, 1)[0];

        // Prefer returning the message text. Fall back to sender name if text is absent.
        return dequeuedMessage && typeof dequeuedMessage.text === 'string'
            ? dequeuedMessage.text
            : (dequeuedMessage ? dequeuedMessage.from : '');
    }

    getRoomID() {
        return this.roomId;
    }
    
}

module.exports = M3DWhisper;