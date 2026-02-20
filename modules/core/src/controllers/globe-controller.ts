// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import {clamp} from '@math.gl/core';
import Controller, {ControllerProps} from './controller';

import {MapState, MapStateProps} from './map-controller';
import type {MapStateInternal} from './map-controller';
import {mod} from '../utils/math-utils';
import LinearInterpolator from '../transitions/linear-interpolator';
import {zoomAdjust, DEFAULT_MIN_PITCH, DEFAULT_MAX_PITCH} from '../viewports/globe-viewport';

import {MAX_LATITUDE} from '@math.gl/web-mercator';

type GlobeStateInternal = MapStateInternal & {
  startPanPos?: [number, number];
};

class GlobeState extends MapState {
  constructor(
    options: MapStateProps &
      GlobeStateInternal & {
        makeViewport: (props: Record<string, any>) => any;
      }
  ) {
    const {startPanPos, ...mapStateOptions} = options;
    super(mapStateOptions);

    if (startPanPos !== undefined) {
      (this as any)._state.startPanPos = startPanPos;
    }
  }

  panStart({pos}: {pos: [number, number]}): GlobeState {
    const {latitude, longitude, zoom} = this.getViewportProps();
    return this._getUpdatedState({
      startPanLngLat: [longitude, latitude],
      startPanPos: pos,
      startZoom: zoom
    }) as GlobeState;
  }

  pan({pos, startPos}: {pos: [number, number]; startPos?: [number, number]}): GlobeState {
    const state = this.getState() as GlobeStateInternal;
    const startPanLngLat = state.startPanLngLat || this._unproject(startPos);
    if (!startPanLngLat) return this;
    const startZoom = state.startZoom ?? this.getViewportProps().zoom;
    const startPanPos = state.startPanPos || startPos;

    const coords = [startPanLngLat[0], startPanLngLat[1], startZoom];
    const viewport = this.makeViewport(this.getViewportProps());
    const newProps = viewport.panByPosition(coords, pos, startPanPos);
    return this._getUpdatedState(newProps) as GlobeState;
  }

  panEnd(): GlobeState {
    return this._getUpdatedState({
      startPanLngLat: null,
      startPanPos: null,
      startZoom: null
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
  }): GlobeState {
    // Make sure we zoom around the current mouse position rather than map center
    let {startZoom, startZoomLngLat} = this.getState();

    if (!startZoomLngLat) {
      // We have two modes of zoom:
      // scroll zoom that are discrete events (transform from the current zoom level),
      // and pinch zoom that are continuous events (transform from the zoom level when
      // pinch started).
      // If startZoom state is defined, then use the startZoom state;
      // otherwise assume discrete zooming
      startZoom = this.getViewportProps().zoom;
      startZoomLngLat = this._unproject(startPos) || this._unproject(pos);
    }
    if (!startZoomLngLat) {
      // Fallback: zoom without following cursor
      const currentZoom = this.getState().startZoom || this.getViewportProps().zoom;
      const newZoom = currentZoom + Math.log2(scale);
      return this._getUpdatedState({zoom: newZoom}) as GlobeState;
    }

    const {maxZoom, minZoom} = this.getViewportProps();
    let zoom = (startZoom as number) + Math.log2(scale);
    zoom = clamp(zoom, minZoom, maxZoom);

    const zoomedViewport = this.makeViewport({...this.getViewportProps(), zoom});

    return this._getUpdatedState({
      zoom,
      ...zoomedViewport.panByPosition(startZoomLngLat, pos)
    }) as GlobeState;
  }

  /**
   * Start rotating
   * @param {[Number, Number]} pos - position on screen where the center is
   */
  rotateStart({pos}: {pos: [number, number]}): GlobeState {
    return this._getUpdatedState({
      startRotatePos: pos,
      startBearing: this.getViewportProps().bearing || 0,
      startPitch: this.getViewportProps().pitch || 0
    }) as GlobeState;
  }

  /**
   * Rotate the globe (change bearing and pitch)
   * For GlobeView, rotation includes:
   * - Bearing: camera rotation around its view axis (compass direction)
   * - Pitch: camera tilt angle (looking at globe from above vs from the side)
   */
  rotate({
    pos,
    deltaAngleX = 0,
    deltaAngleY = 0
  }: {
    pos?: [number, number];
    deltaAngleX?: number;
    deltaAngleY?: number;
  }): GlobeState {
    const {startRotatePos, startBearing, startPitch} = this.getState();

    let newBearing: number;
    let newPitch: number;

    if (pos && startRotatePos && startBearing !== undefined && startPitch !== undefined) {
      // Calculate bearing and pitch change based on mouse movement
      const {width, height} = this.getViewportProps();
      const deltaX = pos[0] - startRotatePos[0];
      const deltaY = pos[1] - startRotatePos[1];
      const deltaScaleX = deltaX / width;
      const deltaScaleY = deltaY / height;
      newBearing = startBearing + 180 * deltaScaleX;
      // Invert deltaY for natural feel (drag down = look up)
      newPitch = startPitch - 90 * deltaScaleY;
    } else if (deltaAngleX !== 0 || deltaAngleY !== 0) {
      // Handle deltaAngleX/Y from pinch rotation or direct call
      const currentBearing = startBearing ?? this.getViewportProps().bearing ?? 0;
      const currentPitch = startPitch ?? this.getViewportProps().pitch ?? 0;
      newBearing = currentBearing + deltaAngleX;
      newPitch = currentPitch + deltaAngleY;
    } else if (startBearing !== undefined) {
      // Maintain current values
      newBearing = startBearing;
      newPitch = startPitch ?? this.getViewportProps().pitch ?? 0;
    } else {
      // No rotation data available
      return this;
    }

    return this._getUpdatedState({bearing: newBearing, pitch: newPitch}) as GlobeState;
  }

  /**
   * End rotating
   */
  rotateEnd(): GlobeState {
    return this._getUpdatedState({
      startRotatePos: null,
      startBearing: null,
      startPitch: null
    }) as GlobeState;
  }

  /**
   * Rotate left (decrease bearing)
   */
  rotateLeft(speed: number = 15): GlobeState {
    const bearing = (this.getViewportProps().bearing || 0) - speed;
    return this._getUpdatedState({bearing}) as GlobeState;
  }

  /**
   * Rotate right (increase bearing)
   */
  rotateRight(speed: number = 15): GlobeState {
    const bearing = (this.getViewportProps().bearing || 0) + speed;
    return this._getUpdatedState({bearing}) as GlobeState;
  }

  /**
   * Rotate up (decrease pitch - look more from above)
   */
  rotateUp(speed: number = 10): GlobeState {
    const pitch = (this.getViewportProps().pitch || 0) - speed;
    return this._getUpdatedState({pitch}) as GlobeState;
  }

  /**
   * Rotate down (increase pitch - look more from the side)
   */
  rotateDown(speed: number = 10): GlobeState {
    const pitch = (this.getViewportProps().pitch || 0) + speed;
    return this._getUpdatedState({pitch}) as GlobeState;
  }

  applyConstraints(props: Required<MapStateProps>): Required<MapStateProps> {
    // Ensure zoom is within specified range
    const {longitude, latitude, maxZoom, minZoom, zoom} = props;

    const ZOOM0 = zoomAdjust(0);
    const zoomAdjustment = zoomAdjust(latitude) - ZOOM0;
    props.zoom = clamp(zoom, minZoom + zoomAdjustment, maxZoom + zoomAdjustment);

    if (longitude < -180 || longitude > 180) {
      props.longitude = mod(longitude + 180, 360) - 180;
    }
    props.latitude = clamp(latitude, -MAX_LATITUDE, MAX_LATITUDE);

    // Normalize bearing to [-180, 180]
    if (props.bearing !== undefined) {
      if (props.bearing < -180 || props.bearing > 180) {
        props.bearing = mod(props.bearing + 180, 360) - 180;
      }
    }

    // Clamp pitch to valid range
    if (props.pitch !== undefined) {
      const minPitch = props.minPitch ?? DEFAULT_MIN_PITCH;
      const maxPitch = props.maxPitch ?? DEFAULT_MAX_PITCH;
      props.pitch = clamp(props.pitch, minPitch, maxPitch);
    }

    return props;
  }

  shortestPathFrom(viewState: MapState): MapStateProps {
    const fromProps = viewState.getViewportProps();
    const props = {...this.getViewportProps()};
    const {bearing, longitude} = props;

    // Normalize bearing for shortest path interpolation
    if (bearing !== undefined && fromProps.bearing !== undefined) {
      if (Math.abs(bearing - fromProps.bearing) > 180) {
        props.bearing = bearing < 0 ? bearing + 360 : bearing - 360;
      }
    }

    if (Math.abs(longitude - fromProps.longitude) > 180) {
      props.longitude = longitude < 0 ? longitude + 360 : longitude - 360;
    }
    return props;
  }
}

export default class GlobeController extends Controller<MapState> {
  ControllerState = GlobeState;

  transition = {
    transitionDuration: 300,
    transitionInterpolator: new LinearInterpolator([
      'longitude',
      'latitude',
      'zoom',
      'bearing',
      'pitch'
    ])
  };

  dragMode: 'pan' | 'rotate' = 'pan';

  setProps(props: ControllerProps) {
    super.setProps(props);

    // GlobeView now supports bearing and pitch rotation
    // Note: dragRotate/touchRotate are enabled by default in the base Controller
    // Users can still disable them via props if desired
  }
}
