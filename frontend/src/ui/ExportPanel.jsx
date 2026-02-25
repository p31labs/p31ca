import React from 'react';
import { getSpoons, getGraphData } from '../api';

function downloadJSON(data, filename) {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportPanel({ open, onClose, nodesRef, voltageMapRef, activity }) {
  if (!open) return null;

  function exportActivity() {
    downloadJSON(JSON.stringify(activity, null, 2), `p31-activity-${Date.now()}.json`);
  }

  function exportNodes() {
    const nodes = (nodesRef?.current || []).map((n) => ({
      ...n,
      voltage: voltageMapRef?.current?.[n.id] || null,
    }));
    downloadJSON(JSON.stringify(nodes, null, 2), `p31-nodes-${Date.now()}.json`);
  }

  async function exportSpoons() {
    try {
      const state = await getSpoons();
      downloadJSON(JSON.stringify(state, null, 2), `p31-spoons-${Date.now()}.json`);
    } catch (e) {
      console.error('Export spoons failed:', e);
    }
  }

  async function exportAll() {
    try {
      const [spoonsData, graphData] = await Promise.all([getSpoons(), getGraphData()]);
      const dump = {
        timestamp: new Date().toISOString(),
        nodes: nodesRef?.current || [],
        voltage: voltageMapRef?.current || {},
        activity,
        spoons: spoonsData,
        graph: graphData,
      };
      downloadJSON(JSON.stringify(dump, null, 2), `p31-dump-${Date.now()}.json`);
    } catch (e) {
      console.error('Full dump failed:', e);
    }
  }

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">EXPORT DATA</div>
        <div className="export-buttons">
          <button className="btn-export" onClick={exportActivity}>Activity Log (JSON)</button>
          <button className="btn-export" onClick={exportNodes}>All Nodes + Voltage (JSON)</button>
          <button className="btn-export" onClick={exportSpoons}>Spoon History (JSON)</button>
          <button className="btn-export" onClick={exportAll}>Full Dump (JSON)</button>
        </div>
        <button className="btn-secondary" onClick={onClose} style={{ marginTop: 12, width: '100%' }}>Close</button>
      </div>
    </div>
  );
}
