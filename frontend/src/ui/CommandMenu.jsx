import React, { useState, useRef, useEffect } from 'react';
import { COLORS } from '../constants';

const ACTIONS = [
  { id: 'ingest',  label: 'Ingest Node',     shortcut: 'I', icon: '+' },
  { id: 'chat',    label: 'AI Chat',          shortcut: 'C', icon: '>' },
  { id: 'brain',   label: 'Graph Brain',      shortcut: 'G', icon: '#' },
  { id: 'export',  label: 'Export Data',       shortcut: 'E', icon: 'D' },
  { id: 'breathe', label: 'Breathing Pacer',   shortcut: 'B', icon: '*' },
];

export default function CommandMenu({ open, onClose, onAction }) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);

  const filtered = ACTIONS.filter(
    (a) => a.label.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  if (!open) return null;

  function handleKey(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter' && filtered[selectedIdx]) {
      onAction(filtered[selectedIdx].id);
      onClose();
    }
  }

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()} onKeyDown={handleKey}>
        <input
          ref={inputRef}
          className="cmd-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command..."
        />
        <div className="cmd-list">
          {filtered.map((action, i) => (
            <div
              key={action.id}
              className={`cmd-item ${i === selectedIdx ? 'selected' : ''}`}
              onClick={() => { onAction(action.id); onClose(); }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <span className="cmd-icon">{action.icon}</span>
              <span className="cmd-label">{action.label}</span>
              <span className="cmd-shortcut">{action.shortcut}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="cmd-empty">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  );
}
