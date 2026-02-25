import React from 'react';

export default function StatusBar({ nodeCount, connected }) {
  return (
    <div className="panel">
      <div className="panel-title">System</div>
      <div className="status-grid">
        <div className="status-cell">
          Nodes <span className="val">{nodeCount}</span>
        </div>
        <div className="status-cell">
          WS <span className="val">{connected ? 'connected' : 'offline'}</span>
        </div>
        <div className="status-cell">
          Three.js <span className="val">r128</span>
        </div>
        <div className="status-cell">
          Render <span className="val">bloom</span>
        </div>
      </div>
    </div>
  );
}
