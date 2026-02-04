// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import test from 'tape-promise/tape';
import {ColumnShapeExtension} from '@deck.gl/extensions';
import {ColumnLayer} from '@deck.gl/layers';
import {testLayer} from '@deck.gl/test-utils';

const TEST_DATA = [
  {position: [0, 0], height: 100},
  {position: [1, 1], height: 200},
  {position: [2, 2], height: 150}
];

test('ColumnShapeExtension#ColumnLayer', t => {
  const testCases = [
    {
      props: {
        id: 'column-shape-extension-test',
        data: TEST_DATA,
        getPosition: d => d.position,
        getElevation: d => d.height,
        getBevel: 'flat',
        getRadius: 1,
        extensions: [new ColumnShapeExtension()]
      },
      onAfterUpdate: ({layer}) => {
        const attributes = layer.getAttributeManager().getAttributes();
        t.ok(attributes.instanceRadii, 'instanceRadii attribute exists');
        t.ok(attributes.instanceBevelSegs, 'instanceBevelSegs attribute exists');
        t.ok(attributes.instanceBevelHeights, 'instanceBevelHeights attribute exists');
        t.ok(attributes.instanceBevelBulge, 'instanceBevelBulge attribute exists');

        // Verify flat bevel values (segs=0, height=0, bulge=0)
        t.deepEqual(
          Array.from(attributes.instanceBevelSegs.value.slice(0, 3)),
          [0, 0, 0],
          'flat bevel has segs=0'
        );
      }
    },
    {
      updateProps: {
        getBevel: 'dome',
        updateTriggers: {
          getBevel: 1
        }
      },
      onAfterUpdate: ({layer}) => {
        const attributes = layer.getAttributeManager().getAttributes();

        // Verify dome bevel values (segs=8)
        t.deepEqual(
          Array.from(attributes.instanceBevelSegs.value.slice(0, 3)),
          [8, 8, 8],
          'dome bevel has segs=8'
        );
        t.deepEqual(
          Array.from(attributes.instanceBevelHeights.value.slice(0, 3)),
          [1, 1, 1],
          'dome bevel has height=1'
        );
      }
    },
    {
      updateProps: {
        getBevel: 'cone',
        updateTriggers: {
          getBevel: 2
        }
      },
      onAfterUpdate: ({layer}) => {
        const attributes = layer.getAttributeManager().getAttributes();

        // Verify cone bevel values (segs=2)
        t.deepEqual(
          Array.from(attributes.instanceBevelSegs.value.slice(0, 3)),
          [2, 2, 2],
          'cone bevel has segs=2'
        );
      }
    },
    {
      updateProps: {
        getBevel: d => (d.height > 150 ? 'dome' : 'flat'),
        updateTriggers: {
          getBevel: 3
        }
      },
      onAfterUpdate: ({layer}) => {
        const attributes = layer.getAttributeManager().getAttributes();

        // Verify per-instance bevel values
        // data[0].height=100 -> flat (segs=0)
        // data[1].height=200 -> dome (segs=8)
        // data[2].height=150 -> flat (segs=0)
        t.deepEqual(
          Array.from(attributes.instanceBevelSegs.value.slice(0, 3)),
          [0, 8, 0],
          'per-instance bevel works correctly'
        );
      }
    },
    {
      updateProps: {
        getRadius: d => d.height / 100,
        updateTriggers: {
          getRadius: 1
        }
      },
      onAfterUpdate: ({layer}) => {
        const attributes = layer.getAttributeManager().getAttributes();

        // Verify per-instance radius values
        // data[0].height=100 -> radius=1
        // data[1].height=200 -> radius=2
        // data[2].height=150 -> radius=1.5
        t.deepEqual(
          Array.from(attributes.instanceRadii.value.slice(0, 3)),
          [1, 2, 1.5],
          'per-instance radius works correctly'
        );
      }
    },
    {
      updateProps: {
        getBevel: {segs: 5, height: 50, bulge: 0.3},
        updateTriggers: {
          getBevel: 4
        }
      },
      onAfterUpdate: ({layer}) => {
        const attributes = layer.getAttributeManager().getAttributes();

        // Verify custom object bevel values
        t.deepEqual(
          Array.from(attributes.instanceBevelSegs.value.slice(0, 3)),
          [5, 5, 5],
          'custom bevel has segs=5'
        );
        t.deepEqual(
          Array.from(attributes.instanceBevelHeights.value.slice(0, 3)),
          [50, 50, 50],
          'custom bevel has height=50'
        );
        t.ok(
          Math.abs(attributes.instanceBevelBulge.value[0] - 0.3) < 0.001,
          'custom bevel has bulge=0.3'
        );
      }
    }
  ];

  testLayer({Layer: ColumnLayer, testCases, onError: t.notOk});

  t.end();
});
