import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createPardalEasing } from './pardal-flight-easing';
import {
  advanceWingPhase,
  APPROACH_END,
  BEAT_HZ_NEAR,
  BEAT_HZ_START,
  DOWNSTROKE_SHARE,
  GLIDE_DIHEDRAL,
  GLIDE_SWEEP_BACK,
  mirrorWingPose,
  REST_BEAT_HZ,
  REST_LIFT,
  REST_SWING,
  resolveFlight as resolveFlightWithEasing,
  resolveFlightPoint,
  resolveFlightRibbon,
  resolveRestDrive,
  resolveWingBeat,
  resolveWingPose,
  WING_DOWN,
  WING_PITCH,
  WING_SWEEP,
  WING_UP,
} from './pardal-flight-wings';

const css = readFileSync(new URL('../../../index.css', import.meta.url), 'utf8');
const easing = createPardalEasing((name) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1] ?? '');
const resolveFlight = (progress: number) => resolveFlightWithEasing(progress, easing);

const near = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} não está a ${tolerance} de ${expected}`);
const steps = (count: number) => Array.from({ length: count + 1 }, (_, index) => index / count);

describe('Pardal wing beat', () => {
  it('starts at the top, bottoms out at the end of the downstroke and repeats every cycle', () => {
    near(resolveWingBeat(0).stroke, WING_UP);
    near(resolveWingBeat(DOWNSTROKE_SHARE).stroke, -WING_DOWN);
    near(resolveWingBeat(1).stroke, WING_UP);
    assert.deepEqual(resolveWingBeat(3.25), resolveWingBeat(0.25));
    near(resolveWingBeat(-0.75).stroke, resolveWingBeat(0.25).stroke);
  });

  it('swings higher on the upstroke than it reaches on the downstroke, and never beyond either', () => {
    assert.ok(WING_UP > WING_DOWN);
    for (const phase of steps(200)) {
      const { stroke } = resolveWingBeat(phase);
      assert.ok(stroke <= WING_UP + 1e-9 && stroke >= -WING_DOWN - 1e-9);
    }
  });

  it('spends more of the cycle pushing down than recovering', () => {
    assert.ok(DOWNSTROKE_SHARE > 0.5 && DOWNSTROKE_SHARE < 0.7);
    const falling = steps(1000).filter((phase) => resolveWingBeat(phase + 1e-4).stroke < resolveWingBeat(phase).stroke).length;
    near(falling / 1001, DOWNSTROKE_SHARE, 0.01);
  });

  it('is continuous across the cycle, including both stroke reversals', () => {
    const samples = steps(2000).map(resolveWingBeat);
    samples.slice(1).forEach((beat, index) => {
      assert.ok(Math.abs(beat.stroke - samples[index].stroke) < 0.01);
      assert.ok(Math.abs(beat.twist - samples[index].twist) < 0.01);
    });
  });

  it('twists one way on the downstroke and the other on the upstroke, flat at both reversals', () => {
    assert.ok(resolveWingBeat(DOWNSTROKE_SHARE / 2).twist > 0);
    assert.ok(resolveWingBeat((1 + DOWNSTROKE_SHARE) / 2).twist < 0);
    near(resolveWingBeat(0).twist, 0);
    near(resolveWingBeat(DOWNSTROKE_SHARE).twist, 0);
  });

  it('lifts the body while the wings push down', () => {
    near(resolveWingBeat(0).heave, -1);
    near(resolveWingBeat(DOWNSTROKE_SHARE).heave, 1);
  });

  it('advances the phase by frequency and time, wrapped to one cycle', () => {
    near(advanceWingPhase(0, 4, 0.125), 0.5);
    near(advanceWingPhase(0.9, 5, 0.1), 0.4);
    near(advanceWingPhase(0.3, 0, 10), 0.3);
  });
});

describe('Pardal wing pose', () => {
  it('keeps the logo pose while the wings are not driven', () => {
    for (const phase of steps(8)) {
      assert.deepEqual(resolveWingPose(resolveRestDrive(0), resolveWingBeat(phase)), { sweep: 0, flap: 0, twist: 0, lift: 0 });
    }
  });

  it('mirrors the far wing on the near one at every phase, so the two beat together', () => {
    const flight = resolveFlight(0.3);
    for (const phase of steps(40)) {
      const pose = resolveWingPose({ ...flight, flick: 0.5 }, resolveWingBeat(phase));
      const nearWing = mirrorWingPose(pose, 1);
      const farWing = mirrorWingPose(pose, -1);
      assert.deepEqual(nearWing, pose);
      near(farWing.sweep, -nearWing.sweep);
      near(farWing.flap, -nearWing.flap);
      near(farWing.twist, -nearWing.twist);
      near(farWing.lift, nearWing.lift);
    }
  });

  it('flaps around the open position at full spread', () => {
    const drive = { spread: 1, amplitude: 1, glide: 0, flick: 0 };
    const top = resolveWingPose(drive, resolveWingBeat(0));
    const bottom = resolveWingPose(drive, resolveWingBeat(DOWNSTROKE_SHARE));
    near(top.sweep, WING_SWEEP);
    near(top.flap, WING_UP);
    near(bottom.flap, -WING_DOWN);
    near(top.twist, WING_PITCH);
    assert.ok(resolveWingPose(drive, resolveWingBeat(DOWNSTROKE_SHARE / 2)).twist > WING_PITCH);
  });

  it('holds the wings open and still while gliding', () => {
    const drive = { spread: 1, amplitude: 1, glide: 1, flick: 0 };
    for (const phase of steps(8)) {
      const pose = resolveWingPose(drive, resolveWingBeat(phase));
      near(pose.sweep, WING_SWEEP - GLIDE_SWEEP_BACK);
      assert.ok(pose.sweep > WING_SWEEP / 2);
      near(pose.flap, GLIDE_DIHEDRAL);
      near(pose.twist, WING_PITCH);
    }
  });

  it('only lifts the folded wing a little at rest, slower than any flight beat', () => {
    assert.ok(REST_BEAT_HZ < BEAT_HZ_NEAR);
    for (const phase of steps(20)) {
      const pose = resolveWingPose(resolveRestDrive(1), resolveWingBeat(phase));
      assert.equal(pose.sweep, 0);
      assert.equal(pose.flap, 0);
      assert.ok(pose.lift >= REST_LIFT - REST_SWING - 1e-9 && pose.lift <= REST_LIFT + REST_SWING + 1e-9);
      assert.ok(pose.lift < (20 * Math.PI) / 180);
    }
    assert.deepEqual(resolveRestDrive(5), resolveRestDrive(1));
    assert.deepEqual(resolveRestDrive(-1), resolveRestDrive(0));
  });
});

describe('Pardal flight by scroll progress', () => {
  const flights = steps(200).map((step) => resolveFlight(step * APPROACH_END));

  it('starts from the resting logo pose', () => {
    const start = resolveFlight(0);
    assert.equal(start.depth, 0);
    assert.equal(start.heading, 0);
    assert.equal(start.spread, 0);
    assert.equal(start.band, 0);
    assert.equal(start.travel, 0);
    assert.equal(start.ink, 1);
    assert.equal(start.fill, 0);
    assert.equal(start.flying, false);
  });

  it('comes from the back of the scene to the camera, ending at cover size', () => {
    const farthest = flights.reduce((lowest, flight) => (flight.depth < lowest.depth ? flight : lowest));
    assert.ok(farthest.depth < 0 && farthest.approach < 0.4);
    const closing = flights.filter((flight) => flight.approach >= 0.4);
    closing.slice(1).forEach((flight, index) => assert.ok(flight.depth > closing[index].depth));
    near(resolveFlight(APPROACH_END).depth, 1);
    assert.ok(resolveFlight(APPROACH_END / 2).depth < 0.35);
  });

  it('beats faster at the start and inside the slower 2–3.5 Hz range', () => {
    assert.equal(resolveFlight(0).beatHz, BEAT_HZ_START);
    assert.ok(BEAT_HZ_START <= 3.5 && BEAT_HZ_NEAR >= 2);
    flights.slice(1).forEach((flight, index) => assert.ok(flight.beatHz <= flights[index].beatHz));
    near(resolveFlight(APPROACH_END).beatHz, BEAT_HZ_NEAR);
  });

  it('opens the wings early, then glides with them open before the strokes fade', () => {
    const flapping = resolveFlight(0.25 * APPROACH_END);
    assert.equal(flapping.spread, 1);
    assert.equal(flapping.glide, 0);
    const gliding = resolveFlight(0.7 * APPROACH_END);
    assert.equal(gliding.spread, 1);
    assert.equal(gliding.glide, 1);
    assert.equal(gliding.ink, 1);
    assert.equal(gliding.flying, true);
    flights.slice(1).forEach((flight, index) => assert.ok(flight.glide >= flights[index].glide));
  });

  it('turns to the viewer while small and is flat again before it covers the screen', () => {
    assert.equal(resolveFlight(0.4 * APPROACH_END).heading, 1);
    assert.equal(resolveFlight(0.9 * APPROACH_END).heading, 0);
    flights.forEach((flight) => assert.ok(flight.heading >= 0 && flight.heading <= 1));
  });

  it('fades the strokes and fills the body by the end of the approach, then fades the fill', () => {
    const covered = resolveFlight(APPROACH_END);
    assert.equal(covered.ink, 0);
    assert.equal(covered.fill, 1);
    assert.equal(covered.flying, false);
    assert.equal(resolveFlight(1).fill, 1);
    near(resolveFlight(1.5).fill, 1 - easing.exit(0.5));
    assert.equal(resolveFlight(2).fill, 0);
    assert.equal(resolveFlight(2).flying, false);
  });

  it('depends only on the progress, so it scrubs the same in both directions', () => {
    const down = [0.1, 0.4, 0.7, 1, 1.6].map(resolveFlight);
    const up = [1.6, 1, 0.7, 0.4, 0.1].map(resolveFlight).reverse();
    assert.deepEqual(up, down);
  });
});

describe('Pardal flight path', () => {
  const anchors = { start: { x: 60, y: 340 }, end: { x: 700, y: 430 }, bandY: 780, centerX: 700, curveHeight: 80 };
  const pointAt = (approach: number) => resolveFlightPoint(resolveFlight(approach * APPROACH_END), anchors);

  it('leaves from the resting spot and ends on the cover position', () => {
    assert.deepEqual(pointAt(0), anchors.start);
    const end = pointAt(1);
    near(end.x, anchors.end.x);
    near(end.y, anchors.end.y);
  });

  it('dives to the boundary band before crossing the content column', () => {
    const diving = pointAt(0.08);
    assert.equal(diving.x, anchors.start.x);
    assert.ok(diving.y > anchors.start.y);
    const onBand = pointAt(0.12);
    assert.ok(onBand.y <= anchors.bandY && onBand.y > anchors.bandY - 60);
    assert.ok(onBand.x < (anchors.start.x + anchors.end.x) / 2);
  });

  it('moves steadily towards the middle of the screen', () => {
    const xs = steps(50).map((step) => pointAt(step).x);
    xs.slice(1).forEach((x, index) => assert.ok(x >= xs[index]));
  });

  it('follows the band when the boundary moves with the scroll', () => {
    const flight = resolveFlight(0.5 * APPROACH_END);
    const higher = resolveFlightPoint(flight, { ...anchors, bandY: anchors.bandY - 100 });
    near(resolveFlightPoint(flight, anchors).y - higher.y, 100);
  });

  it('draws an S on both sides of the boundary without exceeding its padding', () => {
    const points = steps(200).map((step) => pointAt(0.2 + step * 0.52));
    assert.ok(points.some((point) => point.y < anchors.bandY - 60));
    assert.ok(points.some((point) => point.y > anchors.bandY + 60));
    points.forEach((point) => assert.ok(Math.abs(point.y - anchors.bandY) <= anchors.curveHeight + 1e-9));
  });

  it('mirrors the flight from the other gutter, including on narrow screens', () => {
    for (const width of [390, 1440]) {
      const left = { ...anchors, start: { x: width * 0.12, y: 300 }, end: { x: width / 2, y: 400 }, centerX: width / 2 };
      const right = { ...left, start: { ...left.start, x: width - left.start.x } };
      for (const progress of steps(50)) {
        const flight = resolveFlight(progress * APPROACH_END);
        const a = resolveFlightPoint(flight, left);
        const b = resolveFlightPoint(flight, right);
        near(a.x + b.x, width);
        near(a.y, b.y);
      }
    }
  });

  it('keeps the ribbon attached to the bird and restores its path when reversing scroll', () => {
    const progresses = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1, 1.5, 2];
    const ribbonAt = (progress: number) => resolveFlightRibbon(resolveFlight(progress), anchors, easing);
    assert.deepEqual(progresses.map(ribbonAt), [...progresses].reverse().map(ribbonAt).reverse());
    for (const progress of progresses) {
      const flight = resolveFlight(progress);
      const ribbon = ribbonAt(progress);
      assert.equal(ribbon.length, 49);
      ribbon.forEach((point) => assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y)));
      const head = ribbon.at(-1)!;
      const bird = resolveFlightPoint(flight, anchors);
      near(head.x, bird.x);
      near(head.y, bird.y);
    }
    assert.equal(resolveFlight(0).ribbon, 0);
    assert.equal(resolveFlight(APPROACH_END).ribbon, 0);
    assert.equal(resolveFlight(2).ribbon, 0);
  });
});

describe('Pardal design-system easing', () => {
  it('uses the CSS curves with exact endpoints and no overshoot', () => {
    for (const curve of Object.values(easing)) {
      near(curve(0), 0);
      near(curve(1), 1);
      const samples = steps(100).map(curve);
      samples.forEach((value) => assert.ok(value >= 0 && value <= 1));
      samples.slice(1).forEach((value, index) => assert.ok(value >= samples[index]));
    }
    assert.ok(easing.emphasized(0.5) > easing.standard(0.5));
    assert.ok(easing.standard(0.5) > easing.exit(0.5));
  });
});
