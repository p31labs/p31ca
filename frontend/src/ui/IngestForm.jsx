import React, { useState, useRef, useEffect } from 'react';
import { COLORS, AXIS_NAMES } from '../constants';
import { ingestNode, scoreVoltage } from '../api';

const AXIS_KEYS = ['A', 'B', 'C', 'D'];
const AXIS_CLR = { A: COLORS.coral, B: COLORS.teal, C: COLORS.gold, D: COLORS.purple };
const LEVEL_CLR = { GREEN: COLORS.phosphorus, YELLOW: COLORS.gold, RED: COLORS.coral, CRITICAL: '#ff2222' };

export default function IngestForm({ open, onClose, onSuccess, onError }) {
  const [content, setContent] = useState('');
  const [axis, setAxis] = useState('D');
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (content.length < 3) { setPreview(null); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const v = await scoreVoltage(content);
        setPreview(v);
      } catch { setPreview(null); }
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [content]);

  // Focus textarea when form opens
  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  // Handle Escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await ingestNode(content, axis);
      setContent('');
      setPreview(null);
      onSuccess?.({
        message: `Node ${result.node_id || 'created'} ingested successfully`,
        result
      });
      onClose();
    } catch (err) {
      let message = 'Ingest failed';

      if (err.message) {
        if (err.message.includes('413')) {
          message = 'Content too large (max 50KB)';
        } else if (err.message.includes('400')) {
          message = 'Invalid content or axis';
        } else if (err.message.includes('429')) {
          message = 'Too many requests - please wait';
        } else if (err.message.includes('500')) {
          message = 'Server error - please try again';
        } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          message = 'Network error - check connection';
        } else {
          message = err.message;
        }
      }

      setError(message);
      onError?.(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="cmd-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="ingest-title">
      <div className="ingest-modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title" id="ingest-title">INGEST NODE</div>

        {error && (
          <div className="error-banner" role="alert">
            <span className="error-icon">⚠</span>
            <span className="error-message">{error}</span>
            <button
              className="error-dismiss"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label htmlFor="ingest-content" className="sr-only">Content to ingest</label>
          <textarea
            id="ingest-content"
            ref={textareaRef}
            className="ingest-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Content to ingest..."
            maxLength={50000}
            rows={5}
            aria-describedby={error ? 'ingest-error' : undefined}
          />

          <fieldset className="axis-picker">
            <legend className="sr-only">Select axis</legend>
            {AXIS_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className={`axis-pill ${axis === k ? 'active' : ''}`}
                style={{
                  borderColor: AXIS_CLR[k],
                  background: axis === k ? AXIS_CLR[k] + '30' : 'transparent',
                  color: AXIS_CLR[k],
                }}
                onClick={() => setAxis(k)}
                aria-pressed={axis === k}
                aria-label={`${k} - ${AXIS_NAMES[k]}`}
              >
                {k} {AXIS_NAMES[k]}
              </button>
            ))}
          </fieldset>

          {preview && (
            <div className="voltage-preview" aria-live="polite">
              <div className="voltage-row">
                <span>Urgency</span>
                <div className="voltage-bar" role="meter" aria-valuenow={preview.urgency} aria-valuemin={0} aria-valuemax={10}>
                  <div style={{ width: `${preview.urgency * 10}%`, background: COLORS.coral }} />
                </div>
                <span>{preview.urgency.toFixed(1)}</span>
              </div>
              <div className="voltage-row">
                <span>Emotional</span>
                <div className="voltage-bar" role="meter" aria-valuenow={preview.emotional} aria-valuemin={0} aria-valuemax={10}>
                  <div style={{ width: `${preview.emotional * 10}%`, background: COLORS.gold }} />
                </div>
                <span>{preview.emotional.toFixed(1)}</span>
              </div>
              <div className="voltage-row">
                <span>Cognitive</span>
                <div className="voltage-bar" role="meter" aria-valuenow={preview.cognitive} aria-valuemin={0} aria-valuemax={10}>
                  <div style={{ width: `${preview.cognitive * 10}%`, background: COLORS.purple }} />
                </div>
                <span>{preview.cognitive.toFixed(1)}</span>
              </div>
              <div className="voltage-summary">
                <span className="voltage-badge" style={{ background: LEVEL_CLR[preview.level] + '30', color: LEVEL_CLR[preview.level] }}>
                  {preview.level}
                </span>
                <span style={{ color: COLORS.text, opacity: 0.6 }}>
                  composite {preview.composite} &middot; cost {preview.spoon_cost} spoons
                </span>
              </div>
            </div>
          )}

          <div className="ingest-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!content.trim() || submitting}>
              {submitting ? (
                <>
                  <span className="spinner-small" aria-hidden="true" />
                  Ingesting...
                </>
              ) : (
                'Ingest'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
