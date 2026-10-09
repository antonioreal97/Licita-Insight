import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildVolumeScale, VOLUME_LEVELS, volumeLevel } from './volume-scale';

// 27 states with the usual shape: a few concentrate most of the volume.
const skewed = [
  4, 6, 9, 12, 15, 18, 22, 27, 31, 38, 44, 52, 60, 71, 85, 98, 120, 150, 190, 240, 310, 420, 600, 900, 1400, 2300, 5200,
];

describe('buildVolumeScale', () => {
  it('splits the states into five contiguous bands of about the same size', () => {
    const scale = buildVolumeScale(skewed);

    assert.deepEqual(scale.map((band) => band.level), [1, 2, 3, 4, 5]);
    assert.equal(scale[0].min, 4);
    assert.equal(scale[4].max, 5200);
    for (let i = 1; i < scale.length; i += 1) assert.equal(scale[i - 1].max, scale[i].min - 1);
    const perBand = scale.map((band) => skewed.filter((value) => value >= band.min && value <= band.max).length);
    assert.deepEqual(perBand, [6, 5, 6, 5, 5]);
  });

  it('does not depend on the order of the input and leaves it untouched', () => {
    const shuffled = [...skewed].reverse();
    assert.deepEqual(buildVolumeScale(shuffled), buildVolumeScale(skewed));
    assert.equal(shuffled[0], 5200);
  });

  it('leaves states without open tenders out of the bands', () => {
    const scale = buildVolumeScale([0, 0, 3, 8]);
    assert.equal(scale[0].min, 3);
    assert.equal(volumeLevel(0, scale), 0);
  });

  it('keeps equal values in the same band', () => {
    const scale = buildVolumeScale([5, 5, 5, 5, 5, 5, 9, 9, 40]);
    assert.deepEqual(
      scale.map(({ min, max }) => [min, max]),
      [
        [5, 8],
        [9, 39],
        [40, 40],
      ],
    );
    assert.equal(volumeLevel(5, scale), 1);
    assert.equal(volumeLevel(9, scale), 3);
    assert.equal(volumeLevel(40, scale), VOLUME_LEVELS);
  });

  it('gives the highest band the top level even with few distinct values', () => {
    assert.deepEqual(buildVolumeScale([7, 7, 7]), [{ level: VOLUME_LEVELS, min: 7, max: 7 }]);
    assert.deepEqual(buildVolumeScale([2, 10]).map((band) => band.level), [1, VOLUME_LEVELS]);
    assert.deepEqual(buildVolumeScale([]), []);
    assert.deepEqual(buildVolumeScale([0, 0]), []);
  });
});

describe('volumeLevel', () => {
  const scale = buildVolumeScale(skewed);

  it('grows with the value and never skips back', () => {
    const levels = skewed.map((value) => volumeLevel(value, scale));
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
    assert.equal(levels[0], 1);
    assert.equal(levels.at(-1), VOLUME_LEVELS);
  });

  it('puts band edges on the right side', () => {
    const [first, second] = scale;
    assert.equal(volumeLevel(first.max, scale), 1);
    assert.equal(volumeLevel(second.min, scale), 2);
    assert.equal(volumeLevel(999_999, scale), VOLUME_LEVELS);
  });
});
