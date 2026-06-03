// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import {test, expect} from 'vitest';
import {
  MapView,
  OrbitView,
  OrthographicView,
  FirstPersonView,
  _GlobeView as GlobeView
} from '@deck.gl/core';
import {Timeline} from '@luma.gl/engine';

import testController, {createTestController} from './test-controller';

test('MapController', async () => {
  await testController(MapView, {
    longitude: -122.45,
    latitude: 37.78,
    zoom: 10,
    pitch: 30,
    bearing: -45
  });
});

test('MapController#inertia', async () => {
  await testController(MapView, {
    longitude: -122.45,
    latitude: 37.78,
    zoom: 10,
    pitch: 30,
    bearing: -45,
    inertia: true
  });
});

test('MapController clamps a noisy final pinch frame instead of jumping', () => {
  // Simulate a normal pinch ending with one sensor-noise spike. Without the
  // per-event log-scale clamp the spike would propagate straight into the zoom.
  const makePinchEvent = (type: string, scale: number, deltaTime: number) => ({
    type,
    offsetCenter: {x: 50, y: 50},
    scale,
    rotation: 0,
    deltaTime,
    srcEvent: {preventDefault() {}},
    stopPropagation() {}
  });

  const controller = createTestController({
    view: new MapView({controller: true}),
    initialViewState: {
      longitude: -122.45,
      latitude: 37.78,
      zoom: 10,
      pitch: 30,
      bearing: -45
    }
  });

  controller.handleEvent(makePinchEvent('pinchstart', 1, 0) as any);
  controller.handleEvent(makePinchEvent('pinchmove', 1.05, 16) as any);
  controller.handleEvent(makePinchEvent('pinchmove', 1.1, 32) as any);
  const zoomBeforeSpike = controller.props.zoom as number;
  controller.handleEvent(makePinchEvent('pinchmove', 100, 48) as any);

  const delta = (controller.props.zoom as number) - zoomBeforeSpike;
  expect(
    delta,
    'noisy final pinch frame is clamped to the per-event log-scale cap'
  ).toBeLessThanOrEqual(0.18 + 1e-6);
});

test('MapController skips pinch zoom inertia on touch lift', () => {
  // Touch pinches lift with a noisy final frame that can produce a large
  // synthetic velocity. The end zoom should equal the last live pinch zoom,
  // not the inertia-projected zoom.
  const makePinchEvent = (
    type: string,
    scale: number,
    deltaTime: number,
    pointerType: 'touch' | 'mouse' = 'touch'
  ) => ({
    type,
    offsetCenter: {x: 50, y: 50},
    scale,
    rotation: 0,
    deltaTime,
    srcEvent: {preventDefault() {}, pointerType},
    stopPropagation() {}
  });

  const controller = createTestController({
    view: new MapView({controller: true}),
    initialViewState: {
      longitude: -122.45,
      latitude: 37.78,
      zoom: 10,
      pitch: 30,
      bearing: -45,
      inertia: 300
    }
  });

  controller.handleEvent(makePinchEvent('pinchstart', 1, 0) as any);
  controller.handleEvent(makePinchEvent('pinchmove', 1.1, 16) as any);
  const zoomAfterMove = controller.props.zoom as number;
  // 100x scale spike on the lift frame — pre-fix would fling the zoom way past.
  controller.handleEvent(makePinchEvent('pinchend', 100, 17) as any);

  expect(
    controller.props.zoom,
    'touch pinch end stays at the last live zoom (no inertia projection)'
  ).toBeCloseTo(zoomAfterMove);
});

test('MapController allows pinch zoom and two-finger rotate in one gesture', () => {
  const makePinchEvent = (type: string, scale: number, rotation: number) =>
    ({
      type,
      offsetCenter: {x: 50, y: 80},
      scale,
      rotation,
      deltaTime: 16,
      srcEvent: {preventDefault() {}},
      stopPropagation() {}
    }) as any;
  const makeMultiPanEvent = (type: string, y: number) =>
    ({
      type,
      offsetCenter: {x: 50, y},
      deltaX: 0,
      deltaY: y - 50,
      velocityY: 0,
      srcEvent: {preventDefault() {}},
      stopPropagation() {}
    }) as any;

  const controller = createTestController({
    view: new MapView({
      controller: {
        touchZoom: true,
        touchRotate: true
      }
    }),
    initialViewState: {
      longitude: -122.45,
      latitude: 37.78,
      zoom: 10,
      pitch: 0,
      bearing: 0
    }
  });

  controller.handleEvent(makePinchEvent('pinchstart', 1, 0));
  controller.handleEvent(makeMultiPanEvent('multipanstart', 50));
  controller.handleEvent(makeMultiPanEvent('multipanmove', 80));
  const pitchAfterMultiPan = controller.props.pitch as number;

  controller.handleEvent(makePinchEvent('pinchmove', 1.25, 15));

  expect(controller.props.zoom, 'pinch zoom still applies during touch rotate').toBeGreaterThan(10);
  expect(controller.props.bearing, 'pinch rotation still applies during zoom').not.toBeCloseTo(0);
  expect(
    controller.props.pitch,
    'pinch update preserves pitch from simultaneous multipan'
  ).toBeCloseTo(pitchAfterMultiPan);
});

test('MapController pitches live from touch pinch centroid movement', () => {
  const makePinchEvent = (type: string, y: number, scale = 1, rotation = 0) =>
    ({
      type,
      offsetCenter: {x: 50, y},
      scale,
      rotation,
      deltaTime: 16,
      srcEvent: {preventDefault() {}, pointerType: 'touch'},
      stopPropagation() {}
    }) as any;

  const controller = createTestController({
    view: new MapView({
      controller: {
        touchZoom: true,
        touchRotate: true
      }
    }),
    initialViewState: {
      longitude: -122.45,
      latitude: 37.78,
      zoom: 10,
      pitch: 0,
      bearing: 0
    }
  });

  controller.handleEvent(makePinchEvent('pinchstart', 80));
  controller.handleEvent(makePinchEvent('pinchmove', 40));

  expect(
    controller.props.pitch,
    'two-finger vertical drag pitches during the gesture'
  ).toBeGreaterThan(0);
  expect(controller.props.zoom, 'parallel touch pitch does not zoom-anchor pan').toBeCloseTo(10);
});

test('MapController does not apply touch pitch inertia on lift', () => {
  const makeMultiPanEvent = (type: string, y: number, velocityY = 0) =>
    ({
      type,
      offsetCenter: {x: 50, y},
      deltaX: 0,
      deltaY: y - 80,
      velocityY,
      srcEvent: {preventDefault() {}, pointerType: 'touch'},
      stopPropagation() {}
    }) as any;

  const controller = createTestController({
    view: new MapView({
      controller: {
        touchRotate: true,
        inertia: 300
      }
    }),
    initialViewState: {
      longitude: -122.45,
      latitude: 37.78,
      zoom: 10,
      pitch: 0,
      bearing: 0
    }
  });

  controller.handleEvent(makeMultiPanEvent('multipanstart', 80));
  controller.handleEvent(makeMultiPanEvent('multipanmove', 40));
  const pitchAfterMove = controller.props.pitch as number;

  controller.handleEvent(makeMultiPanEvent('multipanend', 40, -1));

  expect(
    controller.props.pitch,
    'lift does not project touch pitch beyond the last live frame'
  ).toBeCloseTo(pitchAfterMove);
});

test('GlobeController', async () => {
  await testController(
    GlobeView,
    {
      longitude: -122.45,
      latitude: 37.78,
      zoom: 0
    },
    // GlobeView cannot be rotated
    ['pan#function key', 'pinch', 'multipan']
  );
});

test('GlobeController supports pointer anchored zoom option', () => {
  const makeController = (controller: true | {zoomAround: 'pointer'}) =>
    createTestController({
      view: new GlobeView({controller}),
      initialViewState: {
        longitude: 0,
        latitude: 0,
        zoom: 1
      }
    });

  const makeWheelEvent = () => ({
    type: 'wheel',
    offsetCenter: {x: 75, y: 50},
    delta: -10,
    srcEvent: {preventDefault() {}},
    stopPropagation() {}
  });

  const centerZoomController = makeController(true);
  const pointerZoomController = makeController({zoomAround: 'pointer'});

  centerZoomController.handleEvent(makeWheelEvent() as any);
  pointerZoomController.handleEvent(makeWheelEvent() as any);

  expect(centerZoomController.props.longitude, 'center zoom preserves longitude').toBeCloseTo(0);
  expect(pointerZoomController.props.longitude, 'pointer zoom adjusts longitude').not.toBeCloseTo(
    0
  );
});

test('GlobeController blocks pan while touch pitch is active', () => {
  const makePanEvent = (type: string, x: number, y: number) =>
    ({
      type,
      offsetCenter: {x, y},
      deltaX: x - 50,
      deltaY: y - 80,
      velocityX: 0,
      velocityY: 0,
      velocity: 0,
      deltaTime: 16,
      rightButton: false,
      srcEvent: {preventDefault() {}, pointerType: 'touch'},
      stopPropagation() {}
    }) as any;
  const makePinchEvent = (type: string, y: number) =>
    ({
      type,
      offsetCenter: {x: 50, y},
      scale: 1,
      rotation: 0,
      deltaTime: 16,
      srcEvent: {preventDefault() {}, pointerType: 'touch'},
      stopPropagation() {}
    }) as any;

  const controller = createTestController({
    view: new GlobeView({
      controller: {
        touchZoom: true,
        touchRotate: true
      }
    }),
    initialViewState: {
      longitude: 0,
      latitude: 0,
      zoom: 5,
      pitch: 0,
      bearing: 0
    }
  });

  controller.handleEvent(makePanEvent('panstart', 50, 80));
  controller.handleEvent(makePinchEvent('pinchstart', 80));
  controller.handleEvent(makePinchEvent('pinchmove', 40));

  const afterPitch = {
    longitude: controller.props.longitude as number,
    latitude: controller.props.latitude as number,
    pitch: controller.props.pitch as number
  };
  expect(afterPitch.pitch, 'touch pinch centroid movement pitches the globe').toBeGreaterThan(0);

  controller.handleEvent(makePanEvent('panmove', 85, 40));
  controller.handleEvent(makePanEvent('panend', 85, 40));

  expect(controller.props.longitude, 'pan does not move longitude during pitch').toBeCloseTo(
    afterPitch.longitude
  );
  expect(controller.props.latitude, 'pan does not move latitude during pitch').toBeCloseTo(
    afterPitch.latitude
  );
  expect(controller.props.pitch, 'pitch stays owned by the touch pitch gesture').toBeCloseTo(
    afterPitch.pitch
  );
});

test('GlobeController eases low-zoom orientation back after releasing at friction limit', () => {
  const view = new GlobeView({
    controller: {
      touchRotate: true,
      lowZoomOrientationReset: {
        zoomThreshold: 3.25,
        zoomRange: 1.75,
        maxBearing: 30,
        maxPitch: 22,
        hardMaxBearing: 75,
        hardMaxPitch: 50,
        friction: 0.18,
        resetDuration: 220
      }
    }
  });
  const timeline = new Timeline();
  let controllerProps = {
    ...view.controller,
    id: 'test-view',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    longitude: 0,
    latitude: 0,
    zoom: 1.5,
    bearing: 0,
    pitch: 0,
    touchRotate: true,
    inertia: 0
  };
  const ControllerClass = controllerProps.type;
  const controller = new ControllerClass({
    timeline,
    onViewStateChange: ({viewState}) => {
      controllerProps = {...controllerProps, ...viewState};
      controller.setProps(controllerProps);
    },
    onStateChange() {},
    makeViewport: viewState =>
      view.makeViewport({
        width: controllerProps.width,
        height: controllerProps.height,
        viewState
      })
  });
  controller.setProps(controllerProps);
  const makeEvent = (type: string, x = 50) =>
    ({
      type,
      offsetCenter: {x, y: 50},
      deltaX: x - 50,
      deltaY: 0,
      velocityY: 0,
      srcEvent: {preventDefault() {}, metaKey: true},
      stopPropagation() {}
    }) as any;

  controller.handleEvent(makeEvent('panstart'));
  controller.handleEvent(makeEvent('panmove', 85));
  const bearingAfterMove = controllerProps.bearing as number;
  expect(Math.abs(bearingAfterMove), 'drag reaches the low-zoom friction band').toBeGreaterThan(30);

  controller.handleEvent(makeEvent('panend', 85));
  expect(
    Math.abs(controllerProps.bearing as number),
    'release starts from the friction-limited bearing instead of snapping'
  ).toBeGreaterThan(30);

  timeline.setTime(110);
  controller.updateTransition();
  expect(
    Math.abs(controllerProps.bearing as number),
    'reset transition eases away from the friction limit'
  ).toBeLessThan(Math.abs(bearingAfterMove));
  expect(
    Math.abs(controllerProps.bearing as number),
    'reset transition does not immediately snap to zero'
  ).toBeGreaterThan(0);

  timeline.setTime(220);
  controller.updateTransition();
  expect(controllerProps.bearing, 'reset finishes at zero bearing').toBeCloseTo(0);
  expect(controllerProps.pitch, 'reset finishes at zero pitch').toBeCloseTo(0);
});

test('OrbitController', async () => {
  await testController(OrbitView, {
    orbitAxis: 'Y',
    rotationX: 30,
    rotationOrbit: -45,
    target: [1, 1, 0],
    zoom: 1
  });
});

test('OrthographicController', async () => {
  await testController(
    OrthographicView,
    {
      target: [1, 1, 0],
      zoom: 1
    },
    // OrthographicView cannot be rotated
    [
      'pan#function key',
      'pan#function key#disabled',
      'multipan',
      'multipan#disabled',
      'keyboard#function key'
    ]
  );
});

test('OrthographicController#2d zoom', async () => {
  await testController(
    OrthographicView,
    {
      target: [1, 1, 0],
      zoom: [1, 2]
    },
    // OrthographicView cannot be rotated
    [
      'pan#function key',
      'pan#function key#disabled',
      'multipan',
      'multipan#disabled',
      'keyboard#function key'
    ]
  );
});

test('OrthographicController keyboard navigation with padding', async () => {
  const controller = createTestController({
    view: new OrthographicView({
      controller: {
        keyboard: {moveSpeed: 10}
      },
      padding: {left: 50, top: 20}
    }),
    initialViewState: {
      target: [0, 0, 0],
      zoom: 0
    },
    onViewStateChange: ({viewState}) => {
      viewState.transitionDuration = 0;
      return viewState;
    }
  });
  controller.setProps({...controller.props, target: [0, 0, 0], zoom: 0});

  const keyboardEvent = {
    type: 'keydown',
    srcEvent: {preventDefault() {}, code: 'ArrowLeft'},
    stopPropagation: () => {}
  };

  controller.handleEvent(keyboardEvent);
  expect(controller.props.target, 'Moved 10px left').toEqual([10, 0]);

  keyboardEvent.srcEvent.code = 'ArrowUp';
  controller.handleEvent(keyboardEvent);
  expect(controller.props.target, 'Moved 10px up').toEqual([10, 10]);
});

test('OrthographicController scroll zoom responds without transition lag', () => {
  const controller = createTestController({
    view: new OrthographicView({controller: true, padding: {left: 50, top: 20}}),
    initialViewState: {
      target: [0, 0, 0],
      zoom: 0,
      scrollZoom: true
    }
  });

  const wheelEvent = {
    type: 'wheel',
    offsetCenter: {x: 50, y: 50},
    delta: -1,
    srcEvent: {preventDefault() {}},
    stopPropagation: () => {}
  };

  controller.handleEvent(wheelEvent as any);

  const speed = 0.01;
  const {delta} = wheelEvent;
  let scale = 2 / (1 + Math.exp(-Math.abs(delta * speed)));
  if (delta < 0 && scale !== 0) {
    scale = 1 / scale;
  }
  const expectedZoom = Math.log2(scale);

  expect(
    Math.abs((controller.props.zoom as number) - expectedZoom) < 1e-6,
    'zoom level updates immediately when scroll zoom is not smooth'
  ).toBeTruthy();
});

test('OrthographicController scroll zoom resets isZooming state', () => {
  const interactionStates: any[] = [];
  const controller = createTestController({
    view: new OrthographicView({controller: true, padding: {left: 50, top: 20}}),
    initialViewState: {
      target: [0, 0, 0],
      zoom: 0,
      scrollZoom: true
    },
    onStateChange: state => {
      interactionStates.push({...state});
    }
  });

  const wheelEvent = {
    type: 'wheel',
    offsetCenter: {x: 50, y: 50},
    delta: -1,
    srcEvent: {preventDefault() {}},
    stopPropagation: () => {}
  };

  controller.handleEvent(wheelEvent as any);

  // Verify we get exactly 2 state changes for non-smooth scroll zoom
  expect(interactionStates.length, 'scroll zoom triggers exactly 2 state changes').toBe(2);

  // Verify first state has isZooming: true
  expect(interactionStates[0].isZooming, 'isZooming is set to true at start').toBe(true);
  expect(interactionStates[0].isPanning, 'isPanning is set to true at start').toBe(true);

  // Verify last state has isZooming: false
  expect(interactionStates[1].isZooming, 'isZooming is reset to false at end').toBe(false);
  expect(interactionStates[1].isPanning, 'isPanning is reset to false at end').toBe(false);
});

test('FirstPersonController', async () => {
  await testController(
    FirstPersonView,
    {
      longitude: -122.45,
      latitude: 37.78,
      pitch: 15,
      bearing: 0,
      position: [0, 0, 2]
    },
    // FirstPersonController does not pan
    ['pan#function key', 'pan#function key#disabled']
  );
});
