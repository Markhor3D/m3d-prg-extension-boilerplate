import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import styles from './jugnu-chat.css';

class JugnuChat extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            open: false,
            input: '',
            history: []
        };
        this.toggleOpen = this.toggleOpen.bind(this);
        this.onChange = this.onChange.bind(this);
        this.onSend = this.onSend.bind(this);
    }

    toggleOpen () {
        this.setState({open: !this.state.open});
    }

    onChange (e) {
        this.setState({input: e.target.value});
    }

    async onSend () {
        const {input} = this.state;
        if (!input || !input.trim()) return;
        const userMsg = {from: 'user', text: input.trim(), id: Date.now()};
        this.setState(({history}) => ({history: [...history, userMsg], input: ''}));

        // If an LLM agent is available, call it; otherwise show a fallback reply.
        if (window.llmAgent && typeof window.llmAgent.executeInstructions === 'function') {
            try {
                const reply = await window.llmAgent.executeInstructions(input.trim());
                const agentMsg = {from: 'agent', text: String(reply || 'No response'), id: Date.now() + 1};
                this.setState(({history}) => ({history: [...history, agentMsg]}));
            } catch (e) {
                const errMsg = {from: 'agent', text: 'Agent error', id: Date.now() + 2};
                this.setState(({history}) => ({history: [...history, errMsg]}));
            }
        } else {
            const agentMsg = {from: 'agent', text: 'LLM agent not available', id: Date.now() + 1};
            this.setState(({history}) => ({history: [...history, agentMsg]}));
        }
    }

    render () {
        const {open, input, history} = this.state;
        return (
            <div className={styles.jugnuChatWrap}>
                <button
                    className={classNames(styles.jugnuChatButton, {[styles.open]: open})}
                    onClick={this.toggleOpen}
                    aria-label="Open Jugnu chat"
                >
                    Ask JugnuAI
                </button>
                {open ? (
                    <div className={styles.jugnuChatOverlay}>
                        <div className={styles.header}>JugnuAI</div>
                        <div className={styles.messages}>
                            {history.map(m => (
                                <div key={m.id} className={m.from === 'user' ? styles.msgUser : styles.msgAgent}>
                                    {m.text}
                                </div>
                            ))}
                        </div>
                        <div className={styles.inputRow}>
                            <input
                                className={styles.input}
                                value={input}
                                onChange={this.onChange}
                                onKeyDown={(e) => { if (e.key === 'Enter') this.onSend(); }}
                                placeholder="Ask a question or send instructions"
                            />
                            <button className={styles.sendButton} onClick={this.onSend}>Send</button>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }
}

JugnuChat.propTypes = {
    className: PropTypes.string
};

export default JugnuChat;
