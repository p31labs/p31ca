/**
 * useBreathSync — Global breathing state manager
 *
 * Provides synchronized breath phase information across all components.
 * Updates CSS custom property for shader/style integration.
 *
 * Breathing pattern: 4s inhale, 2s hold, 6s exhale (12s total)
 */

import { useRef, useCallback, useSyncExternalStore } from 'react';
import { BREATHING_PATTERN } from '../constants';

const CYCLE_DURATION = BREATHING_PATTERN.inhale + BREATHING_PATTERN.hold + BREATHING_PATTERN.exhale;
const INHALE_END = BREATHING_PATTERN.inhale;
const HOLD_END = BREATHING_PATTERN.inhale + BREATHING_PATTERN.hold;

// Shared state for all subscribers
let breathState = {
  phase: 'inhale',      // 'inhale' | 'hold' | 'exhale'
  progress: 0,          // 0-1 progress within current phase
  cycleProgress: 0,     // 0-1 progress within full cycle
  intensity: 0,         // 0-1 breathing intensity (for shaders)
  timestamp: 0,         // Last update timestamp
};

let subscribers = new Set();
let animationFrame = null;
let startTime = null;

function notifySubscribers() {
  subscribers.forEach(callback => callback());
}

function updateBreathState(timestamp) {
  if (!startTime) startTime = timestamp;

  const elapsed = (timestamp - startTime) / 1000; // seconds
  const cycleTime = elapsed % CYCLE_DURATION;
  const cycleProgress = cycleTime / CYCLE_DURATION;

  let phase, progress, intensity;

  if (cycleTime < INHALE_END) {
    // Inhale phase
    phase = 'inhale';
    progress = cycleTime / BREATHING_PATTERN.inhale;
    // Intensity ramps up during inhale
    intensity = progress;
  } else if (cycleTime < HOLD_END) {
    // Hold phase
    phase = 'hold';
    progress = (cycleTime - INHALE_END) / BREATHING_PATTERN.hold;
    // Intensity stays high during hold
    intensity = 1.0;
  } else {
    // Exhale phase
    phase = 'exhale';
    progress = (cycleTime - HOLD_END) / BREATHING_PATTERN.exhale;
    // Intensity ramps down during exhale
    intensity = 1.0 - progress;
  }

  breathState = {
    phase,
    progress,
    cycleProgress,
    intensity,
    timestamp,
  };

  // Update CSS custom property for style-based animations
  document.documentElement.style.setProperty('--breath-phase', intensity.toFixed(3));
  document.documentElement.style.setProperty('--breath-cycle', cycleProgress.toFixed(3));

  notifySubscribers();
  animationFrame = requestAnimationFrame(updateBreathState);
}

function startBreathLoop() {
  if (!animationFrame) {
    animationFrame = requestAnimationFrame(updateBreathState);
  }
}

function stopBreathLoop() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
    startTime = null;
  }
}

function subscribe(callback) {
  subscribers.add(callback);

  // Start the loop when first subscriber
  if (subscribers.size === 1) {
    startBreathLoop();
  }

  return () => {
    subscribers.delete(callback);

    // Stop when no more subscribers
    if (subscribers.size === 0) {
      stopBreathLoop();
    }
  };
}

function getSnapshot() {
  return breathState;
}

/**
 * Hook to access synchronized breathing state.
 *
 * @returns {{
 *   phase: 'inhale' | 'hold' | 'exhale',
 *   progress: number,
 *   cycleProgress: number,
 *   intensity: number
 * }}
 */
export function useBreathSync() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Get current breath state without subscribing to updates.
 * Useful for animation loops that already have their own RAF.
 */
export function getBreathState() {
  return breathState;
}

/**
 * Calculate phase-specific easing for smooth animations.
 *
 * @param {string} phase - Current breath phase
 * @param {number} progress - Phase progress 0-1
 * @returns {number} Eased value 0-1
 */
export function getBreathEasing(phase, progress) {
  switch (phase) {
    case 'inhale':
      // Ease-out for natural inhale feel
      return 1 - Math.pow(1 - progress, 2);
    case 'hold':
      // Subtle pulse during hold
      return 1.0 + 0.02 * Math.sin(progress * Math.PI * 2);
    case 'exhale':
      // Ease-in for natural exhale feel
      return 1 - Math.pow(progress, 2);
    default:
      return progress;
  }
}

export default useBreathSync;
