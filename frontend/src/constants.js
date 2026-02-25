/**
 * P31 Shared Constants
 *
 * Palette: Void #050510, Background #0a0f1a, Phosphorus #2dffa0,
 *          Teal #4ecdc4, Coral #ff6b6b, Gold #ffe66d, Purple #a29bfe
 * Taxonomy: A=Identity(coral), B=Health(teal), C=Legal(gold), D=Technical(purple)
 * Spoon baseline: 12, context switch: -1.5
 */

import * as THREE from 'three';

export const COLORS = {
  void: '#050510',
  background: '#0a0f1a',
  phosphorus: '#2dffa0',
  teal: '#4ecdc4',
  coral: '#ff6b6b',
  gold: '#ffe66d',
  purple: '#a29bfe',
  text: '#e0e6ed',
};

export const AXIS_COLORS = {
  A: new THREE.Color(COLORS.coral),
  B: new THREE.Color(COLORS.teal),
  C: new THREE.Color(COLORS.gold),
  D: new THREE.Color(COLORS.purple),
};

export const AXIS_NAMES = {
  A: 'Identity',
  B: 'Health',
  C: 'Legal',
  D: 'Technical',
};

// Import from protocol.js for single source of truth
import { SPOON } from './protocol';

export const SPOON_BASELINE = SPOON.BASELINE;
export const BREATHING_PATTERN = { inhale: 4, hold: 2, exhale: 6 };

// WebSocket URLs
export const WS_URL = `ws://${window.location.hostname}:8031/ws`;
export const CRDT_WS_URL = `ws://${window.location.hostname}:8032`;

// Connection configuration
export const WS_CONFIG = {
  baseReconnectDelay: 1000,
  maxReconnectDelay: 30000,
  maxReconnectAttempts: 20,
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  messageQueueSize: 100,
  messageTTL: 60000,
};

// Quantum effect configuration
export const QUANTUM_CONFIG = {
  // Wavefunction collapse
  wavefunction: {
    collapseTime: 400,           // ms to collapse on hover
    decayTime: 5000,             // ms to restore after observation
    shellCount: 3,               // number of probability shells
    shellPulseFreqs: [1.3, 2.1, 0.7], // Hz for each shell
    maxRadius: 0.4,              // max shell radius
  },
  // Quantum entanglement
  entanglement: {
    pulseSpeed: 3.0,             // wave travel speed
    waveFrequency: 30,           // standing wave frequency
    cascadeDelay: 50,            // ms between entangled node pulses
    threadWidth: 0.02,           // energy thread width
  },
  // Superposition states
  superposition: {
    ghostAlphaBase: 0.15,        // base ghost alpha
    ghostAlphaVariance: 0.1,     // alpha variance amplitude
    flickerThreshold: 0.7,       // voltage threshold for flicker
    flickerFrequency: 20,        // Hz for critical flicker
    maxOffset: 0.15,             // max position offset
  },
  // Energy field dynamics
  energyField: {
    plasmaScale: 0.5,            // plasma noise scale
    chromaBaseOffset: 0.002,     // base chromatic aberration
    chromaStressMultiplier: 2.0, // stress increases aberration
    interferenceFreq1: 20,       // primary interference freq
    interferenceFreq2: 13,       // secondary interference freq
  },
  // Performance
  performance: {
    lodThreshold: 45,            // FPS below which to reduce detail
    maxNodesFullDetail: 100,     // reduce detail above this count
    effectBudgetMs: 4,           // max ms for quantum effects
  },
};

export const SEED_NODES = [
  { id: 'seed_1', content: 'P31 Labs', axis: 'A' },
  { id: 'seed_2', content: 'Spoon Engine', axis: 'B' },
  { id: 'seed_3', content: 'AGPL-3.0', axis: 'C' },
  { id: 'seed_4', content: 'Spaceship Earth', axis: 'D' },
  { id: 'seed_5', content: 'Thick Click', axis: 'D' },
  { id: 'seed_6', content: 'Cognitive Shield', axis: 'B' },
  { id: 'seed_7', content: 'Delta Topology', axis: 'D' },
  { id: 'seed_8', content: 'Phosphorus-31', axis: 'A' },
  { id: 'seed_9', content: 'Breathing Pacer', axis: 'B' },
  { id: 'seed_10', content: 'Buffer Agent', axis: 'D' },
  { id: 'seed_11', content: 'Neo4j Graph', axis: 'D' },
  { id: 'seed_12', content: 'HCB Fiscal Sponsor', axis: 'C' },
];
