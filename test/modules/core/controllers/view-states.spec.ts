// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import {test, expect} from 'vitest';
import {
  MapController,
  OrbitController,
  FirstPersonController,
  _GlobeController as GlobeController,
  _GlobeViewport as GlobeViewport,
  OrbitViewport,
  OrthographicController,
  Viewport,
  WebMercatorViewport
} from '@deck.gl/core';
import {normalizeViewportProps} from '@math.gl/web-mercator';

const dummyMakeViewport = (props: any) => new Viewport(props);
const makeGlobeViewViewport = (props: any) =>
  props.zoom > 12 ? new WebMercatorViewport(props) : new GlobeViewport(props);

test('MapViewState', () => {
  const MapViewState = new MapController({} as any).ControllerState;

  let viewState = new MapViewState({
    width: 800,
    height: 600,
    longitude: -182,
    latitude: 36,
    zoom: 0,
    bearing: 180,
    makeViewport: dummyMakeViewport
  });
  let viewportProps = viewState.getViewportProps();
  const expectedProps = normalizeViewportProps({
    width: 800,
    height: 600,
    longitude: -182,
    latitude: 36,
    zoom: 0,
    bearing: 180
  });

  expect(viewportProps.pitch, 'added default pitch').toBe(0);
  expect(viewportProps.longitude, 'props are normalized').toBe(expectedProps.longitude);
  expect(viewportProps.latitude, 'props are normalized').toBe(expectedProps.latitude);
  expect(viewportProps.zoom, 'props are normalized').toBe(expectedProps.zoom);

  const viewState2 = new MapViewState({
    width: 800,
    height: 600,
    longitude: -160,
    latitude: 0,
    zoom: 0,
    bearing: -30,
    makeViewport: dummyMakeViewport
  });

  const transitionViewportProps = viewState2.shortestPathFrom(viewState);
  expect(transitionViewportProps.longitude, 'found shortest path for longitude').toBe(200);
  expect(transitionViewportProps.bearing, 'found shortest path for bearing').toBe(330);

  viewState = new MapViewState({
    width: 800,
    height: 600,
    longitude: -182,
    latitude: 36,
    zoom: 0,
    bearing: 180,
    normalize: false,
    makeViewport: dummyMakeViewport
  });
  viewportProps = viewState.getViewportProps();

  expect(viewportProps.zoom, 'props are not normalized').toBe(0);

  expect(() => new MapViewState({width: 400, height: 300} as any), 'should throw').toThrow();

  viewState = new MapViewState({
    width: 800,
    height: 600,
    longitude: 0,
    latitude: 0,
    zoom: 0,
    bearing: 120,
    maxBounds: [
      [-5, 45],
      [5, 55]
    ],
    makeViewport: dummyMakeViewport
  });
  viewportProps = viewState.getViewportProps();
  expect(viewportProps.longitude, 'longitude is inside maxBounds').toBe(0);
  expect(
    viewportProps.latitude > 45 && viewportProps.latitude < 55,
    'latitude is inside maxBounds'
  ).toBeTruthy();
  expect(viewportProps.zoom > 5, 'zoom is adjusted by maxBounds').toBeTruthy();
});

test('GlobeViewState', () => {
  const GlobeViewState = new GlobeController({} as any).ControllerState;

  let viewState = new GlobeViewState({
    width: 800,
    height: 600,
    longitude: -182,
    latitude: 36,
    zoom: 0,
    makeViewport: dummyMakeViewport
  });
  let viewportProps = viewState.getViewportProps();

  expect(viewportProps.longitude, 'no bounds#longitude is normalized').toBe(178);
  expect(viewportProps.latitude, 'no bounds#latitude is not changed').toBe(36);
  expect(viewportProps.zoom, 'no bounds#zoom is not changed').toBe(0);

  viewState = new GlobeViewState({
    width: 800,
    height: 600,
    longitude: -45,
    latitude: 36,
    zoom: 0,
    maxBounds: [
      [-180, -90],
      [180, 90]
    ],
    makeViewport: dummyMakeViewport
  });
  viewportProps = viewState.getViewportProps();
  expect(viewportProps.longitude, 'full coverage bounds#longitude is not changed').toBe(-45);
  expect(viewportProps.latitude, 'full coverage bounds#latitude is not changed').toBe(36);
  expect(viewportProps.zoom > 1, 'full coverage bounds#zoom is adjusted').toBeTruthy();

  viewState = new GlobeViewState({
    width: 800,
    height: 600,
    longitude: -45,
    latitude: 36,
    zoom: 0,
    maxBounds: [
      [-10, -10],
      [30, 30]
    ],
    makeViewport: dummyMakeViewport
  });
  viewportProps = viewState.getViewportProps();
  expect(viewportProps.longitude, 'medium bounds#longitude is adjusted').toBe(10);
  expect(
    viewportProps.latitude < 30 && viewportProps.latitude > -10,
    'medium bounds#latitude is adjusted'
  ).toBeTruthy();
  expect(viewportProps.zoom > 3, 'medium bounds#zoom is adjusted').toBeTruthy();

  viewState = new GlobeViewState({
    width: 800,
    height: 600,
    longitude: 0,
    latitude: 0,
    zoom: 0,
    maxBounds: [
      [-122.46, 37.75],
      [-122.44, 37.78]
    ],
    makeViewport: dummyMakeViewport
  });
  viewportProps = viewState.getViewportProps();
  expect(
    viewportProps.longitude > -122.46 && viewportProps.longitude < -122.44,
    'small bounds#longitude is adjusted'
  ).toBeTruthy();
  expect(
    viewportProps.latitude < 37.78 && viewportProps.latitude > 37.75,
    'small bounds#latitude is adjusted'
  ).toBeTruthy();
  expect(viewportProps.zoom > 12, 'small bounds#zoom is adjusted').toBeTruthy();
});

test('GlobeViewState applies zoom-parametric latitude and low-zoom orientation constraints', () => {
  const GlobeViewState = new GlobeController({} as any).ControllerState;

  let viewState = new GlobeViewState({
    width: 800,
    height: 600,
    longitude: 0,
    latitude: 80,
    zoom: 2,
    bearing: 90,
    pitch: 40,
    maxLatitude: [
      {zoom: 0, maxLatitude: 50},
      {zoom: 4, maxLatitude: 70}
    ],
    lowZoomOrientationReset: {zoomThreshold: 1, zoomRange: 2},
    makeViewport: dummyMakeViewport
  });
  let viewportProps = viewState.getViewportProps();

  expect(viewportProps.latitude, 'latitude follows interpolated zoom limit').toBe(60);
  expect(viewportProps.zoom, 'latitude clamp does not compensate by zooming').toBe(2);
  expect(viewportProps.bearing, 'bearing remains interactive in the reset range').toBe(90);
  expect(viewportProps.pitch, 'pitch remains interactive in the reset range').toBe(40);

  viewState = new GlobeViewState({
    width: 800,
    height: 600,
    longitude: 0,
    latitude: 40,
    zoom: 0,
    bearing: 90,
    pitch: 40,
    maxLatitude: [
      {zoom: 0, maxLatitude: 50},
      {zoom: 4, maxLatitude: 70}
    ],
    lowZoomOrientationReset: {
      zoomThreshold: 1,
      zoomRange: 2,
      maxBearing: 10,
      maxPitch: 10,
      friction: 0.18
    },
    makeViewport: dummyMakeViewport
  });
  viewportProps = viewState.getViewportProps();

  expect(viewportProps.bearing, 'bearing is resisted below the threshold').toBeCloseTo(24.4);
  expect(viewportProps.pitch, 'pitch is resisted below the threshold').toBeCloseTo(15.4);
});

test('GlobeViewState pan clamps maxLatitude before deriving globe zoom', () => {
  const GlobeViewState = new GlobeController({} as any).ControllerState;
  const start = new GlobeViewState({
    width: 800,
    height: 600,
    longitude: 0,
    latitude: 20,
    zoom: 1.5,
    bearing: 0,
    pitch: 0,
    maxLatitude: [
      {zoom: -1, maxLatitude: 25},
      {zoom: 0, maxLatitude: 35},
      {zoom: 1.5, maxLatitude: 50},
      {zoom: 3, maxLatitude: 70}
    ],
    makeViewport: dummyMakeViewport
  });

  const panned = start.panStart({pos: [400, 300]}).pan({pos: [400, 20000]});
  const viewportProps = panned.getViewportProps();

  expect(viewportProps.latitude, 'pan stays at the latitude ceiling').toBe(50);
  expect(viewportProps.zoom, 'continuing past the ceiling does not zoom out').toBe(1.5);
});

test('GlobeViewState zoom cannot cross dynamic min zoom implied by maxLatitude stops', () => {
  const GlobeViewState = new GlobeController({} as any).ControllerState;
  const start = new GlobeViewState({
    width: 800,
    height: 600,
    longitude: 0,
    latitude: 50,
    zoom: 1.5,
    bearing: 0,
    pitch: 0,
    maxLatitude: [
      {zoom: -1, maxLatitude: 25},
      {zoom: 0, maxLatitude: 35},
      {zoom: 1.5, maxLatitude: 50},
      {zoom: 3, maxLatitude: 70}
    ],
    makeViewport: dummyMakeViewport
  });

  const zoomed = start.zoomStart({pos: [400, 300]}).zoom({pos: [400, 300], scale: 0.25});
  const viewportProps = zoomed.getViewportProps();

  expect(viewportProps.latitude, 'latitude remains at the permitted ceiling').toBe(50);
  expect(viewportProps.zoom, 'zoom is clamped to the stop that permits this latitude').toBe(1.5);
});

test('GlobeViewState honors explicit minGlobeZoom at low latitudes', () => {
  const GlobeViewState = new GlobeController({} as any).ControllerState;
  const start = new GlobeViewState({
    width: 800,
    height: 600,
    longitude: 0,
    latitude: 0,
    zoom: 1.5,
    bearing: 0,
    pitch: 0,
    minZoom: -1,
    minGlobeZoom: 1.25,
    makeViewport: dummyMakeViewport
  });

  const zoomed = start.zoomStart({pos: [400, 300]}).zoom({pos: [400, 300], scale: 0.125});
  const viewportProps = zoomed.getViewportProps();

  expect(viewportProps.zoom, 'explicit globe floor prevents disappearing zoom levels').toBe(1.25);
});

test('GlobeViewState preserves pointer anchored zoom across WebMercator fallback', () => {
  const GlobeViewState = new GlobeController({} as any).ControllerState;

  const pos: [number, number] = [500, 300];
  const crossingStartProps = {
    width: 800,
    height: 600,
    longitude: 0,
    latitude: 0,
    zoom: 11.9,
    zoomAround: 'pointer',
    makeViewport: makeGlobeViewViewport
  };
  const crossingAnchor = makeGlobeViewViewport(crossingStartProps).unproject(pos);
  const crossingZoom = new GlobeViewState(crossingStartProps)
    .zoomStart({pos})
    .zoom({pos, scale: 1.25})
    .getViewportProps();
  const crossingAnchorPosition = makeGlobeViewViewport(crossingZoom).project(crossingAnchor);

  expect(crossingZoom.zoom, 'zoom crosses into WebMercator fallback').toBeGreaterThan(12);
  expect(crossingAnchorPosition[0], 'fallback viewport keeps the cursor x anchored').toBeCloseTo(
    pos[0]
  );
  expect(crossingAnchorPosition[1], 'fallback viewport keeps the cursor y anchored').toBeCloseTo(
    pos[1]
  );

  const highStartProps = {
    width: 800,
    height: 600,
    longitude: 0,
    latitude: 0,
    zoom: 12.5,
    zoomAround: 'pointer',
    makeViewport: makeGlobeViewViewport
  };
  const highAnchor = makeGlobeViewViewport(highStartProps).unproject(pos);
  const highPointerZoom = new GlobeViewState(highStartProps)
    .zoom({pos, scale: 1.25})
    .getViewportProps();
  const highAnchorPosition = makeGlobeViewViewport(highPointerZoom).project(highAnchor);

  const highCenterZoom = new GlobeViewState({
    width: 800,
    height: 600,
    longitude: 0,
    latitude: 0,
    zoom: 12.5,
    zoomAround: 'center',
    makeViewport: makeGlobeViewViewport
  })
    .zoom({pos, scale: 1.25})
    .getViewportProps();

  expect(highAnchorPosition[0], 'high zoom pointer x stays anchored').toBeCloseTo(pos[0]);
  expect(highAnchorPosition[1], 'high zoom pointer y stays anchored').toBeCloseTo(pos[1]);
  expect(highCenterZoom.longitude, 'high zoom center zoom keeps longitude fixed').toBe(0);
});

test('GlobeViewState preserves pointer anchored zoom with globe constraints', () => {
  const GlobeViewState = new GlobeController({} as any).ControllerState;
  const pos: [number, number] = [600, 300];

  const pointerZoom = new GlobeViewState({
    width: 800,
    height: 600,
    longitude: 0,
    latitude: 0,
    zoom: 2,
    bearing: 0,
    pitch: 0,
    zoomAround: 'pointer',
    minGlobeZoom: 1.25,
    maxLatitude: [
      {zoom: -1, maxLatitude: 25},
      {zoom: 0, maxLatitude: 35},
      {zoom: 1.5, maxLatitude: 50},
      {zoom: 3, maxLatitude: 70}
    ],
    makeViewport: makeGlobeViewViewport
  })
    .zoom({pos, scale: 2})
    .getViewportProps();

  const centerZoom = new GlobeViewState({
    width: 800,
    height: 600,
    longitude: 0,
    latitude: 0,
    zoom: 2,
    bearing: 0,
    pitch: 0,
    zoomAround: 'center',
    minGlobeZoom: 1.25,
    maxLatitude: [
      {zoom: -1, maxLatitude: 25},
      {zoom: 0, maxLatitude: 35},
      {zoom: 1.5, maxLatitude: 50},
      {zoom: 3, maxLatitude: 70}
    ],
    makeViewport: makeGlobeViewViewport
  })
    .zoom({pos, scale: 2})
    .getViewportProps();

  expect(pointerZoom.zoom, 'pointer zoom still changes zoom').toBe(3);
  expect(pointerZoom.longitude, 'off-center pointer zoom re-anchors longitude').toBeGreaterThan(1);
  expect(centerZoom.longitude, 'center zoom keeps longitude fixed').toBe(0);
});

test('OrbitViewState', () => {
  const OrbitViewState = new OrbitController({} as any).ControllerState;
  const makeViewport = (props: any) => new OrbitViewport(props);

  let viewState = new OrbitViewState({
    width: 800,
    height: 600,
    rotationX: 60,
    rotationOrbit: 200,
    zoom: 0,
    minRotationX: -45,
    maxRotationX: 45,
    makeViewport
  });
  let viewportProps = viewState.getViewportProps();

  expect(viewportProps.target, 'added default target').toEqual([0, 0, 0]);
  expect(viewportProps.rotationX, 'props are normalized').toBe(45);
  expect(viewportProps.rotationOrbit, 'props are normalized').toBe(-160);

  const viewState2 = new OrbitViewState({
    width: 800,
    height: 600,
    rotationX: 0,
    rotationOrbit: 120,
    zoom: 0,
    makeViewport
  });

  const transitionViewportProps = viewState2.shortestPathFrom(viewState);
  expect(transitionViewportProps.rotationOrbit, 'found shortest path for rotationOrbit').toBe(-240);

  viewState = new OrbitViewState({
    width: 800,
    height: 600,
    rotationX: 0,
    rotationOrbit: 0,
    zoom: 0,
    target: [-3, 2, 0],
    maxBounds: [
      [-1, -1, -1],
      [1, 1, 1]
    ],
    makeViewport
  });
  viewportProps = viewState.getViewportProps();

  expect(viewportProps.target, 'target is clipped inside maxBounds').toEqual([-1, 1, 0]);
  expect(viewportProps.zoom > 6, 'zoom is adjusted to maxBounds').toBeTruthy();

  viewState = new OrbitViewState({
    width: 800,
    height: 600,
    rotationX: 60,
    rotationOrbit: 0,
    zoom: 0,
    target: [-3, 2, 0],
    maxBounds: [
      [-1, -1, -1],
      [1, 1, 1]
    ],
    makeViewport
  });
  viewportProps = viewState.getViewportProps();

  expect(viewportProps.target[2] < 0, 'target is clipped inside maxBounds').toBeTruthy();
});

test('OrthographicViewState', () => {
  const OrthographicViewState = new OrthographicController({} as any).ControllerState;

  let viewState = new OrthographicViewState({
    width: 800,
    height: 600,
    target: [0, 0, 0],
    zoom: [1, 3],
    zoomAxis: 'Y',
    maxZoomY: 2,
    makeViewport: dummyMakeViewport
  });
  let viewportProps = viewState.getViewportProps();
  expect(viewportProps.zoomX, 'normalized zoom').toBe(1);
  expect(viewportProps.zoomY, 'normalized zoom').toBe(2);

  viewState = new OrthographicViewState({
    width: 800,
    height: 600,
    target: [0, 0, 0],
    zoom: [3, 4],
    maxZoomX: 2,
    makeViewport: dummyMakeViewport
  });
  viewportProps = viewState.getViewportProps();
  expect(viewportProps.zoomX, 'normalized zoom').toBe(2);
  expect(viewportProps.zoomY, 'normalized zoom').toBe(3);

  viewState = new OrthographicViewState({
    width: 800,
    height: 600,
    target: [0, 0, 0],
    zoom: 0,
    zoomAxis: 'X',
    minZoomX: 0,
    maxZoomX: 20,
    minZoomY: 0,
    maxZoomY: 0,
    maxBounds: [
      [100, 0],
      [200, 150]
    ],
    makeViewport: dummyMakeViewport
  });
  viewportProps = viewState.getViewportProps();
  expect(viewportProps.target, 'adjusted target to maxBounds').toEqual([150, 300, 0]);
  expect(viewportProps.zoomX, 'adjusted zoom to maxBounds').toBe(3);
  expect(viewportProps.zoomY, 'adjusted zoom to maxBounds').toBe(0);
});

test('FirstPersonViewState', () => {
  const FirstPersonViewState = new FirstPersonController({} as any).ControllerState;

  let viewState = new FirstPersonViewState({
    width: 800,
    height: 600,
    longitude: -182,
    latitude: 36,
    bearing: 200,
    pitch: 60,
    maxPitch: 45,
    minPitch: -45,
    makeViewport: dummyMakeViewport
  });
  let viewportProps = viewState.getViewportProps();

  expect(viewportProps.position, 'added default position').toEqual([0, 0, 0]);
  expect(viewportProps.pitch, 'props are normalized').toBe(45);
  expect(viewportProps.bearing, 'props are normalized').toBe(-160);

  const viewState2 = new FirstPersonViewState({
    width: 800,
    height: 600,
    longitude: -160,
    latitude: 36,
    bearing: 120,
    pitch: 0,
    makeViewport: dummyMakeViewport
  });

  const transitionViewportProps = viewState2.shortestPathFrom(viewState);
  expect(transitionViewportProps.longitude, 'found shortest path for longitude').toBe(200);
  expect(transitionViewportProps.bearing, 'found shortest path for rotationOrbit').toBe(-240);

  viewState = new FirstPersonViewState({
    width: 800,
    height: 600,
    longitude: -122.4,
    latitude: 37.8,
    position: [-200, 100, 0],
    maxBounds: [
      [-100, -100],
      [100, 100]
    ],
    makeViewport: dummyMakeViewport
  });
  viewportProps = viewState.getViewportProps();

  expect(viewportProps.position, 'updated position to constraints').toEqual([-100, 100, 0]);
});
