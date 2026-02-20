// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import test from 'tape-promise/tape';
import {_GlobeViewport as GlobeViewport} from '@deck.gl/core';
import {equals, config} from '@math.gl/core';

const TEST_VIEWPORTS = [
  {
    width: 800,
    height: 600,
    latitude: 38,
    longitude: -122,
    zoom: 12
  },
  {
    width: 800,
    height: 600,
    latitude: 80,
    longitude: 0,
    zoom: 1
  }
];

test('GlobeViewport#constructor', t => {
  t.ok(new GlobeViewport() instanceof GlobeViewport, 'Created new GlobeViewport with default args');

  const viewport = new GlobeViewport({
    ...TEST_VIEWPORTS[0],
    width: 0,
    height: 0
  });
  t.ok(
    viewport instanceof GlobeViewport,
    'WebMercatorViewport constructed successfully with 0 width and height'
  );
  t.ok(viewport.isGeospatial, 'Viewport is geospatial');

  t.end();
});

test('GlobeViewport#distanceScale', t => {
  for (const testCase of TEST_VIEWPORTS) {
    const viewport = new GlobeViewport(testCase);

    const {unitsPerMeter, metersPerUnit, unitsPerDegree, degreesPerUnit} =
      viewport.getDistanceScales();
    t.ok(
      equals(
        [
          unitsPerMeter[0] * metersPerUnit[0],
          unitsPerMeter[1] * metersPerUnit[1],
          unitsPerMeter[2] * metersPerUnit[2]
        ],
        [1, 1, 1]
      ),
      'metersPerUnit x unitsPerMeter'
    );

    t.ok(
      equals(
        [
          unitsPerDegree[0] * degreesPerUnit[0],
          unitsPerDegree[1] * degreesPerUnit[1],
          unitsPerDegree[2] * degreesPerUnit[2]
        ],
        [1, 1, 1]
      ),
      'degreesPerUnit x unitsPerDegree'
    );
  }

  t.end();
});

test('GlobeViewport#projectPosition, unprojectPosition', t => {
  const oldEpsilon = config.EPSILON;
  config.EPSILON = 1e-9;

  for (const testCase of TEST_VIEWPORTS) {
    const viewport = new GlobeViewport(testCase);

    const testPositions = [
      [viewport.longitude, viewport.latitude],
      [viewport.longitude, viewport.latitude, 1000],
      [viewport.longitude - 0.1, viewport.latitude - 0.1]
    ];

    for (const pos of testPositions) {
      const commonPosition = viewport.projectPosition(pos);
      const pos1 = pos.length === 2 ? pos.concat(0) : pos;
      const pos2 = viewport.unprojectPosition(commonPosition);

      t.comment(pos1);
      t.comment(pos2);
      t.ok(equals(pos1, pos2), 'center projectPosition/unprojectPosition round trip');
    }
  }

  config.EPSILON = oldEpsilon;
  t.end();
});

test('GlobeViewport#project, unproject#center', t => {
  const oldEpsilon = config.EPSILON;
  config.EPSILON = 1e-9;

  for (const testCase of TEST_VIEWPORTS) {
    const viewport = new GlobeViewport(testCase);

    let screenCenter = viewport.project([viewport.longitude, viewport.latitude, 0]);
    t.comment(screenCenter);
    t.ok(
      equals(screenCenter.slice(0, 2), [viewport.width / 2, viewport.height / 2]),
      'viewport center is projected to screen center'
    );
    t.ok(screenCenter[2] > -1 && screenCenter[2] < 1, 'viewport center is visible');

    screenCenter = viewport.project([viewport.longitude, viewport.latitude, 1000]);
    t.comment(screenCenter);
    t.ok(
      equals(screenCenter.slice(0, 2), [viewport.width / 2, viewport.height / 2]),
      'point over viewport center is projected to screen center'
    );
    t.ok(screenCenter[2] > -1 && screenCenter[2] < 1, 'point over viewport center is visible');
  }

  config.EPSILON = oldEpsilon;
  t.end();
});

test('GlobeViewport#project, unproject', t => {
  const oldEpsilon = config.EPSILON;
  config.EPSILON = 1e-7;

  for (const testCase of TEST_VIEWPORTS) {
    const viewport = new GlobeViewport(testCase);

    const testPositions = [
      [viewport.longitude - 0.1, viewport.latitude - 0.1],
      [viewport.longitude - 0.1, viewport.latitude - 0.1, 1000],
      [viewport.longitude + 0.1, viewport.latitude - 0.1],
      [viewport.longitude + 0.1, viewport.latitude - 0.1, 1000]
    ];

    for (const pos of testPositions) {
      const screenPosition = viewport.project(pos);
      let pos2 = viewport.unproject(screenPosition);

      t.comment(pos);
      t.comment(pos2);
      t.ok(equals(pos, pos2), 'center project/unproject round trip');

      if (pos.length === 3) {
        pos2 = viewport.unproject(screenPosition.slice(0, 2), {targetZ: pos[2]});
        t.comment(pos2);
        t.ok(equals(pos, pos2), 'center project/unproject (targetZ) round trip');
      }
    }

    t.ok(
      viewport.unproject([0, 0]),
      'unprojecting out-of-bounds pixels still returns a valid coordinate'
    );
    t.ok(
      viewport.unproject([viewport.width, viewport.height]),
      'unprojecting out-of-bounds pixels still returns a valid coordinate'
    );
  }

  config.EPSILON = oldEpsilon;
  t.end();
});

test('GlobeViewport#getBounds', t => {
  for (const testCase of TEST_VIEWPORTS) {
    const bounds = new GlobeViewport(testCase).getBounds();

    t.ok(bounds[0] < testCase.longitude && bounds[2] > testCase.longitude);
  }

  t.end();
});

test('GlobeViewport#bearing', t => {
  // Test viewport with default bearing (0)
  const viewport0 = new GlobeViewport({
    width: 800,
    height: 600,
    latitude: 38,
    longitude: -122,
    zoom: 4
  });
  t.equal(viewport0.bearing, 0, 'Default bearing is 0');

  // Test viewport with non-zero bearing
  const viewport45 = new GlobeViewport({
    width: 800,
    height: 600,
    latitude: 38,
    longitude: -122,
    zoom: 4,
    bearing: 45
  });
  t.equal(viewport45.bearing, 45, 'Bearing is set correctly');

  // Test that center projection still works with bearing
  const screenCenter = viewport45.project([viewport45.longitude, viewport45.latitude, 0]);
  t.ok(
    Math.abs(screenCenter[0] - viewport45.width / 2) < 1,
    'viewport center is projected to screen center x with bearing'
  );
  t.ok(
    Math.abs(screenCenter[1] - viewport45.height / 2) < 1,
    'viewport center is projected to screen center y with bearing'
  );

  // Test viewport with negative bearing
  const viewportNeg90 = new GlobeViewport({
    width: 800,
    height: 600,
    latitude: 38,
    longitude: -122,
    zoom: 4,
    bearing: -90
  });
  t.equal(viewportNeg90.bearing, -90, 'Negative bearing is set correctly');

  t.end();
});

test('GlobeViewport#pitch', t => {
  // Test viewport with default pitch (0)
  const viewport0 = new GlobeViewport({
    width: 800,
    height: 600,
    latitude: 38,
    longitude: -122,
    zoom: 4
  });
  t.equal(viewport0.pitch, 0, 'Default pitch is 0');

  // Test viewport with non-zero pitch
  const viewport45 = new GlobeViewport({
    width: 800,
    height: 600,
    latitude: 38,
    longitude: -122,
    zoom: 4,
    pitch: 45
  });
  t.equal(viewport45.pitch, 45, 'Pitch is set correctly');

  // Test pitch clamping - should clamp to max 85
  const viewport90 = new GlobeViewport({
    width: 800,
    height: 600,
    latitude: 38,
    longitude: -122,
    zoom: 4,
    pitch: 90
  });
  t.equal(viewport90.pitch, 85, 'Pitch is clamped to 85');

  // Test negative pitch clamping - should clamp to min 0
  const viewportNeg = new GlobeViewport({
    width: 800,
    height: 600,
    latitude: 38,
    longitude: -122,
    zoom: 4,
    pitch: -10
  });
  t.equal(viewportNeg.pitch, 0, 'Negative pitch is clamped to 0');

  t.end();
});
