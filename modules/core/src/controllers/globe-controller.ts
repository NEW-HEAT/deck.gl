// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import {clamp} from '@math.gl/core';
import Controller, {type InteractionState} from './controller';

import {MapState, MapStateProps} from './map-controller';
import type {MapStateInternal} from './map-controller';
import {mod} from '../utils/math-utils';
import LinearInterpolator from '../transitions/linear-interpolator';
import GlobeViewport, {zoomAdjust, GLOBE_RADIUS} from '../viewports/globe-viewport';
import {
  Globe,
  type CameraFrame,
  GLOBE_INERTIA_EASING,
  GlobeInertiaInterpolator
} from '../viewports/globe-utils';
import {MAX_LATITUDE} from '@math.gl/web-mercator';

import type {MjolnirGestureEvent} from 'mjolnir.js';

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

export type GlobeMaxLatitudeStop =
  | [zoom: number, maxLatitude: number]
  | {zoom: number; maxLatitude?: number; latitude?: number};

export type GlobeMaxLatitude = number | GlobeMaxLatitudeStop[];

export type GlobeLowZoomOrientationReset =
  | number
  | {
      /** Zoom at or below which orientation is fully reset to north-up/zero-pitch. */
      zoomThreshold?: number;
      /** Alias for zoomThreshold. */
      zoom?: number;
      /** Alias for zoomThreshold. */
      maxZoom?: number;
      /** Blend distance above the threshold before user orientation is fully restored. */
      zoomRange?: number;
      /** Whether bearing is damped to 0. Defaults to true. */
      bearing?: boolean;
      /** Whether pitch is damped to 0. Defaults to true. */
      pitch?: boolean;
      /** Soft interactive bearing limit while zoomed out before snapping back. Defaults to 30. */
      maxBearing?: number;
      /** Soft interactive pitch limit while zoomed out before snapping back. Defaults to 22. */
      maxPitch?: number;
      /** Hard bearing cap after friction is applied. Defaults to 75. */
      hardMaxBearing?: number;
      /** Hard pitch cap after friction is applied. Defaults to 50. */
      hardMaxPitch?: number;
      /** Shared friction for bearing and pitch outside the soft limits. Defaults to 0.18. */
      friction?: number;
      /** Bearing friction outside maxBearing. Defaults to friction. */
      bearingFriction?: number;
      /** Pitch friction outside maxPitch. Defaults to friction. */
      pitchFriction?: number;
      /** Orientation reset transition duration in ms. Defaults to 120. */
      resetDuration?: number;
    };

type GlobeConstrainableViewState = {
  latitude: number;
  zoom: number;
  bearing?: number;
  pitch?: number;
  maxLatitude?: unknown;
  maxLatitudeZoomClamp?: unknown;
  minGlobeZoom?: unknown;
  lowZoomOrientationReset?: unknown;
  globeOrientationResetTransition?: unknown;
};

type GlobeLatitudeStop = {zoom: number; maxLatitude: number};

type GlobeOrientationConfig = {
  preserveOrientation: number;
  resetBearing: boolean;
  resetPitch: boolean;
  maxBearing: number;
  maxPitch: number;
  hardMaxBearing: number;
  hardMaxPitch: number;
  bearingFriction: number;
  pitchFriction: number;
  resetDuration: number;
};

function degreesToPixels(angle: number, zoom: number = 0): number {
  const radians = Math.min(180, angle) * DEGREES_TO_RADIANS;
  const size = GLOBE_RADIUS * 2 * Math.sin(radians / 2);
  return size * Math.pow(2, zoom);
}

function pixelsToDegrees(pixels: number, zoom: number = 0): number {
  const size = pixels / Math.pow(2, zoom);
  const radians = Math.asin(Math.min(1, size / GLOBE_RADIUS / 2)) * 2;
  return radians * RADIANS_TO_DEGREES;
}

function isGlobeViewport(viewport: unknown): viewport is GlobeViewport {
  return viewport instanceof GlobeViewport && typeof viewport.panByGlobeAnchor === 'function';
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeMaxLatitude(value: number): number {
  return clamp(Math.abs(value), 0, 90);
}

function getLatitudeStop(stop: unknown): GlobeLatitudeStop | null {
  if (Array.isArray(stop)) {
    const zoom = finiteNumber(stop[0]);
    const maxLatitude = finiteNumber(stop[1]);
    return zoom === null || maxLatitude === null
      ? null
      : {zoom, maxLatitude: normalizeMaxLatitude(maxLatitude)};
  }

  if (stop && typeof stop === 'object') {
    const record = stop as Record<string, unknown>;
    const zoom = finiteNumber(record.zoom);
    const maxLatitude = finiteNumber(record.maxLatitude ?? record.latitude);
    return zoom === null || maxLatitude === null
      ? null
      : {zoom, maxLatitude: normalizeMaxLatitude(maxLatitude)};
  }

  return null;
}

function getLatitudeStops(maxLatitude: unknown): GlobeLatitudeStop[] | null {
  if (!Array.isArray(maxLatitude)) {
    return null;
  }

  const stops = maxLatitude
    .map(getLatitudeStop)
    .filter((stop): stop is GlobeLatitudeStop => stop !== null)
    .sort((a, b) => a.zoom - b.zoom);

  return stops.length > 0 ? stops : null;
}

export function getGlobeMaxLatitude(maxLatitude: unknown, zoom: number): number | null {
  const fixed = finiteNumber(maxLatitude);
  if (fixed !== null) {
    return normalizeMaxLatitude(fixed);
  }

  const stops = getLatitudeStops(maxLatitude);
  if (!stops) return null;
  if (zoom <= stops[0].zoom) return stops[0].maxLatitude;

  const last = stops[stops.length - 1];
  if (zoom >= last.zoom) return last.maxLatitude;

  for (let i = 1; i < stops.length; i++) {
    const previous = stops[i - 1];
    const next = stops[i];
    if (zoom <= next.zoom) {
      const span = next.zoom - previous.zoom;
      const t = span <= 0 ? 1 : (zoom - previous.zoom) / span;
      return previous.maxLatitude + (next.maxLatitude - previous.maxLatitude) * t;
    }
  }

  return last.maxLatitude;
}

export function getGlobeMinZoomForLatitude(maxLatitude: unknown, latitude: number): number | null {
  const stops = getLatitudeStops(maxLatitude);
  if (!stops) return null;

  const targetLatitude = normalizeMaxLatitude(latitude);
  if (targetLatitude <= stops[0].maxLatitude) {
    return stops[0].zoom;
  }

  for (let i = 1; i < stops.length; i++) {
    const previous = stops[i - 1];
    const next = stops[i];
    const minLatitude = Math.min(previous.maxLatitude, next.maxLatitude);
    const maxLatitudeValue = Math.max(previous.maxLatitude, next.maxLatitude);

    if (targetLatitude >= minLatitude && targetLatitude <= maxLatitudeValue) {
      const span = next.maxLatitude - previous.maxLatitude;
      if (span === 0) {
        return Math.min(previous.zoom, next.zoom);
      }
      const t = (targetLatitude - previous.maxLatitude) / span;
      return previous.zoom + (next.zoom - previous.zoom) * t;
    }
  }

  return stops[stops.length - 1].zoom;
}

function constrainGlobeLatitude<T extends GlobeConstrainableViewState>(
  viewState: T,
  maxLatitude: unknown = viewState.maxLatitude
): T {
  let constrained = viewState;

  const latitudeLimit = getGlobeMaxLatitude(maxLatitude, viewState.zoom);
  if (latitudeLimit !== null) {
    const latitude = clamp(viewState.latitude, -latitudeLimit, latitudeLimit);
    if (latitude !== viewState.latitude) {
      constrained = {...constrained, latitude};
    }
  }

  return constrained;
}

function constrainGlobeZoom<T extends GlobeConstrainableViewState>(
  viewState: T,
  maxLatitude: unknown = viewState.maxLatitude,
  maxLatitudeZoomClamp: unknown = viewState.maxLatitudeZoomClamp,
  minGlobeZoom: unknown = viewState.minGlobeZoom
): T {
  let minZoom = finiteNumber(minGlobeZoom);

  if (maxLatitudeZoomClamp !== false) {
    const minZoomForLatitude = getGlobeMinZoomForLatitude(maxLatitude, viewState.latitude);
    if (minZoomForLatitude !== null) {
      minZoom = minZoom === null ? minZoomForLatitude : Math.max(minZoom, minZoomForLatitude);
    }
  }

  if (minZoom === null || viewState.zoom >= minZoom) {
    return viewState;
  }

  return {...viewState, zoom: minZoom};
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function normalizeAngle(value: number): number {
  return mod(value + 180, 360) - 180;
}

function normalizeFriction(value: number): number {
  return clamp(value, 0, 1);
}

function getLowZoomOrientationConfig(
  lowZoomOrientationReset: unknown,
  zoom: number
): GlobeOrientationConfig | null {
  if (lowZoomOrientationReset === false || lowZoomOrientationReset == null) {
    return null;
  }

  let threshold: number | null = null;
  let range = 1;
  let resetBearing = true;
  let resetPitch = true;
  let maxBearing = 30;
  let maxPitch = 22;
  let hardMaxBearing = 75;
  let hardMaxPitch = 50;
  let friction = 0.18;
  let bearingFriction: number | null = null;
  let pitchFriction: number | null = null;
  let resetDuration = 120;

  if (typeof lowZoomOrientationReset === 'number') {
    threshold = finiteNumber(lowZoomOrientationReset);
  } else if (typeof lowZoomOrientationReset === 'object') {
    const record = lowZoomOrientationReset as Record<string, unknown>;
    threshold = finiteNumber(record.zoomThreshold ?? record.zoom ?? record.maxZoom);
    range = finiteNumber(record.zoomRange) ?? range;
    resetBearing = record.bearing !== false;
    resetPitch = record.pitch !== false;
    maxBearing = finiteNumber(record.maxBearing) ?? maxBearing;
    maxPitch = finiteNumber(record.maxPitch) ?? maxPitch;
    hardMaxBearing = finiteNumber(record.hardMaxBearing) ?? hardMaxBearing;
    hardMaxPitch = finiteNumber(record.hardMaxPitch) ?? hardMaxPitch;
    friction = finiteNumber(record.friction) ?? friction;
    bearingFriction = finiteNumber(record.bearingFriction);
    pitchFriction = finiteNumber(record.pitchFriction);
    resetDuration = finiteNumber(record.resetDuration) ?? resetDuration;
  }

  if (threshold === null) {
    return null;
  }

  const preserveOrientation =
    range <= 0 ? (zoom <= threshold ? 0 : 1) : smoothstep((zoom - threshold) / range);

  if (preserveOrientation >= 1) {
    return null;
  }

  maxBearing = clamp(Math.abs(maxBearing), 0, 180);
  maxPitch = clamp(Math.abs(maxPitch), 0, 90);
  hardMaxBearing = clamp(Math.max(Math.abs(hardMaxBearing), maxBearing), maxBearing, 180);
  hardMaxPitch = clamp(Math.max(Math.abs(hardMaxPitch), maxPitch), maxPitch, 90);
  bearingFriction = normalizeFriction(bearingFriction ?? friction);
  pitchFriction = normalizeFriction(pitchFriction ?? friction);

  return {
    preserveOrientation,
    resetBearing,
    resetPitch,
    maxBearing: resetBearing ? maxBearing + (180 - maxBearing) * preserveOrientation : 180,
    maxPitch: resetPitch ? maxPitch + (90 - maxPitch) * preserveOrientation : 90,
    hardMaxBearing: resetBearing
      ? hardMaxBearing + (180 - hardMaxBearing) * preserveOrientation
      : 180,
    hardMaxPitch: resetPitch ? hardMaxPitch + (90 - hardMaxPitch) * preserveOrientation : 90,
    bearingFriction,
    pitchFriction,
    resetDuration: Math.max(0, resetDuration)
  };
}

function applyFrictionLimit(value: number, softLimit: number, hardLimit: number, friction: number) {
  const absValue = Math.abs(value);
  if (absValue <= softLimit) {
    return value;
  }

  const sign = Math.sign(value);
  const resisted = softLimit + (absValue - softLimit) * friction;
  return sign * Math.min(resisted, hardLimit);
}

function constrainGlobeOrientation<T extends GlobeConstrainableViewState>(
  viewState: T,
  lowZoomOrientationReset: unknown = viewState.lowZoomOrientationReset
): T {
  if (viewState.globeOrientationResetTransition === true) {
    return viewState;
  }

  const config = getLowZoomOrientationConfig(lowZoomOrientationReset, viewState.zoom);
  if (!config) {
    return viewState;
  }

  let constrained = viewState;

  if (typeof viewState.bearing === 'number') {
    const bearing = applyFrictionLimit(
      normalizeAngle(viewState.bearing),
      config.maxBearing,
      config.hardMaxBearing,
      config.bearingFriction
    );
    if (bearing !== viewState.bearing) {
      constrained = {...constrained, bearing};
    }
  }

  if (typeof viewState.pitch === 'number') {
    const pitch = applyFrictionLimit(
      viewState.pitch,
      config.maxPitch,
      config.hardMaxPitch,
      config.pitchFriction
    );
    if (pitch !== viewState.pitch) {
      constrained = {...constrained, pitch};
    }
  }

  return constrained;
}

function getGlobeOrientationResetProps<T extends GlobeConstrainableViewState>(
  viewState: T,
  lowZoomOrientationReset: unknown = viewState.lowZoomOrientationReset
):
  | ({bearing?: number; pitch?: number; transitionDuration: number} & Record<string, number>)
  | null {
  const config = getLowZoomOrientationConfig(lowZoomOrientationReset, viewState.zoom);
  if (!config) {
    return null;
  }

  const resetProps: {bearing?: number; pitch?: number; transitionDuration: number} = {
    transitionDuration: config.resetDuration
  };

  if (config.resetBearing && typeof viewState.bearing === 'number') {
    const currentBearing = normalizeAngle(viewState.bearing);
    const bearing = currentBearing * config.preserveOrientation;
    resetProps.bearing = Math.abs(bearing) < 1e-6 ? 0 : bearing;
  }
  if (config.resetPitch && typeof viewState.pitch === 'number') {
    const pitch = viewState.pitch * config.preserveOrientation;
    resetProps.pitch = Math.abs(pitch) < 1e-6 ? 0 : pitch;
  }

  const bearingChanged =
    resetProps.bearing !== undefined &&
    resetProps.bearing !== normalizeAngle(viewState.bearing ?? 0);
  const pitchChanged =
    resetProps.pitch !== undefined && resetProps.pitch !== (viewState.pitch ?? 0);

  return bearingChanged || pitchChanged
    ? (resetProps as {bearing?: number; pitch?: number; transitionDuration: number} & Record<
        string,
        number
      >)
    : null;
}

export function constrainGlobeViewState<T extends GlobeConstrainableViewState>(
  viewState: T,
  maxLatitude: unknown = viewState.maxLatitude,
  lowZoomOrientationReset: unknown = viewState.lowZoomOrientationReset,
  maxLatitudeZoomClamp: unknown = viewState.maxLatitudeZoomClamp,
  minGlobeZoom: unknown = viewState.minGlobeZoom
): T {
  return constrainGlobeOrientation(
    constrainGlobeLatitude(
      constrainGlobeZoom(viewState, maxLatitude, maxLatitudeZoomClamp, minGlobeZoom),
      maxLatitude
    ),
    lowZoomOrientationReset
  );
}

type GlobeZoomAround = 'center' | 'pointer';

type GlobeStateInternal = MapStateInternal & {
  startPanPos?: [number, number];
  startPanCameraFrame?: CameraFrame;
  startPanAngularRate?: number;
  /** When true, bearing is held fixed during pan (north stays up) */
  startPanLockBearing?: boolean;
  zoomAround?: GlobeZoomAround;
};

class GlobeState extends MapState {
  constructor(
    options: MapStateProps &
      GlobeStateInternal & {
        makeViewport: (props: Record<string, any>) => any;
        zoomAround?: GlobeZoomAround;
      }
  ) {
    const {
      startPanPos,
      startPanCameraFrame,
      startPanAngularRate,
      startPanLockBearing,
      zoomAround,
      ...mapStateOptions
    } = options;
    mapStateOptions.normalize = false;
    super(mapStateOptions);

    const s = (this as any)._state;
    if (startPanPos !== undefined) s.startPanPos = startPanPos;
    if (startPanCameraFrame !== undefined) s.startPanCameraFrame = startPanCameraFrame;
    if (startPanAngularRate !== undefined) s.startPanAngularRate = startPanAngularRate;
    if (startPanLockBearing !== undefined) s.startPanLockBearing = startPanLockBearing;
    if (zoomAround !== undefined) s.zoomAround = zoomAround;
  }

  panStart({pos}: {pos: [number, number]}): GlobeState {
    const {latitude, longitude, zoom, bearing = 0} = this.getViewportProps();
    const cameraFrame = Globe.cameraFrame(longitude, latitude, bearing);
    const lockBearing = Math.abs(bearing) < 1;

    if (lockBearing) {
      // Override horizontal axis to polar so north stays up.
      // Boost rate by 1/cos(lat) to compensate for smaller longitude
      // circles near the poles, capped at 4x.
      cameraFrame.axisHorizontal = [0, 0, 1];
    }

    // Radians of arc per pixel, derived from zoom scale
    const scale = Math.pow(2, zoom - zoomAdjust(latitude, true));
    const angularRate = (0.25 / scale) * DEGREES_TO_RADIANS;

    return this._getUpdatedState({
      startPanPos: pos,
      startPanCameraFrame: cameraFrame,
      startPanAngularRate: angularRate,
      startPanLockBearing: lockBearing,
      startZoom: zoom
    }) as GlobeState;
  }

  pan({pos, startPos}: {pos: [number, number]; startPos?: [number, number]}): GlobeState {
    const state = this.getState() as GlobeStateInternal;
    const startPanPos = state.startPanPos || startPos;
    if (!startPanPos) return this;

    const frame = state.startPanCameraFrame;
    const rate = state.startPanAngularRate;
    const startZoom = state.startZoom ?? this.getViewportProps().zoom;
    if (!frame || !rate) {
      return this;
    }

    const dx = startPanPos[0] - pos[0];
    const dy = startPanPos[1] - pos[1];

    let hAngle = dx * rate;
    let vAngle = -dy * rate;
    const locked = state.startPanLockBearing;

    if (locked) {
      // Boost horizontal rate by 1/cos(lat) for the polar axis, capped at 4x
      const cosLat = Math.cos(frame.latitude * DEGREES_TO_RADIANS);
      hAngle = (dx * rate) / Math.max(cosLat, 0.25);
      // Clamp vertical angle to prevent crossing the poles
      const maxUp = (MAX_LATITUDE - frame.latitude) * DEGREES_TO_RADIANS;
      const maxDown = -(MAX_LATITUDE + frame.latitude) * DEGREES_TO_RADIANS;
      vAngle = clamp(vAngle, maxDown, maxUp);
    }

    const viewportProps = this.getViewportProps();
    const rotated = Globe.rotateFrame(frame, hAngle, vAngle, locked);
    const maxLatitude = getGlobeMaxLatitude(viewportProps.maxLatitude, startZoom);
    const latitude =
      maxLatitude === null ? rotated.latitude : clamp(rotated.latitude, -maxLatitude, maxLatitude);
    const zoom = this._constrainZoom(
      startZoom + zoomAdjust(latitude, true) - zoomAdjust(frame.latitude, true),
      {...viewportProps, latitude}
    );
    const finalMaxLatitude = getGlobeMaxLatitude(viewportProps.maxLatitude, zoom);
    const finalLatitude =
      finalMaxLatitude === null
        ? latitude
        : clamp(rotated.latitude, -finalMaxLatitude, finalMaxLatitude);

    return this._getUpdatedState({
      longitude: rotated.longitude,
      latitude: finalLatitude,
      bearing: rotated.bearing,
      zoom
    }) as GlobeState;
  }

  panEnd(): GlobeState {
    return this._getUpdatedState({
      startPanPos: null,
      startPanCameraFrame: null,
      startPanAngularRate: null,
      startPanLockBearing: null,
      startZoom: null
    }) as GlobeState;
  }

  zoomStart({pos}: {pos: [number, number]}): GlobeState {
    const startZoomLngLat = this._shouldZoomAroundPointer()
      ? this._unprojectForZoomAround(pos)
      : undefined;

    return this._getUpdatedState({
      startZoomLngLat,
      startZoom: this.getViewportProps().zoom
    }) as GlobeState;
  }

  zoom({
    pos,
    startPos,
    scale
  }: {
    pos: [number, number];
    startPos?: [number, number];
    scale: number;
  }): MapState {
    const state = this.getState();
    const {startZoom} = state;
    let {startZoomLngLat} = state;
    const hasZoomStart = startZoom !== undefined;
    const startZoomValue = (startZoom as number) ?? this.getViewportProps().zoom;
    const scaleLog2 = Math.log2(scale);
    const zoom = this._constrainZoom(startZoomValue + scaleLog2);

    // Skip pan-by-anchor when the gesture isn't actually zooming. This is the
    // touch-pinch case where the user dragged 2 fingers in parallel (intent:
    // pitch) and `scale` stayed at ~1 from sensor noise. Without this guard
    // panByGlobeAnchor still re-anchors lng/lat to the centroid → camera
    // pans following the fingers, which reads as "pinch wins, no pitch".
    const SCALE_LOG2_PAN_THRESHOLD = 0.005;
    if (!this._shouldZoomAroundPointer() || Math.abs(scaleLog2) < SCALE_LOG2_PAN_THRESHOLD) {
      return this._getUpdatedState({zoom});
    }

    if (!startZoomLngLat && !hasZoomStart) {
      startZoomLngLat = this._unprojectForZoomAround(startPos) || this._unprojectForZoomAround(pos);
    }

    if (!startZoomLngLat) {
      return this._getUpdatedState({zoom});
    }

    const zoomedViewport = this.makeViewport({...this.getViewportProps(), zoom});
    if (!isGlobeViewport(zoomedViewport)) {
      return this._getUpdatedState({
        zoom,
        ...zoomedViewport.panByPosition(startZoomLngLat, pos)
      });
    }

    return this._getUpdatedState({
      zoom,
      ...zoomedViewport.panByGlobeAnchor(startZoomLngLat, pos)
    });
  }

  zoomEnd(): GlobeState {
    return this._getUpdatedState({
      startZoomLngLat: null,
      startZoom: null
    }) as GlobeState;
  }

  _panFromCenter(offset: [number, number]): GlobeState {
    const {width, height} = this.getViewportProps();
    const center: [number, number] = [width / 2, height / 2];
    return this.panStart({pos: center})
      .pan({pos: [center[0] + offset[0], center[1] + offset[1]]})
      .panEnd();
  }

  applyConstraints(props: Required<MapStateProps>): Required<MapStateProps> {
    const {longitude, latitude, maxBounds} = props;
    let constrainedByMaxLatitude = false;

    if (longitude < -180 || longitude > 180) {
      props.longitude = mod(longitude + 180, 360) - 180;
    }
    props.latitude = clamp(latitude, -90, 90);

    const latitudeBeforeMaxLatitude = props.latitude;
    Object.assign(props, constrainGlobeLatitude(props));
    constrainedByMaxLatitude ||= props.latitude !== latitudeBeforeMaxLatitude;

    props.zoom = this._constrainZoom(props.zoom, props);

    if (props.bearing < -180 || props.bearing > 180) {
      props.bearing = mod(props.bearing + 180, 360) - 180;
    }
    props.pitch = clamp(props.pitch, props.minPitch, props.maxPitch);
    Object.assign(props, constrainGlobeOrientation(props));

    if (maxBounds) {
      props.longitude = clamp(props.longitude, maxBounds[0][0], maxBounds[1][0]);
      props.latitude = clamp(props.latitude, maxBounds[0][1], maxBounds[1][1]);
    }

    if (maxBounds) {
      const effectiveZoom = props.zoom - zoomAdjust(latitude);
      const lngSpan = maxBounds[1][0] - maxBounds[0][0];
      const latSpan = maxBounds[1][1] - maxBounds[0][1];
      if (latSpan > 0 && latSpan < 180) {
        const halfHeightDegrees =
          Math.min(pixelsToDegrees(props.height, effectiveZoom), latSpan) / 2;
        props.latitude = clamp(
          props.latitude,
          maxBounds[0][1] + halfHeightDegrees,
          maxBounds[1][1] - halfHeightDegrees
        );
      }
      if (lngSpan > 0 && lngSpan < 360) {
        const halfWidthDegrees =
          Math.min(
            pixelsToDegrees(
              props.width / Math.cos(props.latitude * DEGREES_TO_RADIANS),
              effectiveZoom
            ),
            lngSpan
          ) / 2;
        props.longitude = clamp(
          props.longitude,
          maxBounds[0][0] + halfWidthDegrees,
          maxBounds[1][0] - halfWidthDegrees
        );
      }
    }
    const latitudeBeforeFinalMaxLatitude = props.latitude;
    Object.assign(props, constrainGlobeLatitude(props));
    constrainedByMaxLatitude ||= props.latitude !== latitudeBeforeFinalMaxLatitude;

    if (props.latitude !== latitude && !constrainedByMaxLatitude) {
      props.zoom += zoomAdjust(props.latitude, true) - zoomAdjust(latitude, true);
    }

    return props;
  }

  _constrainZoom(zoom: number, props?: Required<MapStateProps>): number {
    props ||= this.getViewportProps();
    const {maxZoom, maxBounds, maxLatitude, maxLatitudeZoomClamp} = props;
    let {minZoom} = props;

    const shouldApplyMaxBounds = maxBounds !== null && props.width > 0 && props.height > 0;
    if (shouldApplyMaxBounds) {
      const minLatitude = maxBounds[0][1];
      const maxLatitude = maxBounds[1][1];
      const fitLatitude =
        Math.sign(minLatitude) === Math.sign(maxLatitude)
          ? Math.min(Math.abs(minLatitude), Math.abs(maxLatitude))
          : 0;
      const ZOOM0 = zoomAdjust(0);
      const w =
        degreesToPixels(maxBounds[1][0] - maxBounds[0][0]) *
        Math.cos(fitLatitude * DEGREES_TO_RADIANS);
      const h = degreesToPixels(maxBounds[1][1] - maxBounds[0][1]);
      if (w > 0) {
        minZoom = Math.max(minZoom, Math.log2(props.width / w) + ZOOM0);
      }
      if (h > 0) {
        minZoom = Math.max(minZoom, Math.log2(props.height / h) + ZOOM0);
      }
      if (minZoom > maxZoom) minZoom = maxZoom;
    }

    const zoomAdjustment = zoomAdjust(props.latitude, true) - zoomAdjust(0, true);
    let dynamicMinZoom = minZoom + zoomAdjustment;
    const minGlobeZoom = finiteNumber(props.minGlobeZoom);
    if (minGlobeZoom !== null) {
      dynamicMinZoom = Math.max(dynamicMinZoom, minGlobeZoom);
    }
    if (maxLatitudeZoomClamp !== false) {
      const minZoomForLatitude = getGlobeMinZoomForLatitude(maxLatitude, props.latitude);
      if (minZoomForLatitude !== null) {
        dynamicMinZoom = Math.max(dynamicMinZoom, minZoomForLatitude);
      }
    }

    return clamp(
      zoom,
      Math.min(dynamicMinZoom, maxZoom + zoomAdjustment),
      maxZoom + zoomAdjustment
    );
  }

  private _unprojectForZoomAround(pos?: [number, number]): [number, number] | undefined {
    if (!pos) {
      return undefined;
    }

    const viewport = this.makeViewport(this.getViewportProps());
    if (!isGlobeViewport(viewport)) {
      const lngLat = viewport.unproject(pos);
      return Number.isFinite(lngLat[0]) && Number.isFinite(lngLat[1])
        ? [lngLat[0], lngLat[1]]
        : undefined;
    }

    if (!isGlobeViewport(viewport) || !viewport.isPointOnGlobe(pos)) {
      return undefined;
    }
    const lngLat = viewport.unproject(pos);
    return [lngLat[0], lngLat[1]];
  }

  private _shouldZoomAroundPointer(): boolean {
    return (this.getState() as GlobeStateInternal).zoomAround === 'pointer';
  }
}

export default class GlobeController extends Controller<MapState> {
  ControllerState = GlobeState;

  transition = {
    transitionDuration: 300,
    transitionInterpolator: new LinearInterpolator({
      transitionProps: {
        compare: ['longitude', 'latitude', 'zoom', 'bearing', 'pitch'],
        required: ['longitude', 'latitude', 'zoom']
      }
    })
  };

  dragMode: 'pan' | 'rotate' = 'pan';

  // Ring buffer tracking globe position during pan for inertia velocity
  private _panHistory: Array<{longitude: number; latitude: number; timestamp: number}> = [];

  protected updateViewport(
    newControllerState: MapState,
    extraProps: Record<string, any> | null = null,
    interactionState: InteractionState = {}
  ): void {
    if (interactionState.isDragging === true || interactionState.isRotating) {
      extraProps = {...extraProps, globeOrientationResetTransition: false};
    }

    const isPanOrZoomInteraction = interactionState.isPanning || interactionState.isZooming;
    if (interactionState.isDragging === false && !isPanOrZoomInteraction) {
      const viewState = {...newControllerState.getViewportProps(), ...extraProps};
      const resetProps = getGlobeOrientationResetProps(viewState);
      if (resetProps) {
        extraProps = {
          ...extraProps,
          ...resetProps,
          globeOrientationResetTransition: true,
          transitionInterpolator: this.transition.transitionInterpolator
        };
      }
    }

    super.updateViewport(newControllerState, extraProps, interactionState);
  }

  protected _onPanStart(event: MjolnirGestureEvent): boolean {
    this._panHistory = [];
    return super._onPanStart(event);
  }

  protected _onPanMove(event: MjolnirGestureEvent): boolean {
    if (!this.dragPan) {
      return false;
    }
    const pos = this.getCenter(event);
    const newControllerState = this.controllerState.pan({pos});
    this.updateViewport(
      newControllerState,
      {transitionDuration: 0},
      {
        isDragging: true,
        isPanning: true
      }
    );

    const {longitude, latitude} = newControllerState.getViewportProps();
    this._panHistory.push({longitude, latitude, timestamp: Date.now()});
    if (this._panHistory.length > 5) {
      this._panHistory.shift();
    }

    return true;
  }

  protected _onPanMoveEnd(event: MjolnirGestureEvent): boolean {
    const {inertia} = this;
    if (this.dragPan && inertia && this._panHistory.length >= 2) {
      const first = this._panHistory[0];
      const last = this._panHistory[this._panHistory.length - 1];
      const dt = last.timestamp - first.timestamp;

      if (dt > 0) {
        const viewportProps = this.controllerState.getViewportProps();
        const state = this.controllerState.getState() as GlobeStateInternal;
        const maxLatitude =
          getGlobeMaxLatitude(viewportProps.maxLatitude, viewportProps.zoom) ?? 90;

        // Compute velocity from the actual positions the globe was at
        const angularDistance = Globe.angularDistance(first, last);
        const angularVelocity = angularDistance / dt;

        if (angularVelocity > 1e-6) {
          const totalAngle = (angularVelocity * inertia) / 2;
          let interpolator: GlobeInertiaInterpolator;
          let endLng: number;
          let endLat: number;

          if (state.startPanLockBearing) {
            // Decompose into lng/lat velocity and extrapolate linearly
            let dLng = last.longitude - first.longitude;
            if (dLng > 180) dLng -= 360;
            else if (dLng < -180) dLng += 360;
            const dLat = last.latitude - first.latitude;
            const vLng = dLng / dt;
            const vLat = dLat / dt;
            endLng = viewportProps.longitude + (vLng * inertia) / 2;
            endLat = clamp(
              viewportProps.latitude + (vLat * inertia) / 2,
              -maxLatitude,
              maxLatitude
            );

            interpolator = new GlobeInertiaInterpolator({targetLongitude: endLng});
          } else {
            // Free bearing — use single-axis rotation to maintain
            // constant spin direction with up vector tracking.
            const axis = Globe.greatCircleAxis(first, last);
            const currentFrame = Globe.cameraFrame(
              viewportProps.longitude,
              viewportProps.latitude,
              viewportProps.bearing || 0
            );
            const endFrame = Globe.rotateFrame(
              {...currentFrame, axisHorizontal: axis},
              totalAngle,
              0
            );
            endLng = endFrame.longitude;
            endLat = clamp(endFrame.latitude, -maxLatitude, maxLatitude);
            interpolator = new GlobeInertiaInterpolator({axis, totalAngle});
          }

          const newControllerState = this.controllerState.panEnd();
          this.updateViewport(
            newControllerState,
            {
              transitionInterpolator: interpolator,
              transitionDuration: inertia,
              transitionEasing: GLOBE_INERTIA_EASING,
              longitude: endLng,
              latitude: endLat
            },
            {
              isDragging: false,
              isPanning: true
            }
          );
          this._panHistory = [];
          return true;
        }
      }
    }

    this._panHistory = [];
    const newControllerState = this.controllerState.panEnd();
    this.updateViewport(newControllerState, null, {
      isDragging: false,
      isPanning: false
    });
    return true;
  }
}
