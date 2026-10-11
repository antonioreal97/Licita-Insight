/**
 * Pure flight math for the landing pardal: the wing beat (a function of the beat phase) and the approach towards the
 * viewer (a function of the scroll progress of a moment). No DOM, no three.js — the component only applies the result.
 */

import type { PardalEasing } from './pardal-flight-easing';

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const phase = (from: number, to: number, progress: number) => clamp01((progress - from) / (to - from));

/** The wing swings higher above level than it reaches below it, like a small bird's. */
export const WING_UP = rad(52);
export const WING_DOWN = rad(26);
/** Swing of the wing around its root, from folded along the body (the logo) to held out sideways. */
export const WING_SWEEP = rad(80);
/** Lean of the open wing around its span: the leading edge points into the flight. */
export const WING_PITCH = rad(22);
/** Wings held slightly raised while gliding, and swept back so they still show once the bird is side-on again. */
export const GLIDE_DIHEDRAL = rad(14);
export const GLIDE_SWEEP_BACK = rad(28);
/** The power stroke takes a little longer than the recovery. */
export const DOWNSTROKE_SHARE = 0.56;
const TWIST_DOWN = rad(9);
const TWIST_UP = rad(18);

/** Share of a moment's progress taken by the approach; the rest is the solid-color hold before the boundary. */
export const APPROACH_END = 0.9;
export const BEAT_HZ_START = 5;
export const BEAT_HZ_NEAR = 3;
export const REST_BEAT_HZ = 1.8;
/** While the page scrolls outside a moment the gutter bird only lifts its folded wing a little, in the logo plane. */
export const REST_LIFT = rad(9);
export const REST_SWING = rad(6);

export type WingBeat = {
  /** Wing angle around level, in radians: positive above the back, negative below. */
  stroke: number;
  /** Feathering around the span, in radians: positive on the downstroke, negative on the upstroke. */
  twist: number;
  /** Body response, -1..1: it rises as the wings push down and sinks as they recover. */
  heave: number;
};

/** One wing beat. `phase` is counted in cycles: it starts at the top of the stroke and any real number is accepted. */
export function resolveWingBeat(phase: number): WingBeat {
  const cycle = phase - Math.floor(phase);
  const down = cycle < DOWNSTROKE_SHARE;
  const u = down ? cycle / DOWNSTROKE_SHARE : (cycle - DOWNSTROKE_SHARE) / (1 - DOWNSTROKE_SHARE);
  // -1 at the bottom of the stroke, +1 at the top, with no speed at either end.
  const level = down ? Math.cos(Math.PI * u) : -Math.cos(Math.PI * u);
  const speed = Math.sin(Math.PI * u);
  return {
    stroke: (WING_UP - WING_DOWN) / 2 + ((WING_UP + WING_DOWN) / 2) * level,
    twist: down ? TWIST_DOWN * speed : -TWIST_UP * speed,
    heave: -level,
  };
}

/** Phase is integrated over time so a frequency change never makes the wings jump. */
export function advanceWingPhase(phase: number, hz: number, seconds: number) {
  const next = phase + hz * seconds;
  return next - Math.floor(next);
}

export type WingDrive = {
  /** 0 keeps the wings folded on the body (the logo), 1 holds them out in flight. */
  spread: number;
  /** 0..1 share of the beat that reaches the open wings. */
  amplitude: number;
  /** 0 flapping, 1 wings held open. */
  glide: number;
  /** 0..1 resting beat: the folded wing lifts off the body without leaving the logo plane. */
  flick: number;
};

/**
 * Wing rotations at its root, in radians, all zero in the logo pose: `sweep` swings the wing out sideways, `flap`
 * raises it around the body axis, `twist` turns it around its span and `lift` raises the folded wing in the logo plane.
 */
export function resolveWingPose(drive: WingDrive, beat: WingBeat) {
  const flap = (1 - drive.glide) * drive.amplitude;
  return {
    sweep: drive.spread * (WING_SWEEP - drive.glide * GLIDE_SWEEP_BACK),
    flap: drive.spread * (drive.glide * GLIDE_DIHEDRAL + flap * beat.stroke),
    twist: drive.spread * (WING_PITCH + flap * beat.twist),
    lift: drive.flick * (REST_LIFT - REST_SWING * beat.heave),
  };
}

export type WingPose = ReturnType<typeof resolveWingPose>;

/**
 * The two wings share one pose: `side` (1 or -1) is the face of the logo a wing opens to, so the far wing mirrors the
 * near one and both beat in phase. The in-plane lift is the same for both, which keeps them one drawing at rest.
 */
export function mirrorWingPose(pose: WingPose, side: 1 | -1): WingPose {
  return { sweep: side * pose.sweep, flap: side * pose.flap, twist: side * pose.twist, lift: pose.lift };
}

/** Gutter bird between moments: wings folded while the page is still, a slow shallow beat while it scrolls. */
export function resolveRestDrive(flutter: number): WingDrive {
  return { spread: 0, amplitude: 0, glide: 0, flick: clamp01(flutter) };
}

export type PardalFlight = WingDrive & {
  /** 0..1 along the approach. */
  approach: number;
  /** Exponent of the growth from resting size (0) to covering the screen (1); dips below 0 as the bird takes off. */
  depth: number;
  /** 0..1 turn of the beak (and back) towards the viewer; back to 0 before the bird is large. */
  heading: number;
  /** 0..1 dive from the resting spot to the empty band at the section boundary. */
  band: number;
  /** 0..1 run along that band to the middle of the screen. */
  travel: number;
  /** 0..1 pull from the band to the exact cover position. */
  settle: number;
  beatHz: number;
  /** Opacity of the logo strokes. */
  ink: number;
  /** Opacity of the body fill, which carries the next section's color. */
  fill: number;
  /** The tapered ribbon follows the same path, disappearing before the full-screen zoom. */
  ribbon: number;
  /** Body banks through the S-curve, returning flat for the cover. */
  bank: number;
  /** True while the wings are worth animating over time. */
  flying: boolean;
};

/**
 * Approach of one moment, from its scroll progress (`localProgress` of `resolvePardalScroll`: 0..1 approach and cover,
 * 1..2 fade). Position-driven, so it scrubs the same in both scroll directions.
 */
export function resolveFlight(localProgress: number, easing: PardalEasing): PardalFlight {
  const approach = clamp01(localProgress / APPROACH_END);
  const fade = 1 - easing.exit(clamp01(localProgress - 1));
  const ink = 1 - easing.exit(phase(0.78, 0.97, approach));
  // Start the turn while still descending, so the trail has no cusp where the dive joins the S.
  const travel = easing.standard(phase(0.12, 0.84, approach));
  const settle = easing.emphasized(phase(0.72, 1, approach));
  return {
    approach,
    // Away from the viewer first, then at the camera: slow while far, fast once near.
    depth: easing.exit(approach) - 0.04 * Math.sin(Math.PI * clamp01(approach / 0.4)),
    heading: easing.emphasized(phase(0, 0.16, approach)) * (1 - easing.standard(phase(0.66, 0.9, approach))),
    band: easing.standard(phase(0, 0.2, approach)),
    travel,
    settle,
    spread: easing.emphasized(phase(0, 0.1, approach)),
    amplitude: 1,
    glide: easing.standard(phase(0.42, 0.6, approach)),
    flick: 0,
    beatHz: lerp(BEAT_HZ_START, BEAT_HZ_NEAR, easing.standard(phase(0.05, 0.45, approach))),
    ink,
    fill: easing.emphasized(phase(0.1, 0.45, approach)) * fade,
    ribbon: easing.emphasized(phase(0.12, 0.28, approach)) * (1 - easing.standard(phase(0.66, 0.82, approach))),
    bank: rad(14) * Math.sin(travel * Math.PI * 2) * (1 - settle),
    flying: localProgress > 0.002 && ink > 0.01,
  };
}

type Point = { x: number; y: number };
export type FlightAnchors = {
  start: Point;
  end: Point;
  bandY: number;
  centerX: number;
  curveHeight: number;
};

/**
 * Dive into the boundary's padding, trace an S across it, then zoom into the body. The central waypoint stays fixed
 * while the cover anchor moves with scale, so the ribbon doesn't stretch towards the zoomed body's offscreen origin.
 */
export function resolveFlightPoint(flight: PardalFlight, anchors: FlightAnchors): Point {
  const { start, end, bandY, centerX, curveHeight } = anchors;
  const wave = Math.sin(flight.travel * Math.PI * 2) * curveHeight;
  return {
    x: lerp(lerp(start.x, centerX, flight.travel), end.x, flight.settle),
    y: lerp(lerp(start.y, bandY, flight.band) - wave, end.y, flight.settle),
  };
}

/** A short tail rather than a permanent line across the page; deterministic when scrolling in reverse. */
export function resolveFlightRibbon(flight: PardalFlight, anchors: FlightAnchors, easing: PardalEasing, segments = 48) {
  const from = Math.max(0, flight.approach - 0.32);
  return Array.from({ length: segments + 1 }, (_, index) => {
    const progress = lerp(from, flight.approach, index / segments);
    return resolveFlightPoint(resolveFlight(progress * APPROACH_END, easing), anchors);
  });
}
