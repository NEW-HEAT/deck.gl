// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import {CompositeLayer} from '@deck.gl/core';
import {IconLayer, IconLayerProps} from '@deck.gl/layers';
import Supercluster from 'supercluster';

import type {PointFeature, ClusterFeature, ClusterProperties} from 'supercluster';
import type {UpdateParameters, PickingInfo} from '@deck.gl/core';

export type IconClusterLayerPickingInfo<DataT> = PickingInfo<
  DataT | (DataT & ClusterProperties),
  {objects?: DataT[]}
>;

// Float markers above the globe surface so they render in front of the basemap geometry
// (earth sphere + land) instead of z-fighting with it on GlobeView.
const ICON_ALTITUDE_METERS = 10000;

// Depth testing is turned off for the markers (so the globe never clips a billboard at the
// limb). Instead each cluster's *member points* are tested individually against the camera-
// facing hemisphere: a member counts fully within FADE_START_DEG of the point facing the
// camera (the GlobeView center) and fades to zero by FADE_END_DEG. A cluster's size scales
// with how many members are still visible (so it shrinks as points rotate off), its opacity
// holds then fades once most members are gone, and it drops once effectively none remain.
const FADE_START_DEG = 60;
const FADE_END_DEG = 90;
const DEG2RAD = Math.PI / 180;
// Drop a cluster once fewer than ~half of a single point is still visible.
const MIN_VISIBLE_WEIGHT = 0.5;
// Opacity stays full until the visible fraction drops below this, then fades to 0.
const OPACITY_FADE_FRACTION = 0.5;

type FacingFeature<DataT> = (PointFeature<DataT> | ClusterFeature<DataT>) & {
  __alpha: number;
  __size: number;
  __count: number;
};

function lngLatToUnitVector(lng: number, lat: number): [number, number, number] {
  const lngR = lng * DEG2RAD;
  const latR = lat * DEG2RAD;
  const cosLat = Math.cos(latR);
  return [cosLat * Math.cos(lngR), cosLat * Math.sin(lngR), Math.sin(latR)];
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function getIconName(size: number): string {
  if (size === 0) {
    return '';
  }
  if (size < 10) {
    return `marker-${size}`;
  }
  if (size < 100) {
    return `marker-${Math.floor(size / 10)}0`;
  }
  return 'marker-100';
}

function getIconSize(size: number): number {
  return Math.min(100, size) / 100 + 1;
}

export default class IconClusterLayer<
  DataT extends {[key: string]: any} = any,
  ExtraProps extends {} = {}
> extends CompositeLayer<Required<IconLayerProps<DataT>> & ExtraProps> {
  state!: {
    // `clusters` is the full set for the current zoom; `memberVectors[i]` holds the unit
    // vectors of clusters[i]'s member points (cached per zoom); `data` is the camera-facing,
    // size-scaled + faded subset actually rendered (recomputed as the globe rotates).
    data: FacingFeature<DataT>[];
    clusters: (PointFeature<DataT> | ClusterFeature<DataT>)[];
    memberVectors: [number, number, number][][];
    index: Supercluster<DataT, DataT>;
    z: number;
  };

  shouldUpdateState({changeFlags}: UpdateParameters<this>) {
    return changeFlags.somethingChanged;
  }

  updateState({props, oldProps, changeFlags}: UpdateParameters<this>) {
    const rebuildIndex = changeFlags.dataChanged || props.sizeScale !== oldProps.sizeScale;
    let {index, clusters, memberVectors, z} = this.state;

    if (rebuildIndex) {
      index = new Supercluster<DataT, DataT>({
        maxZoom: 16,
        radius: props.sizeScale * Math.sqrt(2)
      });
      index.load(
        // @ts-ignore Supercluster expects proper GeoJSON feature
        (props.data as DataT[]).map(d => ({
          geometry: {coordinates: (props.getPosition as Function)(d)},
          properties: d
        }))
      );
    }

    const newZ = Math.floor(this.context.viewport.zoom);
    if (rebuildIndex || newZ !== z) {
      clusters = index.getClusters([-180, -85, 180, 85], newZ);
      // Cache each cluster's member points as unit vectors so the per-frame visibility test is
      // just dot products. getLeaves() is only called here, on zoom-level change.
      memberVectors = clusters.map(cluster => this._getMemberVectors(index, cluster));
      z = newZ;
    }

    // Recompute the visible subset on every viewport change (incl. rotation), since
    // shouldUpdateState() returns on `somethingChanged` (which includes viewportChanged).
    const data = this._getCameraFacingClusters(clusters, memberVectors);

    this.setState({index, clusters, memberVectors, z, data});
  }

  private _getMemberVectors(
    index: Supercluster<DataT, DataT>,
    cluster: PointFeature<DataT> | ClusterFeature<DataT>
  ): [number, number, number][] {
    const props = cluster.properties as Partial<ClusterProperties>;
    if (props.cluster) {
      // All leaves of the cluster (limit Infinity), as unit vectors.
      return index
        .getLeaves(props.cluster_id as number, Infinity)
        .map(leaf =>
          lngLatToUnitVector(leaf.geometry.coordinates[0], leaf.geometry.coordinates[1])
        );
    }
    return [lngLatToUnitVector(cluster.geometry.coordinates[0], cluster.geometry.coordinates[1])];
  }

  // For each cluster, softly count how many member points are still on the camera-facing
  // hemisphere. Size scales with that visible count (shrinking as points rotate off), opacity
  // holds then fades once most members are gone, and clusters with ~none visible are dropped.
  private _getCameraFacingClusters(
    clusters?: (PointFeature<DataT> | ClusterFeature<DataT>)[],
    memberVectors?: [number, number, number][][]
  ): FacingFeature<DataT>[] {
    if (!clusters || !memberVectors || clusters.length === 0) {
      return [];
    }
    const {viewport} = this.context;
    // On a (non-pitched) GlobeView, the point facing the camera is the viewport center.
    const camera = lngLatToUnitVector(viewport.longitude, viewport.latitude);
    const cosStart = Math.cos(FADE_START_DEG * DEG2RAD);
    const cosEnd = Math.cos(FADE_END_DEG * DEG2RAD);

    const facing: FacingFeature<DataT>[] = [];
    for (let i = 0; i < clusters.length; i++) {
      const vectors = memberVectors[i];
      const total = vectors.length || 1;

      // Soft count of member points still facing the camera (faded near the limb).
      let visibleWeight = 0;
      for (const v of vectors) {
        const dot = v[0] * camera[0] + v[1] * camera[1] + v[2] * camera[2];
        if (dot > cosEnd) {
          visibleWeight += smoothstep((dot - cosEnd) / (cosStart - cosEnd));
        }
      }
      if (visibleWeight < MIN_VISIBLE_WEIGHT) {
        // Effectively no members left on the visible face — drop from the rendered list.
        continue;
      }

      const visibleFraction = visibleWeight / total;
      // Re-count the cluster to just its visible members: both the label (getIcon) and the size
      // are driven by this, so a "100+" cluster genuinely ticks down (100+ → 40 → 5 → 1) and
      // shrinks as its points rotate past the horizon, rather than staying "100+" and scaling.
      const visibleCount = Math.max(1, Math.round(visibleWeight));
      facing.push({
        ...clusters[i],
        __count: visibleCount,
        __size: getIconSize(visibleCount),
        // Opacity holds until most members are gone, then fades for a clean exit.
        __alpha: smoothstep(visibleFraction / OPACITY_FADE_FRACTION)
      } as FacingFeature<DataT>);
    }
    return facing;
  }

  getPickingInfo({
    info,
    mode
  }: {
    info: PickingInfo<PointFeature<DataT> | ClusterFeature<DataT>>;
    mode: string;
  }): IconClusterLayerPickingInfo<DataT> {
    const pickedObject = info.object?.properties;
    if (pickedObject) {
      let objects: DataT[] | undefined;
      if (pickedObject.cluster && mode !== 'hover') {
        objects = this.state.index.getLeaves(pickedObject.cluster_id, 25).map(f => f.properties);
      }
      return {...info, object: pickedObject, objects};
    }
    return {...info, object: undefined};
  }

  renderLayers() {
    const {data} = this.state;
    const {iconAtlas, iconMapping, sizeScale} = this.props;

    return new IconLayer<FacingFeature<DataT>>({
      // Spread getSubLayerProps first so the explicit props below (notably `parameters`)
      // are not clobbered by the composite's forwarded parameters.
      ...this.getSubLayerProps({
        id: 'icon'
      }),
      data,
      iconAtlas,
      iconMapping,
      sizeScale,
      getPosition: d => [
        d.geometry.coordinates[0],
        d.geometry.coordinates[1],
        ICON_ALTITUDE_METERS
      ],
      // Icon (and its number) reflects the *visible* member count, ticking down as points leave.
      getIcon: d => getIconName(d.__count),
      // Size shrinks as the cluster's member points rotate off the camera-facing hemisphere.
      getSize: d => d.__size,
      // Opacity holds, then fades once most members are gone (alpha multiplies icon opacity).
      getColor: d => [255, 255, 255, Math.round(d.__alpha * 255)],
      updateTriggers: {
        getIcon: this.state.data,
        getSize: this.state.data,
        getColor: this.state.data
      },
      // Depth testing is OFF — occlusion is handled by the camera-facing filter so the globe
      // never clips a billboard at the limb. cullMode:'none' keeps GlobeView billboards (whose
      // winding the globe transform flips) from being back-face culled.
      parameters: {cullMode: 'none', depthCompare: 'always'}
    });
  }
}
