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
const SOCKET_IO_URL = "https://chat.markhor3d.com";
const SocketLoginKey = "218a75af-c7a9-454b-9a01-252e29ba330a";
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

    async beginSocketIO() {
        await this.beginSocketIO_gen(SOCKET_IO_URL, SocketLoginKey);
    }
    /**
     * Connects to the ChatEngine server using Socket.IO,
     * including the necessary secret key for authentication.
     * * @param {string} serverUrl - The deployment URL (e.g., 'https://chat.markhor3d.com').
     * @param {string} secretKey - The user's valid secret key (e.g., 'user-uuid-1').
     */
    async beginSocketIO_gen(serverUrl, secretKey) {
        // 1. Check for existing connection and required parameters
        if (this.socket && this.socket.connected) return;
        if (!serverUrl || !secretKey) {
            console.error("M3D Whisper: Cannot connect. Server URL and Secret Key are required.");
            return;
        }

        // Ensure socket.io client script is loaded
        // Assuming SOCKET_IO_CDN is defined somewhere
        if (typeof io === 'undefined') {
            await loadScript(SOCKET_IO_CDN);
        }

        // 2. Initialize Socket.IO connection with the SECRET KEY in the query
        this.socket = io(serverUrl, {
            autoConnect: true,
            reconnectionAttempts: 3,
            extraHeaders: {
                "x-secret-key": secretKey 
            },
        });

        this.socket.on('connect', () => {
            console.log("M3D Whisper: Connected to ChatEngine server.");
        });

        this.socket.on('disconnect', (reason) => {
            console.log(`M3D Whisper: Disconnected from ChatEngine server. Reason: ${reason}`);
            // If the socket disconnects, clear room state and update status
            this._clearRoomState(); 
        });

        this.socket.on('connect_error', (err) => {
            // This will trigger if the server rejects the connection (e.g., due to an invalid secret key)
            console.error("M3D Whisper: Connection Error (Authentication Failed?): ", err.message);
        });

        // Handle incoming messages from the server
        this.socket.on('incoming_message', (data) => {
            this._handleIncomingMessage(data);
        });
        
        // NOTE: The 'user_list_changed' event is not implemented in the current server.js. 
        // It is best practice to remove or comment out handlers for events the server doesn't emit.
        // However, keeping the existing structure for future compatibility:
        /* this.socket.on('user_list_changed', () => {
            console.log("M3D Whisper: User list change detected. Updating users...");
            this.updateUserList();
        });
        */

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
            menuIconURI: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAEpmlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSfvu78nIGlkPSdXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQnPz4KPHg6eG1wbWV0YSB4bWxuczp4PSdhZG9iZTpuczptZXRhLyc+CjxyZGY6UkRGIHhtbG5zOnJkZj0naHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyc+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpBdHRyaWI9J2h0dHA6Ly9ucy5hdHRyaWJ1dGlvbi5jb20vYWRzLzEuMC8nPgogIDxBdHRyaWI6QWRzPgogICA8cmRmOlNlcT4KICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0nUmVzb3VyY2UnPgogICAgIDxBdHRyaWI6Q3JlYXRlZD4yMDI1LTExLTI4PC9BdHRyaWI6Q3JlYXRlZD4KICAgICA8QXR0cmliOkV4dElkPjViYzY3ZWRhLTVmYjctNGVhOC1iODI5LTg5YTdlMWNjNzAwNjwvQXR0cmliOkV4dElkPgogICAgIDxBdHRyaWI6RmJJZD41MjUyNjU5MTQxNzk1ODA8L0F0dHJpYjpGYklkPgogICAgIDxBdHRyaWI6VG91Y2hUeXBlPjI8L0F0dHJpYjpUb3VjaFR5cGU+CiAgICA8L3JkZjpsaT4KICAgPC9yZGY6U2VxPgogIDwvQXR0cmliOkFkcz4KIDwvcmRmOkRlc2NyaXB0aW9uPgoKIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PScnCiAgeG1sbnM6ZGM9J2h0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvJz4KICA8ZGM6dGl0bGU+CiAgIDxyZGY6QWx0PgogICAgPHJkZjpsaSB4bWw6bGFuZz0neC1kZWZhdWx0Jz5NYXJraG9yM0QgLSAzPC9yZGY6bGk+CiAgIDwvcmRmOkFsdD4KICA8L2RjOnRpdGxlPgogPC9yZGY6RGVzY3JpcHRpb24+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6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',
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
                    blockType: BlockType.HAT, // Starting block type
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
                    }
                },
                '---',
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
                    opcode: 'hasWhispersFrom',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'whisper.hasWhispersfrom',
                        default: 'whisper waiting from [SENDER_USER]?',
                        description: 'Returns true if there are unread whispers in the queue (excluding admin messages).'
                    }),
                    arguments: {
                        SENDER_USER: {
                            type: ArgumentType.STRING,
                            menu: 'usersMenu' // Dynamic menu for usernames
                        }
                    }
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
                    },
                    disableMonitor: true
                },
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
        this._clearRoomState();
        return true; 
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
                        // Auto-copy room ID to clipboard
                        this.copyToClipboard(this.roomId).then(success => {
                            if (success) {
                                alert(`✅ Circle Created! ID: ${this.roomId} (copied to clipboard).`);
                            } else {
                                alert(`✅ Circle Created! ID: ${this.roomId}`);
                            }
                        });
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
    // Utility to copy text to clipboard
    copyToClipboard(text) {
        // Try using the modern clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text)
                .then(() => {
                    console.log(`M3D Whisper: Copied to clipboard: ${text}`);
                    return true;
                })
                .catch(err => {
                    console.error('M3D Whisper: Failed to copy to clipboard:', err);
                    return false;
                });
        } else {
            // Fallback for older browsers or non-secure contexts
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                console.log(`M3D Whisper: Copied to clipboard (fallback): ${text}`);
                return successful;
            } catch (err) {
                console.error('M3D Whisper: Failed to copy to clipboard (fallback):', err);
                document.body.removeChild(textArea);
                return false;
            }
        }
    }

    // ------------------------------------------------------------------
    // BLOCK IMPLEMENTATION - COMMANDS
    // ------------------------------------------------------------------
    /**
     * Hat block implementation for 'when heard a whisper from [SENDER_USER]'.
     * Fires continuously as long as a matching message exists in the queue.
     * Stops firing once the message is retrieved by getWhisperedMessage.
     * @param {object} args - Block arguments.
     * @returns {boolean} True if a message is waiting, false otherwise.
     */
    whenHeardWhisper(args) {
        const user = Cast.toString(args.SENDER_USER).trim();

        // 1. Check for any messages in the queue
        if (!this.messageQueue || this.messageQueue.length === 0) {
            return false;
        }

        // 2. If the user argument is empty, any message will trigger the block.
        if (!user) {
            return true;
        } 
        
        // 3. If a specific user is selected, check if a message from that user exists.
        return this.messageQueue.some(msg => msg.from === user);
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


    setUsername(args) {
        this.username = Cast.toString(args.USERNAME).trim();
        if (this.username) {
            console.log(`M3D Whisper: Local username set to: ${this.username}`);
        } else {
            console.error("M3D Whisper: Username cannot be empty.");
        }
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
     * Boolean block: Checks if the message queue is non-empty.
     * Only counts user-to-user messages, excluding admin/server messages.
     * @returns {boolean} True if there is at least one message waiting.
     */
    hasWhispersFrom(args) {
        sender = Cast.toString(args.SENDER_USER).trim();

        console.log(`M3D Whisper: Checking for whispered messages from: ${sender || '<any user>'}`);

        // If there are no messages, return false
        if (!this.messageQueue || this.messageQueue.length === 0) return false;

        // If sender is empty, just check if there are any messages
        if (!sender) {
            return this.messageQueue.length > 0;
        }
        return this.messageQueue.some(msg => msg.from === sender);
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
            return '';
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
        if (this.roomId) {
            // Copy to clipboard when block is executed
            this.copyToClipboard(this.roomId);
        }
        return this.roomId;
    }
    
}

module.exports = M3DWhisper;