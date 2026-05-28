// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import {test, expect} from 'vitest';
import {_GlobeFlyToInterpolator as GlobeFlyToInterpolator} from '@deck.gl/core';
import {zoomAdjust} from '@deck.gl/core/viewports/globe-viewport';
import {flyToViewport, getFlyToDuration} from '@math.gl/web-mercator';

const SIZE = {width: 1000, height: 800};

test('GlobeFlyToInterpolator follows the shortest great-circle path', () => {
  const interpolator = new GlobeFlyToInterpolator();
  const midpoint = interpolator.interpolateProps(
    {...SIZE, longitude: 179, latitude: 0, zoom: 4, bearing: 0, pitch: 0},
    {...SIZE, longitude: -179, latitude: 0, zoom: 4, bearing: 0, pitch: 0},
    0.5
  );

  expect(
    Math.abs(Math.abs(midpoint.longitude) - 180),
    'antimeridian flight should not travel back through Greenwich'
  ).toBeLessThan(1e-6);
  expect(midpoint.latitude).toBeCloseTo(0);
});

test('GlobeFlyToInterpolator preserves continuous GlobeViewport scale', () => {
  const interpolator = new GlobeFlyToInterpolator();
  const start = {...SIZE, longitude: 0, latitude: 0, zoom: 4, bearing: 0, pitch: 0};
  const end = {...SIZE, longitude: 25, latitude: 60, zoom: 6, bearing: 30, pitch: 50};
  const midpoint = interpolator.interpolateProps(start, end, 0.5);
  const flyTo = flyToViewport(start, end, 0.5, {speed: 1.2, curve: 1.414});
  const expectedScaleZoom = flyTo.zoom - zoomAdjust(flyTo.latitude, true);

  expect(
    midpoint.zoom - zoomAdjust(midpoint.latitude, true),
    'zoom follows the FlyTo curve while staying continuous in globe scale space'
  ).toBeCloseTo(expectedScaleZoom);
  expect(midpoint.bearing).toBeCloseTo(15);
  expect(midpoint.pitch).toBeCloseTo(25);
});

test('GlobeFlyToInterpolator keeps FlyTo zoom easing instead of linear zoom', () => {
  const interpolator = new GlobeFlyToInterpolator({speed: 1.2, curve: 1.414});
  const start = {...SIZE, longitude: -122, latitude: 37, zoom: 3, bearing: 0, pitch: 0};
  const end = {...SIZE, longitude: 2, latitude: 48, zoom: 13, bearing: 25, pitch: 50};
  const quarter = interpolator.interpolateProps(start, end, 0.25);
  const linearScaleZoom =
    (start.zoom - zoomAdjust(start.latitude, true)) * 0.75 +
    (end.zoom - zoomAdjust(end.latitude, true)) * 0.25;
  const quarterScaleZoom = quarter.zoom - zoomAdjust(quarter.latitude, true);

  expect(
    Math.abs(quarterScaleZoom - linearScaleZoom),
    'FlyTo should retain its non-linear pullback/approach profile'
  ).toBeGreaterThan(0.1);
});

test('GlobeFlyToInterpolator stays finite for antipodal endpoints', () => {
  const interpolator = new GlobeFlyToInterpolator();
  const midpoint = interpolator.interpolateProps(
    {...SIZE, longitude: 0, latitude: 0, zoom: 3, bearing: 0, pitch: 0},
    {...SIZE, longitude: 180, latitude: 0, zoom: 5, bearing: 0, pitch: 0},
    0.5
  );

  expect(Number.isFinite(midpoint.longitude)).toBe(true);
  expect(Number.isFinite(midpoint.latitude)).toBe(true);
  expect(Number.isFinite(midpoint.zoom)).toBe(true);
});

test('GlobeFlyToInterpolator computes bounded auto duration', () => {
  const interpolator = new GlobeFlyToInterpolator({speed: 2, minDuration: 250});
  const start = {...SIZE, longitude: 0, latitude: 0, zoom: 2};
  const end = {...SIZE, longitude: 90, latitude: 45, zoom: 8, transitionDuration: 'auto'};
  const duration = interpolator.getDuration(start, end);

  expect(duration).toBeGreaterThanOrEqual(250);
  expect(duration).toBeCloseTo(getFlyToDuration(start, end, {speed: 2, curve: 1.414}));

  const skippedDuration = new GlobeFlyToInterpolator({maxDuration: 1}).getDuration(
    {...SIZE, longitude: 0, latitude: 0, zoom: 2},
    {...SIZE, longitude: 90, latitude: 45, zoom: 8, transitionDuration: 'auto'}
  );
  expect(skippedDuration).toBe(0);
});
