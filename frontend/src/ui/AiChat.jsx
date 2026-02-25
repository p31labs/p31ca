import React, { useState, useRef, useEffect } from 'react';
import { COLORS } from '../constants';
import { useVscode } from '../hooks/useVscode';
import { useSync } from '../hooks/useSync';
import { useLit } from '../hooks/useLit';


export default function AiChat({ open, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [bufferOnline, setBufferOnline] = useState(false);
  const scrollRef = useRef(null);

  // --- THE GLASS COCKPIT STATE ---
  const [activeContext, setActiveContext] = useState({
    file: 'No active file',
    hasSelection: false
  });

  const { spoons, nodes } = useSync();
  const { decryptNode } = useLit();

  const { postMessage } = useVscode((message) => {
    if (message.command === 'bufferStatus') {
      setBufferOnline(message.data.connected);
    }
    if (message.command === 'updateContext') {
      setActiveContext({
        file: message.data.activeFile || 'No active file',
        hasSelection: message.data.hasSelection || false
      });
    }
    if (message.command === 'bufferStream') {
      try {
        const chunk = JSON.parse(message.data);
        if (chunk.type === 'content') {
          // update last assistant message
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + chunk.text };
            } else {
              updated.push({ role: 'assistant', content: chunk.text });
            }
            return updated;
          });
        } else if (chunk.type === 'route') {
          console.log('Model Route:', chunk);
          setRouteInfo(chunk);
        } else if (chunk.type === 'auth_request') {
          setMessages(prev => [...prev, { 
            type: 'auth_request', 
            nodeId: chunk.nodeId,
            content: `Access required for Sovereign node: ${chunk.nodeId}`
          }]);
        }
      } catch (e) {
        console.error('Stream parse error', e);
      }
    }
  });

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const handleAuthorize = async (nodeId) => {
    // Check Spoons via the Sync Hook (already in App.jsx context)
    if (spoons < 5.0) {
      postMessage({ command: 'showError', data: 'Cognitive Voltage too low for decryption.' });
      return;
    }
    
    // 2. Trigger the Decryption
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node.ciphertext) return;
    
    const plaintext = await decryptNode(node.ciphertext, node.accessControlConditions);
    
    if (plaintext) {
      // 3. Send the unlocked content back to the AI Mesh
      postMessage({
        command: 'sendToBuffer',
        data: { action: 'provide_auth_content', nodeId, content: plaintext }
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setIsStreaming(true);
    setRouteInfo(null);

    // send through bus bar
    postMessage({
      command: 'sendToBuffer',
      data: { action: 'chat', content: userMsg }
    });
  };


  if (!open) return null;

  return (
    <div className="chat-panel panel">
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>AI CHAT</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {routeInfo && (
            <span className="route-badge" style={{ fontSize: 9 }}>
              {routeInfo.domain} / {routeInfo.model}
            </span>
          )}
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="inspector-empty">Ask P31 anything. Route + context enrichment happens server-side.</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            {msg.type === 'auth_request' ? (
              <div className="panel" style={{ border: '1px solid #ffe66d', padding: '10px', marginTop: '10px' }}>
                <p style={{ fontSize: '10px', color: '#ffe66d' }}>🔒 ACCESS REQUEST: {msg.nodeId}</p>
                <button className="btn-primary btn-sm" onClick={() => handleAuthorize(msg.nodeId)}>
                  Authorize (Spoon-Gate)
                </button>
              </div>
            ) : (
              <div className="chat-msg-content">{msg.content}</div>
            )}
          </div>
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="chat-msg assistant">
            <div className="chat-msg-content streaming-indicator">...</div>
          </div>
        )}
      </div>

      {/* --- THE GLASS COCKPIT BADGE --- */}
      <div 
        style={{
          padding: '4px 8px',
          fontSize: '10px',
          color: activeContext.hasSelection ? '#ffe66d' : '#a29bfe',
          background: 'rgba(5, 5, 16, 0.8)',
          borderTop: `1px solid ${activeContext.hasSelection ? '#ffe66d30' : '#a29bfe30'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontFamily: '"JetBrains Mono", monospace'
        }}
      >
        <span>{activeContext.hasSelection ? '📎 Selection Attached:' : '📄 Active Context:'}</span>
        <span style={{ opacity: 0.8 }}>{activeContext.file}</span>
      </div>
      <form onSubmit={handleSubmit} className="chat-input-wrap">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={bufferOnline ? "Ask P31..." : "Buffer Agent offline..."}
          disabled={isStreaming || !bufferOnline}
          className="chat-input"
        />
        <button type="submit" className="btn-primary btn-sm" disabled={isStreaming || !input.trim() || !bufferOnline}>
          Send
        </button>
      </form>
    </div>
  );
}
