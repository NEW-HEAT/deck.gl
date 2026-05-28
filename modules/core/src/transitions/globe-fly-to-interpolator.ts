// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import {clamp, lerp, vec3} from '@math.gl/core';
import TransitionInterpolator from './transition-interpolator';
import {Globe} from '../viewports/globe-utils';
import {zoomAdjust} from '../viewports/globe-viewport';
import {flyToViewport, getFlyToDuration} from '@math.gl/web-mercator';

const DEFAULT_OPTS = {
  speed: 1.2,
  curve: 1.414,
  minDuration: 300
};

const LINEARLY_INTERPOLATED_PROPS = {
  bearing: 0,
  pitch: 0,
  position: [0, 0, 0]
};

type FlyToViewportProps = {
  width: number;
  height: number;
  longitude: number;
  latitude: number;
  zoom: number;
  bearing?: number;
  pitch?: number;
};

function getFlyToViewportProps(props: Record<string, any>): FlyToViewportProps {
  return {
    width: props.width,
    height: props.height,
    longitude: props.longitude,
    latitude: props.latitude,
    zoom: props.zoom,
    bearing: props.bearing,
    pitch: props.pitch
  };
}

function normalizeAngle(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function lerpAngle(start: number, end: number, t: number): number {
  return normalizeAngle(start + normalizeAngle(end - start) * t);
}

function slerpPosition(start: number[], end: number[], t: number): number[] {
  const dot = clamp(vec3.dot(start, end), -1, 1);
  const omega = Math.acos(dot);

  if (omega < 1e-6) {
    return vec3.normalize(
      [],
      [
        lerp(start[0], end[0], t),
        lerp(start[1], end[1], t),
        lerp(start[2], end[2], t)
      ]
    ) as number[];
  }

  const sinOmega = Math.sin(omega);
  if (Math.abs(sinOmega) < 1e-6) {
    let axis = vec3.cross([], start, [0, 0, 1]);
    if (vec3.len(axis) < 1e-6) {
      axis = vec3.cross([], start, [0, 1, 0]);
    }
    vec3.normalize(axis, axis);
    return Globe.rotate(start, axis, Math.PI * t);
  }

  const startScale = Math.sin((1 - t) * omega) / sinOmega;
  const endScale = Math.sin(t * omega) / sinOmega;
  return [
    start[0] * startScale + end[0] * endScale,
    start[1] * startScale + end[1] * endScale,
    start[2] * startScale + end[2] * endScale
  ];
}

/**
 * Globe-aware fly-to interpolation.
 *
 * Unlike FlyToInterpolator, this stays in spherical space: longitude/latitude
 * travel along the shortest great-circle path, while zoom interpolates in the
 * GlobeViewport scale space (`zoom - zoomAdjust(latitude)`) so perceived scale
 * stays continuous as latitude changes.
 */
export default class GlobeFlyToInterpolator extends TransitionInterpolator {
  opts: {
    curve: number;
    speed: number;
    screenSpeed?: number;
    minDuration: number;
    maxDuration?: number;
  };

  constructor(
    opts: {
      /** The zooming "curve" that will occur along the flight path. Default `1.414`. */
      curve?: number;
      /** Higher speed returns shorter auto durations. Default `1.2`. */
      speed?: number;
      /** Average speed measured in screenfuls per second. When specified, `speed` is ignored. */
      screenSpeed?: number;
      /** Lower bound for auto duration in milliseconds. Default `300`. */
      minDuration?: number;
      /** Maximum duration in milliseconds. If calculated duration exceeds this, `0` is returned. */
      maxDuration?: number;
    } = {}
  ) {
    super({
      compare: ['longitude', 'latitude', 'zoom', 'bearing', 'pitch', 'position'],
      extract: [
        'width',
        'height',
        'longitude',
        'latitude',
        'zoom',
        'bearing',
        'pitch',
        'position'
      ],
      required: ['width', 'height', 'latitude', 'longitude', 'zoom']
    });
    this.opts = {...DEFAULT_OPTS, ...opts};
  }

  interpolateProps(
    startProps: Record<string, any>,
    endProps: Record<string, any>,
    t: number
  ): Record<string, any> {
    const startPosition = Globe.toPosition(startProps.longitude, startProps.latitude);
    const endPosition = Globe.toPosition(endProps.longitude, endProps.latitude);
    const [longitude, latitude] = Globe.toLngLat(slerpPosition(startPosition, endPosition, t));
    const flyTo = flyToViewport(
      getFlyToViewportProps(startProps),
      getFlyToViewportProps(endProps),
      t,
      this.opts
    );
    const flyToScaleZoom = flyTo.zoom - zoomAdjust(flyTo.latitude, true);
    const zoom = flyToScaleZoom + zoomAdjust(latitude, true);

    const viewport: Record<string, any> = {longitude, latitude, zoom};
    viewport.bearing = lerpAngle(
      startProps.bearing || LINEARLY_INTERPOLATED_PROPS.bearing,
      endProps.bearing || LINEARLY_INTERPOLATED_PROPS.bearing,
      t
    );
    viewport.pitch = lerp(
      startProps.pitch || LINEARLY_INTERPOLATED_PROPS.pitch,
      endProps.pitch || LINEARLY_INTERPOLATED_PROPS.pitch,
      t
    );
    viewport.position = lerp(
      startProps.position || LINEARLY_INTERPOLATED_PROPS.position,
      endProps.position || LINEARLY_INTERPOLATED_PROPS.position,
      t
    );

    return viewport;
  }

  getDuration(startProps: Record<string, any>, endProps: Record<string, any>): number {
    let {transitionDuration} = endProps;
    if (transitionDuration !== 'auto') {
      return transitionDuration;
    }

    transitionDuration = getFlyToDuration(
      getFlyToViewportProps(startProps),
      getFlyToViewportProps(endProps),
      this.opts
    );
    if (transitionDuration === 0) {
      return 0;
    }
    transitionDuration = Math.max(this.opts.minDuration, transitionDuration);

    if (this.opts.maxDuration && transitionDuration > this.opts.maxDuration) {
      return 0;
    }
    return transitionDuration;
  }
}
