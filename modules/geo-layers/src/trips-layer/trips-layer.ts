// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import type {NumericArray} from '@math.gl/core';
import {AccessorFunction, DefaultProps} from '@deck.gl/core';
import {PathLayer, PathLayerProps} from '@deck.gl/layers';

import {tripsUniforms, TripsProps} from './trips-layer-uniforms';

const defaultProps: DefaultProps<TripsLayerProps> = {
  fadeTrail: true,
  trailLength: {type: 'number', value: 120, min: 0},
  currentTime: {type: 'number', value: 0, min: 0},
  getTimestamps: {type: 'accessor', value: (d: any) => d.timestamps}
};

/** All properties supported by TripsLayer. */
export type TripsLayerProps<DataT = unknown> = _TripsLayerProps<DataT> & PathLayerProps<DataT>;

/** Properties added by TripsLayer. */
type _TripsLayerProps<DataT = unknown> = {
  /**
   * Whether or not the path fades out.
   * @default true
   */
  fadeTrail?: boolean;
  /**
   * Trail length.
   * @default 120
   */
  trailLength?: number;
  /**
   * The current time of the frame.
   * @default 0
   */
  currentTime?: number;
  /**
   * Timestamp accessor.
   */
  getTimestamps?: AccessorFunction<DataT, NumericArray>;
};

/** Render animated paths that represent vehicle trips. */
export default class TripsLayer<DataT = any, ExtraProps extends {} = {}> extends PathLayer<
  DataT,
  Required<_TripsLayerProps<DataT>> & ExtraProps
> {
  static layerName = 'TripsLayer';
  static defaultProps = defaultProps;

  getShaders() {
    const shaders = super.getShaders();
    shaders.inject = {
      'vs:#decl': `\
in float instanceTimestamps;
in float instanceNextTimestamps;
out float vTime;
out float vTimeStart;
out float vTimeEnd;
`,
      // Timestamp of the vertex
      'vs:#main-end': `\
vTime = instanceTimestamps + (instanceNextTimestamps - instanceTimestamps) * vPathPosition.y / vPathLength;
vTimeStart = instanceTimestamps;
vTimeEnd = instanceNextTimestamps;
`,
      'fs:#decl': `\
in float vTime;
in float vTimeStart;
in float vTimeEnd;
`,
      // Drop the segments outside of the time window
      'fs:#main-start': `\
bool isAfterHead = vTime > trips.currentTime;
bool isBeforeTrail = trips.fadeTrail && (vTime < trips.currentTime - trips.trailLength);
if (isBeforeTrail) {
  discard;
}
if (isAfterHead) {
  float segmentDuration = vTimeEnd - vTimeStart;
  bool currentTimeCutsSegment = abs(segmentDuration) > 0.000001 &&
    trips.currentTime >= min(vTimeStart, vTimeEnd) &&
    trips.currentTime <= max(vTimeStart, vTimeEnd);
  if (!currentTimeCutsSegment || path.capType < 0.5) {
    discard;
  }

  float headPosition = (trips.currentTime - vTimeStart) / segmentDuration * vPathLength;
  if (length(vec2(vPathPosition.x, vPathPosition.y - headPosition)) > 1.0) {
    discard;
  }
}
`,
      // Fade the color (currentTime - 100%, end of trail - 0%)
      'fs:DECKGL_FILTER_COLOR': `\
if(trips.fadeTrail) {
  color.a *= 1.0 - (trips.currentTime - vTime) / trips.trailLength;
}
`
    };
    shaders.modules = [...shaders.modules, tripsUniforms];
    return shaders;
  }

  initializeState() {
    super.initializeState();

    const attributeManager = this.getAttributeManager();
    attributeManager!.addInstanced({
      timestamps: {
        size: 1,
        accessor: 'getTimestamps',
        shaderAttributes: {
          instanceTimestamps: {
            vertexOffset: 0
          },
          instanceNextTimestamps: {
            vertexOffset: 1
          }
        }
      }
    });
  }

  draw(params) {
    const {fadeTrail, trailLength, currentTime} = this.props;
    const tripsProps: TripsProps = {fadeTrail, trailLength, currentTime};

    const model = this.state.model!;
    model.shaderInputs.setProps({trips: tripsProps});
    super.draw(params);
  }
}
