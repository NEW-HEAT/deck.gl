// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import {test, expect} from 'vitest';
import {
  View,
  Viewport,
  MapView,
  OrbitView,
  OrthographicView,
  FirstPersonView,
  WebMercatorViewport,
  _GlobeView as GlobeView,
  _GlobeViewport as GlobeViewport
} from 'deck.gl';
import {equals} from '@math.gl/core';

test('View#imports', () => {
  expect(View, 'View import ok').toBeTruthy();
});

test('View#clone', () => {
  const view = new MapView({
    id: 'test-view',
    latitude: 0,
    longitude: 0,
    zoom: 1
  });
  const identicalClone = view.clone({});
  expect(
    identicalClone instanceof MapView,
    'identical clone is an instance of MapView'
  ).toBeTruthy();
  expect(identicalClone !== view, 'identical clone is a new instance').toBeTruthy();
  expect(identicalClone.equals(view), 'identical clone.equals() is true').toBeTruthy();

  const clone = view.clone({
    id: 'cloned-view',
    zoom: 5
  });
  expect(clone.id, 'modified clone id is overridden').toBe('cloned-view');
  expect(clone.props.zoom, 'modified clone prop zoom is overridden').toBe(5);
  expect(clone.props.latitude, 'other props are preserved').toBe(view.props.latitude);
  expect(clone.props.longitude, 'other props are preserved').toBe(view.props.longitude);
});

test('View#equals', () => {
  const mapView1 = new MapView({
    id: 'default-view',
    latitude: 0,
    longitude: 0,
    zoom: 11,
    position: [0, 0]
  });
  const mapView2 = new MapView({
    id: 'default-view',
    latitude: 0,
    longitude: 0,
    zoom: 11,
    position: [0, 0]
  });
  const mapView3 = new MapView({
    id: 'default-view',
    latitude: 0,
    longitude: 0,
    zoom: 11,
    position: [0, 1]
  });
  const mapView4 = new MapView({
    id: 'default-view',
    latitude: 0,
    longitude: 0,
    zoom: 11,
    position: [0, 0],
    parameters: {depthCompare: 'always'}
  });
  const baseView = new View({
    id: 'default-view',
    latitude: 0,
    longitude: 0,
    zoom: 11,
    position: [0, 0]
  });

  expect(mapView1.equals(mapView2), 'Identical view props').toBeTruthy();
  expect(mapView1.equals(mapView3), 'Different view props').toBeFalsy();
  expect(mapView1.equals(mapView4), 'Different parameters').toBeFalsy();
  expect(mapView1.equals(baseView), 'Different type').toBeFalsy();
});

test('MapView', () => {
  const view = new MapView();
  const viewport = view.makeViewport({
    width: 100,
    height: 100,
    viewState: {
      longitude: -122.4,
      latitude: 37.8,
      zoom: 12,
      width: 200,
      height: 200
    }
  });
  expect(viewport instanceof Viewport, 'Mapview.makeViewport returns valid viewport').toBeTruthy();
  expect(viewport.id, 'Viewport has correct id').toBe(view.id);
  expect(
    viewport.width === 100 && viewport.height === 100,
    'Viewport has correct size'
  ).toBeTruthy();
  expect(viewport.zoom, 'Viewport has correct parameters').toBe(12);
});

test('FirstPersonView', () => {
  const view = new FirstPersonView();
  const viewport = view.makeViewport({
    width: 100,
    height: 100,
    viewState: {
      longitude: -122.4,
      latitude: 37.8,
      bearing: 90,
      width: 200,
      height: 200
    }
  });
  expect(viewport instanceof Viewport, 'Mapview.makeViewport returns valid viewport').toBeTruthy();
  expect(viewport.id, 'Viewport has correct id').toBe(view.id);
  expect(
    viewport.width === 100 && viewport.height === 100,
    'Viewport has correct size'
  ).toBeTruthy();
  expect(viewport.zoom, 'Viewport zoom is populated').toBeTruthy();
});

test('GlobeView', () => {
  const view = new GlobeView();
  const viewport = view.makeViewport({
    width: 100,
    height: 100,
    viewState: {
      longitude: -122.4,
      latitude: 37.8,
      zoom: 12,
      width: 200,
      height: 200
    }
  });
  expect(viewport instanceof Viewport, 'Mapview.makeViewport returns valid viewport').toBeTruthy();
  expect(viewport.id, 'Viewport has correct id').toBe(view.id);
  expect(
    viewport.width === 100 && viewport.height === 100,
    'Viewport has correct size'
  ).toBeTruthy();
  expect(viewport.zoom, 'Viewport has correct parameters').toBe(12);
});

test('GlobeView#parameters', () => {
  const defaultView = new GlobeView();
  const customView = new GlobeView({parameters: {cullMode: 'none'}});

  expect(defaultView.props.parameters, 'GlobeView has default culling').toMatchObject({
    cullMode: 'back'
  });
  expect(customView.props.parameters, 'GlobeView culling can be overridden').toMatchObject({
    cullMode: 'none'
  });
});

test('GlobeView switches to WebMercatorViewport at close zooms', () => {
  const view = new GlobeView();
  const baseViewState = {
    longitude: -122.4,
    latitude: 37.8,
    bearing: 0,
    pitch: 0
  };
  const lowZoomViewport = view.makeViewport({
    width: 100,
    height: 100,
    viewState: {...baseViewState, zoom: 12}
  });
  const closeZoomViewport = view.makeViewport({
    width: 100,
    height: 100,
    viewState: {...baseViewState, zoom: 12.01}
  });

  expect(lowZoomViewport, 'zoom 12 still uses globe rendering').toBeInstanceOf(GlobeViewport);
  expect(closeZoomViewport, 'close zoom uses cheaper Mercator rendering').toBeInstanceOf(
    WebMercatorViewport
  );
});

test('GlobeView#camera constraints', () => {
  const view = new GlobeView({
    controller: true,
    maxLatitude: [
      {zoom: 0, maxLatitude: 50},
      {zoom: 4, maxLatitude: 80}
    ],
    maxLatitudeZoomClamp: true,
    minGlobeZoom: 1.25,
    lowZoomOrientationReset: {
      zoomThreshold: 1,
      zoomRange: 2,
      maxBearing: 10,
      maxPitch: 10,
      friction: 0.18
    }
  });

  const viewport = view.makeViewport({
    width: 100,
    height: 100,
    viewState: {
      longitude: 0,
      latitude: 70,
      zoom: 0,
      bearing: 90,
      pitch: 40
    }
  });

  expect(view.controller, 'constraints are passed to the GlobeController').toMatchObject({
    maxLatitude: [
      {zoom: 0, maxLatitude: 50},
      {zoom: 4, maxLatitude: 80}
    ],
    maxLatitudeZoomClamp: true,
    minGlobeZoom: 1.25,
    lowZoomOrientationReset: {zoomThreshold: 1, zoomRange: 2}
  });
  expect(viewport.latitude, 'viewport latitude is preserved by dynamic min zoom').toBe(70);
  expect(viewport.zoom, 'viewport zoom is raised to permit the latitude').toBeCloseTo(2.6666667);

  const lowZoomViewport = view.makeViewport({
    width: 100,
    height: 100,
    viewState: {
      longitude: 0,
      latitude: 40,
      zoom: 0,
      bearing: 90,
      pitch: 40
    }
  });
  expect(lowZoomViewport.bearing, 'low zoom viewport bearing is resisted').toBeCloseTo(30.3898);
  expect(lowZoomViewport.pitch, 'low zoom viewport pitch is resisted').toBeCloseTo(18.2188);
});

test('OrbitView', () => {
  const view = new OrbitView({id: '3d-view'});
  const viewport = view.makeViewport({
    width: 100,
    height: 100,
    viewState: {
      target: [0, 1, 0],
      zoom: 1,
      rotationOrbit: 45,
      rotationX: -30,
      width: 200,
      height: 200
    }
  });
  expect(
    viewport instanceof Viewport,
    'OrbitView.makeViewport returns valid viewport'
  ).toBeTruthy();
  expect(viewport.id, 'Viewport has correct id').toBe(view.id);
  expect(
    viewport.width === 100 && viewport.height === 100,
    'Viewport has correct size'
  ).toBeTruthy();
  expect(viewport.zoom, 'Viewport has correct parameters').toBe(1);
});

// eslint-disable-next-line complexity
test('OrbitView#project', () => {
  let view = new OrbitView({id: '3d-view', orbitAxis: 'Z'});
  let viewport;
  let p;
  let center;

  viewport = view.makeViewport({
    width: 100,
    height: 100,
    viewState: {
      target: [1, 2, 3],
      zoom: 1,
      rotationOrbit: 0,
      rotationX: 0
    }
  });
  center = viewport.project([1, 2, 3]);
  expect(
    equals(center[0], 50) && equals(center[1], 50),
    'target is at viewport center'
  ).toBeTruthy();

  viewport = view.makeViewport({
    width: 100,
    height: 100,
    viewState: {
      target: [0, 0, 0],
      zoom: 1,
      rotationOrbit: 0,
      rotationX: 0
    }
  });
  center = viewport.project([0, 0, 0]);
  p = viewport.project([0, 0, 1]);
  expect(equals(p[0], 50) && p[1] < 50 && equals(p[2], center[2]), 'z axis points up').toBeTruthy();
  p = viewport.project([0, 1, 0]);
  expect(
    equals(p[0], 50) && equals(p[1], 50) && p[2] > center[2],
    'y axis points away'
  ).toBeTruthy();
  p = viewport.project([1, 0, 0]);
  expect(p[0] > 50 && p[1] === 50 && p[2] === center[2], 'x axis points right').toBeTruthy();

  view = new OrbitView({id: '3d-view', orbitAxis: 'Y'});
  viewport = view.makeViewport({
    width: 100,
    height: 100,
    viewState: {
      target: [0, 0, 0],
      zoom: 1,
      rotationOrbit: 0,
      rotationX: 0
    }
  });

  center = viewport.project([0, 0, 0]);
  p = viewport.project([0, 0, 1]);
  expect(
    equals(p[0], 50) && equals(p[1], 50) && p[2] < center[2],
    'z axis points forward'
  ).toBeTruthy();
  p = viewport.project([0, 1, 0]);
  expect(equals(p[0], 50) && p[1] < 50 && equals(p[2], center[2]), 'y axis points up').toBeTruthy();
  p = viewport.project([1, 0, 0]);
  expect(
    p[0] > 50 && equals(p[1], 50) && equals(p[2], center[2]),
    'x axis points right'
  ).toBeTruthy();
});

test('OrthographicView', () => {
  const view = new OrthographicView({id: '2d-view'});
  let viewport = view.makeViewport({
    width: 100,
    height: 100,
    viewState: {
      target: [0, 1, 0],
      zoom: 9,
      width: 200,
      height: 200
    }
  });
  expect(
    viewport instanceof Viewport,
    'OrthographicView.makeViewport returns valid viewport'
  ).toBeTruthy();
  expect(viewport.id, 'Viewport has correct id').toBe(view.id);
  expect(
    viewport.width === 100 && viewport.height === 100,
    'Viewport has correct size'
  ).toBeTruthy();
  expect(viewport.zoom, 'Viewport has correct parameters').toBe(9);

  viewport = view.makeViewport({
    width: 400,
    height: 300,
    viewState: {
      target: [50, 100, 0],
      zoom: [1, 3]
    }
  });
  const center = viewport.project([50, 100, 0]);
  expect(
    equals(center[0], 200) && equals(center[1], 150),
    'target is at viewport center'
  ).toBeTruthy();
  const p = viewport.project([40, 90, 0]);
  expect(
    equals(center[0] - p[0], 20) && equals(center[1] - p[1], 80),
    'independent scales'
  ).toBeTruthy();
});

test('OrthographicView#padding', () => {
  const view = new OrthographicView({id: '2d-view', padding: {bottom: '50%', left: '100%'}});
  const viewport = view.makeViewport({
    width: 100,
    height: 100,
    viewState: {
      target: [0, 1, 0],
      zoom: 4
    }
  });
  const center = viewport.project([0, 1]);
  expect(
    equals(center, [viewport.width, viewport.height / 4]),
    'viewport center is offset'
  ).toBeTruthy();
});
