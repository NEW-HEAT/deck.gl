// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import React, {useState, useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {DeckGL} from '@deck.gl/react';
import {_GlobeView as GlobeView, COORDINATE_SYSTEM} from '@deck.gl/core';
import {IconLayer, GeoJsonLayer} from '@deck.gl/layers';
import {SimpleMeshLayer} from '@deck.gl/mesh-layers';
import {SphereGeometry} from '@luma.gl/engine';

import IconClusterLayer from './icon-cluster-layer';
import type {IconClusterLayerPickingInfo} from './icon-cluster-layer';
import type {PickingInfo, GlobeViewState} from '@deck.gl/core';
import type {IconLayerProps} from '@deck.gl/layers';
import {Device} from '@luma.gl/core';

// Source data CSV
const DATA_URL =
  'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/icon/meteorites.json'; // eslint-disable-line

const GLOBE_VIEW = new GlobeView();
const INITIAL_VIEW_STATE: GlobeViewState = {
  longitude: -35,
  latitude: 36.7,
  zoom: 1.5,
  maxZoom: 20
};

// Float markers slightly above the globe surface so they aren't z-fighting with the
// land polygons / earth sphere, while still being occluded on the far side of the globe.
const ICON_ALTITUDE_METERS = 10000;

const EARTH_RADIUS_METERS = 6.3e6;

// GlobeView has no flat basemap, so draw an earth sphere + landmasses as the background.
const backgroundLayers = [
  new SimpleMeshLayer({
    id: 'earth-sphere',
    data: [0],
    mesh: new SphereGeometry({radius: EARTH_RADIUS_METERS, nlat: 18, nlong: 36}),
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    getPosition: [0, 0, 0],
    getColor: [24, 36, 64]
  }),
  new GeoJsonLayer({
    id: 'earth-land',
    data: 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_land.geojson',
    stroked: false,
    filled: true,
    getFillColor: [90, 110, 130]
  })
];

type Meterite = {
  coordinates: [longitude: number, latitude: number];
  name: string;
  class: string;
  mass: number;
  year: number;
};

function renderTooltip(info: IconClusterLayerPickingInfo<Meterite>) {
  const {object, objects, x, y} = info;

  if (objects) {
    return (
      <div className="tooltip interactive" style={{left: x, top: y}}>
        {objects.map(({name, year, mass, class: meteorClass}) => {
          return (
            <div key={name}>
              <h5>{name}</h5>
              <div>Year: {year || 'unknown'}</div>
              <div>Class: {meteorClass}</div>
              <div>Mass: {mass}g</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (!object) {
    return null;
  }

  return 'cluster' in object && object.cluster ? (
    <div className="tooltip" style={{left: x, top: y}}>
      {object.point_count} records
    </div>
  ) : (
    <div className="tooltip" style={{left: x, top: y}}>
      {object.name} {object.year ? `(${object.year})` : ''}
    </div>
  );
}

/* eslint-disable react/no-deprecated */
export default function App({
  device,
  data = DATA_URL,
  iconMapping = 'data/location-icon-mapping.json',
  iconAtlas = 'data/location-icon-atlas.png',
  showCluster = true
}: {
  device?: Device;
  showCluster?: boolean;
  data?: string | Meterite[];
  iconMapping?: string;
  iconAtlas?: string;
}) {
  const [hoverInfo, setHoverInfo] = useState<IconClusterLayerPickingInfo<Meterite> | null>(null);

  const hideTooltip = useCallback(() => {
    setHoverInfo(null);
  }, []);
  const expandTooltip = useCallback((info: PickingInfo) => {
    if (info.picked && showCluster) {
      setHoverInfo(info);
    } else {
      setHoverInfo(null);
    }
  }, []);

  const layerProps: IconLayerProps<Meterite> = {
    id: 'icon',
    data,
    pickable: true,
    getPosition: d => d.coordinates,
    iconAtlas,
    iconMapping
  };

  if (hoverInfo === null || !hoverInfo.objects) {
    layerProps.onHover = setHoverInfo;
  }

  const layer = showCluster
    ? new IconClusterLayer({...layerProps, id: 'icon-cluster', sizeScale: 40})
    : new IconLayer({
        ...layerProps,
        id: 'icon',
        getPosition: d => [d.coordinates[0], d.coordinates[1], ICON_ALTITUDE_METERS],
        getIcon: d => 'marker',
        sizeUnits: 'meters',
        sizeScale: 2000,
        sizeMinPixels: 6,
        // GlobeView flips billboard winding; disable back-face culling so icons stay visible.
        parameters: {cullMode: 'none'}
      });
  return (
    <DeckGL
      device={device}
      layers={[...backgroundLayers, layer]}
      views={GLOBE_VIEW}
      initialViewState={INITIAL_VIEW_STATE}
      controller={true}
      onViewStateChange={hideTooltip}
      onClick={expandTooltip}
    >
      {hoverInfo && renderTooltip(hoverInfo)}
    </DeckGL>
  );
}

export function renderToDOM(container: HTMLDivElement) {
  createRoot(container).render(<App />);
}
