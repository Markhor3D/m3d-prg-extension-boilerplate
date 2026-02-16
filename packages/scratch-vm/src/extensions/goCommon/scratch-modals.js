/**
 * Custom Scratch-style Modal Dialogs
 * Simple modal system that works in extension environment without Blockly dependency.
 * Provides ScratchAlert, ScratchConfirm, and ScratchPrompt functions with Scratch styling.
 */

const MODAL_STYLES = `
    .scratch-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }

    .scratch-modal-content {
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        padding: 24px;
        min-width: 300px;
        max-width: 500px;
        z-index: 10001;
    }

    .scratch-modal-title {
        margin: 0 0 16px 0;
        font-size: 18px;
        font-weight: 600;
        color: #575E75;
    }

    .scratch-modal-message {
        margin: 0 0 20px 0;
        font-size: 14px;
        color: #575E75;
        line-height: 1.4;
    }

    .scratch-modal-input {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        margin: 0 0 20px 0;
        border: 1px solid rgba(0, 0, 0, 0.2);
        border-radius: 5px;
        font-size: 14px;
        color: #575E75;
        font-family: inherit;
    }

    .scratch-modal-input:focus {
        outline: none;
        border-color: #4C97FF;
        box-shadow: 0 0 0 3px rgba(76, 151, 255, 0.2);
    }

    .scratch-modal-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    .scratch-modal-button {
        padding: 8px 16px;
        border: 1px solid rgba(0, 0, 0, 0.2);
        border-radius: 4px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        background: white;
        color: #575E75;
        transition: all 0.2s ease;
        font-family: inherit;
    }

    .scratch-modal-button:hover {
        background: #f5f5f5;
        border-color: rgba(0, 0, 0, 0.3);
    }

    .scratch-modal-button:active {
        transform: scale(0.98);
    }

    .scratch-modal-button.primary {
        background: #4C97FF;
        color: white;
        border-color: #4C97FF;
    }

    .scratch-modal-button.primary:hover {
        background: #357ABD;
        border-color: #357ABD;
    }

    .scratch-modal-button.danger {
        background: #FF6B6B;
        color: white;
        border-color: #FF6B6B;
    }

    .scratch-modal-button.danger:hover {
        background: #E63946;
        border-color: #E63946;
    }
`;

/**
 * Initialize modal styles (add to document once)
 */
function initializeModalStyles() {
    if (document.getElementById('scratch-modal-styles')) {
        return; // Already initialized
    }
    const style = document.createElement('style');
    style.id = 'scratch-modal-styles';
    style.textContent = MODAL_STYLES;
    document.head.appendChild(style);
}

/**
 * Create and show a modal overlay
 */
function createModalOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'scratch-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    return overlay;
}

/**
 * Show an alert modal
 * @param {string} message - The message to display
 * @param {Function} callback - Callback function when dismissed
 */
function ScratchAlert(message, callback) {
    initializeModalStyles();
    
    const overlay = createModalOverlay();
    
    const content = document.createElement('div');
    content.className = 'scratch-modal-content';
    
    const messageEl = document.createElement('div');
    messageEl.className = 'scratch-modal-message';
    messageEl.textContent = message;
    
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'scratch-modal-buttons';
    
    const okButton = document.createElement('button');
    okButton.className = 'scratch-modal-button primary';
    okButton.textContent = 'OK';
    
    const cleanup = () => {
        overlay.remove();
        if (callback) callback();
    };
    
    okButton.addEventListener('click', cleanup);
    okButton.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') cleanup();
    });
    
    buttonContainer.appendChild(okButton);
    content.appendChild(messageEl);
    content.appendChild(buttonContainer);
    overlay.appendChild(content);
    
    document.body.appendChild(overlay);
    okButton.focus();
}

/**
 * Show a confirm modal
 * @param {string} message - The message to display
 * @param {Function} callback - Callback function with boolean result
 */
function ScratchConfirm(message, callback) {
    initializeModalStyles();
    
    const overlay = createModalOverlay();
    
    const content = document.createElement('div');
    content.className = 'scratch-modal-content';
    
    const messageEl = document.createElement('div');
    messageEl.className = 'scratch-modal-message';
    messageEl.textContent = message;
    
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'scratch-modal-buttons';
    
    const cancelButton = document.createElement('button');
    cancelButton.className = 'scratch-modal-button';
    cancelButton.textContent = 'Cancel';
    
    const confirmButton = document.createElement('button');
    confirmButton.className = 'scratch-modal-button primary';
    confirmButton.textContent = 'OK';
    
    const cleanup = (result) => {
        overlay.remove();
        if (callback) callback(result);
    };
    
    cancelButton.addEventListener('click', () => cleanup(false));
    confirmButton.addEventListener('click', () => cleanup(true));
    
    const handleKeydown = (e) => {
        if (e.key === 'Enter') cleanup(true);
        if (e.key === 'Escape') cleanup(false);
    };
    
    cancelButton.addEventListener('keydown', handleKeydown);
    confirmButton.addEventListener('keydown', handleKeydown);
    overlay.addEventListener('keydown', handleKeydown);
    
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(confirmButton);
    content.appendChild(messageEl);
    content.appendChild(buttonContainer);
    overlay.appendChild(content);
    
    document.body.appendChild(overlay);
    confirmButton.focus();
}

/**
 * Show a prompt modal
 * @param {string} message - The message to display
 * @param {string} defaultValue - Default value for input
 * @param {Function} callback - Callback function with user input (null if cancelled)
 * @param {string} title - Optional title (not used in this implementation)
 * @param {string} varType - Optional variable type (not used in this implementation)
 */
function ScratchPrompt(message, defaultValue, callback, title, varType) {
    initializeModalStyles();
    
    const overlay = createModalOverlay();
    
    const content = document.createElement('div');
    content.className = 'scratch-modal-content';
    
    const messageEl = document.createElement('div');
    messageEl.className = 'scratch-modal-message';
    messageEl.textContent = message;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'scratch-modal-input';
    input.value = defaultValue || '';
    
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'scratch-modal-buttons';
    
    const cancelButton = document.createElement('button');
    cancelButton.className = 'scratch-modal-button';
    cancelButton.textContent = 'Cancel';
    
    const okButton = document.createElement('button');
    okButton.className = 'scratch-modal-button primary';
    okButton.textContent = 'OK';
    
    const cleanup = (result) => {
        overlay.remove();
        if (callback) callback(result);
    };
    
    cancelButton.addEventListener('click', () => cleanup(null));
    okButton.addEventListener('click', () => cleanup(input.value));
    
    const handleKeydown = (e) => {
        if (e.key === 'Enter') cleanup(input.value);
        if (e.key === 'Escape') cleanup(null);
    };
    
    input.addEventListener('keydown', handleKeydown);
    cancelButton.addEventListener('keydown', handleKeydown);
    okButton.addEventListener('keydown', handleKeydown);
    overlay.addEventListener('keydown', handleKeydown);
    
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(okButton);
    content.appendChild(messageEl);
    content.appendChild(input);
    content.appendChild(buttonContainer);
    overlay.appendChild(content);
    
    document.body.appendChild(overlay);
    input.focus();
    input.select();
}

module.exports = {
    ScratchAlert,
    ScratchConfirm,
    ScratchPrompt
};
