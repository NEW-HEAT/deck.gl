// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import {test, expect} from 'vitest';
import {testLayer, generateLayerTests} from '@deck.gl/test-utils/vitest';
import {TripsLayer} from '@deck.gl/geo-layers';
import {trips} from 'deck.gl-test/data';

test('TripsLayer', () => {
  const testCases = generateLayerTests({
    Layer: TripsLayer,
    sampleProps: {
      data: trips,
      getPath: d => d.map(p => p.begin_shape),
      getTimestamps: d => d.map(p => p.begin_time)
    },
    assert: (cond, msg) => expect(cond, msg).toBeTruthy(),
    onBeforeUpdate: ({testCase}) => console.log(testCase.title)
  });

  testLayer({Layer: TripsLayer, testCases, onError: err => expect(err).toBeFalsy()});
});

test('TripsLayer shader rounds the animated current-time head', () => {
  const layer = new TripsLayer({
    id: 'trips',
    data: trips,
    getPath: d => d.map(p => p.begin_shape),
    getTimestamps: d => d.map(p => p.begin_time),
    capRounded: true
  });
  (layer as any).context = {defaultShaderModules: []};
  const shaders = layer.getShaders();
  const vertexDecl = shaders.inject?.['vs:#decl'];
  const fragmentStart = shaders.inject?.['fs:#main-start'];

  expect(vertexDecl).toContain('out float vTimeStart;');
  expect(vertexDecl).toContain('out float vTimeEnd;');
  expect(fragmentStart).toContain('currentTimeCutsSegment');
  expect(fragmentStart).toContain('path.capType');
  expect(fragmentStart).toContain('headPosition');
  expect(fragmentStart).toContain('length(vec2(vPathPosition.x');
});
