// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import View, {CommonViewState, CommonViewProps} from './view';
import GlobeViewport from '../viewports/globe-viewport';
import WebMercatorViewport from '../viewports/web-mercator-viewport';
import GlobeController, {
  constrainGlobeViewState,
  type GlobeLowZoomOrientationReset,
  type GlobeMaxLatitude
} from '../controllers/globe-controller';
import type {Parameters} from '@luma.gl/core';

const GLOBE_VIEW_DEFAULT_PARAMETERS: Parameters = {
  cullMode: 'back'
};

export type GlobeViewState = {
  /** Longitude of the map center */
  longitude: number;
  /** Latitude of the map center */
  latitude: number;
  /** Zoom level */
  zoom: number;
  /** Bearing in degrees */
  bearing?: number;
  /** Pitch in degrees */
  pitch?: number;
  /** Min zoom, default `0` */
  minZoom?: number;
  /** Max zoom, default `20` */
  maxZoom?: number;
  /** The near plane position */
  nearZ?: number;
  /** The far plane position */
  farZ?: number;
} & CommonViewState;

export type GlobeViewProps = {
  /** The resolution at which to turn flat features into 3D meshes, in degrees. Smaller numbers will generate more detailed mesh. Default `10`. */
  resolution?: number;
  /** Scaler for the near plane, 1 unit equals to the height of the viewport. Default to `0.1`. Overwrites the `near` parameter. */
  nearZMultiplier?: number;
  /** Scaler for the far plane, 1 unit equals to the distance from the camera to the top edge of the screen. Default to `1.01`. Overwrites the `far` parameter. */
  farZMultiplier?: number;
  /** Distance of the camera relative to viewport height. Default `1.5`. */
  altitude?: number;
  /** Maximum absolute latitude. May be a fixed number or zoom/maxLatitude stops. */
  maxLatitude?: GlobeMaxLatitude;
  /** If true, maxLatitude stops also define the minimum zoom needed at the current latitude. Default `true`. */
  maxLatitudeZoomClamp?: boolean;
  /** Absolute lower zoom bound for GlobeView after globe-specific zoom compensation. */
  minGlobeZoom?: number;
  /** Damp pitch and/or bearing back to zero while zoomed out. */
  lowZoomOrientationReset?: GlobeLowZoomOrientationReset;
} & CommonViewProps<GlobeViewState>;

export default class GlobeView extends View<GlobeViewState, GlobeViewProps> {
  static displayName = 'GlobeView';

  constructor(props: GlobeViewProps = {}) {
    super({
      ...props,
      parameters: {
        ...GLOBE_VIEW_DEFAULT_PARAMETERS,
        ...props.parameters
      }
    });
  }

  getViewportType(viewState: GlobeViewState) {
    return viewState.zoom > 12 ? WebMercatorViewport : GlobeViewport;
  }

  filterViewState(viewState: GlobeViewState): GlobeViewState {
    return constrainGlobeViewState(
      super.filterViewState(viewState),
      this.props.maxLatitude,
      this.props.lowZoomOrientationReset,
      this.props.maxLatitudeZoomClamp,
      this.props.minGlobeZoom
    );
  }

  get controller() {
    const controller = super.controller;
    if (!controller) {
      return controller;
    }

    const {maxLatitude, maxLatitudeZoomClamp, minGlobeZoom, lowZoomOrientationReset} = this.props;
    return {
      ...controller,
      ...(maxLatitude !== undefined ? {maxLatitude} : {}),
      ...(maxLatitudeZoomClamp !== undefined ? {maxLatitudeZoomClamp} : {}),
      ...(minGlobeZoom !== undefined ? {minGlobeZoom} : {}),
      ...(lowZoomOrientationReset !== undefined ? {lowZoomOrientationReset} : {})
    };
  }

  get ControllerType() {
    return GlobeController;
  }
}
