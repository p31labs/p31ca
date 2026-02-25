import React from 'react';
import { AXIS_NAMES, COLORS } from '../constants';

const LEVEL_CLR = {
  GREEN: COLORS.phosphorus,
  YELLOW: COLORS.gold,
  RED: COLORS.coral,
  CRITICAL: '#ff2222',
};

export default function NodeInspector({ node, voltage }) {
  if (!node) {
    return (
      <div className="panel">
        <div className="panel-title">Node Inspector</div>
        <div className="inspector-empty">Click a node on the dome</div>
      </div>
    );
  }

  const axisColor = {
    A: COLORS.coral,
    B: COLORS.teal,
    C: COLORS.gold,
    D: COLORS.purple,
  }[node.axis] || COLORS.text;

  return (
    <div className="panel" style={{ borderColor: `${axisColor}30` }}>
      <div className="panel-title" style={{ color: axisColor, opacity: 1 }}>
        Node Inspector
      </div>

      <div className="inspector-row">
        <span className="label">Axis</span>
        <span className="value" style={{ color: axisColor }}>
          {node.axis} — {AXIS_NAMES[node.axis] || 'Unknown'}
        </span>
      </div>

      <div className="inspector-content">
        {(node.content || node.id).slice(0, 120)}
      </div>

      {node.timestamp && (
        <div className="inspector-row">
          <span className="label">Ingested</span>
          <span className="value">{new Date(node.timestamp).toLocaleTimeString()}</span>
        </div>
      )}

      {!voltage && (
        <div className="inspector-empty" style={{ padding: '8px 0' }}>
          No voltage data — ingest to score
        </div>
      )}

      {/* Sovereign promotion */}
      {!node.ciphertext && (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <button
            style={{
              padding: '6px 12px',
              background: COLORS.gold,
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onClick={() => {
              // notify backend to encrypt this node via membrane
              window.parent.postMessage({
                command: 'sendToBuffer',
                data: { action: 'promote_to_sovereign', node_id: node.id },
              }, '*');
            }}
          >
            🔒 Promote to Sovereign
          </button>
        </div>
      )}

      {voltage && (
        <div className="voltage-section">
          <div className="voltage-row">
            <span>Urgency</span>
            <div className="voltage-bar">
              <div style={{ width: `${(voltage.urgency || 0) * 10}%`, background: COLORS.coral }} />
            </div>
            <span>{(voltage.urgency || 0).toFixed(1)}</span>
          </div>
          <div className="voltage-row">
            <span>Emotional</span>
            <div className="voltage-bar">
              <div style={{ width: `${(voltage.emotional || 0) * 10}%`, background: COLORS.gold }} />
            </div>
            <span>{(voltage.emotional || 0).toFixed(1)}</span>
          </div>
          <div className="voltage-row">
            <span>Cognitive</span>
            <div className="voltage-bar">
              <div style={{ width: `${(voltage.cognitive || 0) * 10}%`, background: COLORS.purple }} />
            </div>
            <span>{(voltage.cognitive || 0).toFixed(1)}</span>
          </div>
          <div className="voltage-summary">
            {voltage.level && (
              <span
                className="voltage-badge"
                style={{
                  background: (LEVEL_CLR[voltage.level] || COLORS.text) + '30',
                  color: LEVEL_CLR[voltage.level] || COLORS.text,
                }}
              >
                {voltage.level}
              </span>
            )}
            <span style={{ color: COLORS.text, opacity: 0.6, fontSize: 11 }}>
              composite {(voltage.composite || 0).toFixed(1)}
              {voltage.spoon_cost != null && ` · cost ${voltage.spoon_cost} spoons`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
