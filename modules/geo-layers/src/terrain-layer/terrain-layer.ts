// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import {
  Color,
  CompositeLayer,
  CompositeLayerProps,
  DefaultProps,
  Layer,
  LayersList,
  log,
  Material,
  TextureSource,
  UpdateParameters
} from '@deck.gl/core';
import {SimpleMeshLayer} from '@deck.gl/mesh-layers';
import {COORDINATE_SYSTEM} from '@deck.gl/core';
import type {MeshAttributes} from '@loaders.gl/schema';
import {TerrainWorkerLoader} from '@loaders.gl/terrain';
import {ImageLoader} from '@loaders.gl/images';
import {makeGridTerrainMesh} from './grid-terrain-mesh';
import TileLayer, {TileLayerProps} from '../tile-layer/tile-layer';
import type {
  Bounds,
  GeoBoundingBox,
  TileBoundingBox,
  TileLoadProps,
  ZRange
} from '../tileset-2d/index';
import {Tile2DHeader, urlType, getURLFromTemplate, URLTemplate} from '../tileset-2d/index';

const DUMMY_DATA = [1];
const TILE_OVERLAP_PIXELS = 1;
const MIN_TERRAIN_MESH_MAX_ERROR = 1;
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

const defaultProps: DefaultProps<TerrainLayerProps> = {
  ...TileLayer.defaultProps,
  // Image url that encodes height data
  elevationData: urlType,
  // Image url to use as texture
  texture: {...urlType, optional: true},
  // Martini error tolerance in meters, smaller number -> more detailed mesh
  meshMaxError: {type: 'number', value: 4.0},
  // Maximum tile zoom used for the terrain texture. When provided, this drives
  // the TerrainLayer tile grid so imagery can refine past the mesh source zoom.
  textureMaxZoom: null,
  // Maximum tile zoom used for the elevation source. Higher render tiles sample
  // the matching subsection of the capped parent height tile.
  meshMaxZoom: null,
  // Tesselator: 'auto' (Martini/Delatin via @loaders.gl/terrain worker) or
  // 'grid' (fixed-resolution lng/lat grid, valid on MapView and GlobeView)
  tesselator: 'auto',
  // Vertices per side for the grid tesselator (ignored when tesselator !== 'grid')
  gridSize: {type: 'number', value: 65},
  // Bounding box of the terrain image, [minX, minY, maxX, maxY] in world coordinates
  bounds: {type: 'array', value: null, optional: true, compare: true},
  // Color to use if texture is unavailable
  color: {type: 'color', value: [255, 255, 255]},
  // Object to decode height data, from (r, g, b) to height in meters.
  // compare:true so consumers that pass fresh decoder refs with identical
  // values don't force a tile reload.
  elevationDecoder: {
    type: 'object',
    value: {
      rScaler: 1,
      gScaler: 0,
      bScaler: 0,
      offset: 0
    },
    compare: true
  },
  // Supply url to local terrain worker bundle. Only required if running offline and cannot access CDN.
  workerUrl: '',
  // Same as SimpleMeshLayer wireframe
  wireframe: false,
  material: true,

  loaders: [TerrainWorkerLoader, ImageLoader]
};

// Turns array of templates into a single string to work around shallow change
function urlTemplateToUpdateTrigger(template: URLTemplate): string {
  if (Array.isArray(template)) {
    return template.join(';');
  }
  return template || '';
}

// updateTriggers diff with shallow equality. Collapse the decoder to a
// value-identity string so callers passing a fresh object each render with
// identical values don't invalidate every tile.
function elevationDecoderToUpdateTrigger(decoder: ElevationDecoder): string {
  return `${decoder.rScaler}|${decoder.gScaler}|${decoder.bScaler}|${decoder.offset}`;
}

function getOverlappedBounds(bounds: Bounds, tileSize: number, clampLngLat: boolean): Bounds {
  const xPad = ((bounds[2] - bounds[0]) / tileSize) * TILE_OVERLAP_PIXELS;
  const yPad = ((bounds[3] - bounds[1]) / tileSize) * TILE_OVERLAP_PIXELS;
  const overlappedBounds: Bounds = [
    bounds[0] - xPad,
    bounds[1] - yPad,
    bounds[2] + xPad,
    bounds[3] + yPad
  ];

  if (!clampLngLat) {
    return overlappedBounds;
  }

  return [
    Math.max(overlappedBounds[0], -MAX_LONGITUDE),
    Math.max(overlappedBounds[1], -MAX_LATITUDE),
    Math.min(overlappedBounds[2], MAX_LONGITUDE),
    Math.min(overlappedBounds[3], MAX_LATITUDE)
  ];
}

function getEffectiveMeshMaxError(meshMaxError: number): number {
  if (!Number.isFinite(meshMaxError) || meshMaxError <= 0) {
    return MIN_TERRAIN_MESH_MAX_ERROR;
  }
  return Math.max(meshMaxError, MIN_TERRAIN_MESH_MAX_ERROR);
}

function normalizeMaxZoom(zoom?: number | null): number | null {
  return typeof zoom === 'number' && Number.isFinite(zoom) ? Math.max(0, Math.floor(zoom)) : null;
}

function getTerrainTileMaxZoom({
  maxZoom,
  textureMaxZoom,
  meshMaxZoom
}: {
  maxZoom?: number | null;
  textureMaxZoom?: number | null;
  meshMaxZoom?: number | null;
}): number | null | undefined {
  const hardMaxZoom = normalizeMaxZoom(maxZoom);
  const sourceMaxZoom = normalizeMaxZoom(textureMaxZoom) ?? normalizeMaxZoom(meshMaxZoom);

  if (sourceMaxZoom === null) {
    return maxZoom;
  }
  if (hardMaxZoom === null) {
    return sourceMaxZoom;
  }
  return Math.min(hardMaxZoom, sourceMaxZoom);
}

function getSourceTile(
  tile: TileLoadProps,
  maxZoom?: number | null
): {
  index: TileLoadProps['index'];
  sampleBounds?: [number, number, number, number];
} {
  const normalizedMaxZoom = normalizeMaxZoom(maxZoom);
  const {x, y, z} = tile.index;

  if (normalizedMaxZoom === null || z <= normalizedMaxZoom) {
    return {index: tile.index};
  }

  const scale = 2 ** (z - normalizedMaxZoom);
  const sourceX = Math.floor(x / scale);
  const sourceY = Math.floor(y / scale);
  const offsetX = x - sourceX * scale;
  const offsetY = y - sourceY * scale;

  return {
    index: {x: sourceX, y: sourceY, z: normalizedMaxZoom},
    sampleBounds: [
      offsetX / scale,
      offsetY / scale,
      (offsetX + 1) / scale,
      (offsetY + 1) / scale
    ]
  };
}

type ElevationDecoder = {rScaler: number; gScaler: number; bScaler: number; offset: number};
type TerrainLoadProps = {
  bounds: Bounds;
  elevationData: string | null;
  elevationDecoder: ElevationDecoder;
  meshMaxError: number;
  signal?: AbortSignal;
};

type MeshAndTexture = [MeshAttributes | null, TextureSource | null];
type MeshBoundingBox = [min: number[], max: number[]];
type MeshWithBoundingBox = MeshAttributes & {
  header?: {
    boundingBox?: MeshBoundingBox;
  };
};

/** All properties supported by TerrainLayer */
export type TerrainLayerProps = _TerrainLayerProps &
  TileLayerProps<MeshAndTexture> &
  CompositeLayerProps;

/** Props added by the TerrainLayer */
type _TerrainLayerProps = {
  /** Image url that encodes height data. **/
  elevationData: URLTemplate;

  /** Image url to use as texture. **/
  texture?: URLTemplate;

  /** Martini error tolerance in meters, smaller number -> more detailed mesh. **/
  meshMaxError?: number;

  /** Maximum tile zoom used for texture imagery. **/
  textureMaxZoom?: number | null;

  /** Maximum tile zoom used for elevation mesh source imagery. **/
  meshMaxZoom?: number | null;

  /**
   * Tesselator used to turn a terrain-RGB tile into a mesh. `'grid'` uses
   * a fixed-resolution grid in lng/lat — cheaper on CPU and portable across
   * MapView/GlobeView without re-tesselating on projection change.
   */
  tesselator?: 'auto' | 'grid';

  /**
   * Vertices per side for the grid tesselator. Default 65 (≈8k tris per tile).
   * Bump to 129 for higher fidelity; drop to 33 to halve vertex cost.
   */
  gridSize?: number;

  /** Bounding box of the terrain image, [minX, minY, maxX, maxY] in world coordinates. **/
  bounds?: Bounds | null;

  /** Color to use if texture is unavailable. **/
  color?: Color;

  /** Object to decode height data, from (r, g, b) to height in meters. **/
  elevationDecoder?: ElevationDecoder;

  /** Whether to render the mesh in wireframe mode. **/
  wireframe?: boolean;

  /** Material props for lighting effect. **/
  material?: Material;

  /**
   * @deprecated Use `loadOptions.terrain.workerUrl` instead
   */
  workerUrl?: string;
};

/** Render mesh surfaces from height map images. */
export default class TerrainLayer<ExtraPropsT extends {} = {}> extends CompositeLayer<
  ExtraPropsT & Required<_TerrainLayerProps & Required<TileLayerProps<MeshAndTexture>>>
> {
  static defaultProps = defaultProps;
  static layerName = 'TerrainLayer';

  state!: {
    isTiled?: boolean;
    terrain?: MeshAttributes;
    zRange?: ZRange | null;
  };

  updateState({props, oldProps}: UpdateParameters<this>): void {
    const elevationDataChanged = props.elevationData !== oldProps.elevationData;
    if (elevationDataChanged) {
      const {elevationData} = props;
      const isTiled =
        elevationData && (Array.isArray(elevationData) || isTileSetURL(elevationData));
      this.setState({isTiled});
    }

    // Reloading for single terrain mesh
    const shouldReload =
      elevationDataChanged ||
      props.meshMaxError !== oldProps.meshMaxError ||
      props.elevationDecoder !== oldProps.elevationDecoder ||
      props.bounds !== oldProps.bounds;

    if (!this.state.isTiled && shouldReload) {
      // When state.isTiled, elevationData cannot be an array
      const terrain = this.loadTerrain(props as TerrainLoadProps);
      this.setState({terrain});
    }

    // TODO - remove in v9
    // @ts-ignore
    if (props.workerUrl) {
      log.removed('workerUrl', 'loadOptions.terrain.workerUrl')();
    }
  }

  loadTerrain({
    elevationData,
    bounds,
    elevationDecoder,
    meshMaxError,
    signal
  }: TerrainLoadProps): Promise<MeshAttributes> | null {
    if (!elevationData) {
      return null;
    }
    const effectiveMeshMaxError = getEffectiveMeshMaxError(meshMaxError);
    let loadOptions = this.getLoadOptions();
    loadOptions = {
      ...loadOptions,
      terrain: {
        skirtHeight: this.state.isTiled ? effectiveMeshMaxError * 2 : 0,
        ...loadOptions?.terrain,
        bounds,
        meshMaxError: effectiveMeshMaxError,
        elevationDecoder
      }
    };
    const {fetch} = this.props;
    return fetch(elevationData, {propName: 'elevationData', layer: this, loadOptions, signal});
  }

  getTiledTerrainData(tile: TileLoadProps): Promise<MeshAndTexture> {
    const {
      elevationData,
      fetch,
      texture,
      elevationDecoder,
      meshMaxError,
      textureMaxZoom,
      meshMaxZoom,
      tesselator,
      gridSize
    } = this.props;
    const {viewport} = this.context;
    const meshTile: ReturnType<typeof getSourceTile> = viewport.isGeospatial
      ? getSourceTile(tile, meshMaxZoom)
      : {index: tile.index};
    const textureTile = getSourceTile(tile, textureMaxZoom);
    const dataUrl = getURLFromTemplate(elevationData, {...tile, index: meshTile.index});
    const textureUrl = texture && getURLFromTemplate(texture, {...tile, index: textureTile.index});

    const {signal} = tile;

    // Grid path keeps bounds in lng/lat degrees so the mesh renders via LNGLAT
    // on both MapView and GlobeView — no projectFlat bake, no invalidation on
    // projection toggle.
    if ((tesselator === 'grid' || meshTile.sampleBounds) && viewport.isGeospatial) {
      const bbox = tile.bbox as GeoBoundingBox;
      const bounds: Bounds = [bbox.west, bbox.south, bbox.east, bbox.north];
      const effectiveMeshMaxError = getEffectiveMeshMaxError(meshMaxError);
      const terrain = this.loadGridTerrain({
        elevationData: dataUrl,
        bounds,
        elevationDecoder,
        gridSize,
        sampleBounds: meshTile.sampleBounds,
        skirtHeight: effectiveMeshMaxError * 2,
        signal
      });
      const surface = textureUrl
        ? fetch(textureUrl, {propName: 'texture', layer: this, loaders: [], signal}).catch(
            _ => null
          )
        : Promise.resolve(null);
      return Promise.all([terrain, surface]);
    }

    let bottomLeft = [0, 0] as [number, number];
    let topRight = [0, 0] as [number, number];
    if (viewport.isGeospatial) {
      const bbox = tile.bbox as GeoBoundingBox;
      bottomLeft = viewport.projectFlat([bbox.west, bbox.south]);
      topRight = viewport.projectFlat([bbox.east, bbox.north]);
    } else {
      const bbox = tile.bbox as Exclude<TileBoundingBox, GeoBoundingBox>;
      bottomLeft = [bbox.left, bbox.bottom];
      topRight = [bbox.right, bbox.top];
    }
    const bounds: Bounds = [bottomLeft[0], bottomLeft[1], topRight[0], topRight[1]];
    const overlappedBounds = getOverlappedBounds(
      bounds,
      this.props.tileSize,
      Boolean(viewport.resolution && viewport.resolution > 0)
    );

    const terrain = this.loadTerrain({
      elevationData: dataUrl,
      bounds: overlappedBounds,
      elevationDecoder,
      meshMaxError,
      signal
    });
    const surface = textureUrl
      ? // If surface image fails to load, the tile should still be displayed
        fetch(textureUrl, {propName: 'texture', layer: this, loaders: [], signal}).catch(_ => null)
      : Promise.resolve(null);

    return Promise.all([terrain, surface]);
  }

  // Fetch a terrain-RGB tile as raw pixels and run the grid tesselator
  // in-process. The grid is cheap enough that worker handoff overhead
  // dominates, so the main-thread path is faster than the worker loader.
  loadGridTerrain({
    elevationData,
    bounds,
    elevationDecoder,
    gridSize,
    sampleBounds,
    skirtHeight,
    signal
  }: {
    elevationData: string | null;
    bounds: Bounds;
    elevationDecoder: ElevationDecoder;
    gridSize: number;
    sampleBounds?: [number, number, number, number];
    skirtHeight: number;
    signal?: AbortSignal;
  }): Promise<MeshAttributes | null> {
    if (!elevationData) {
      return Promise.resolve(null);
    }
    const {fetch} = this.props;
    const loadOptions = {
      ...this.getLoadOptions(),
      image: {type: 'data' as const}
    };
    return fetch(elevationData, {
      propName: 'elevationData',
      layer: this,
      loaders: [ImageLoader],
      loadOptions,
      signal
    }).then((image: {data: Uint8ClampedArray; width: number; height: number}) => {
      if (!image) return null;
      return makeGridTerrainMesh(image, {
        bounds: bounds as [number, number, number, number],
        elevationDecoder,
        sampleBounds,
        gridSize,
        skirtHeight
      }) as unknown as MeshAttributes;
    });
  }

  renderSubLayers(
    props: TileLayerProps<MeshAndTexture> & {
      id: string;
      data: MeshAndTexture;
      tile: Tile2DHeader<MeshAndTexture>;
    }
  ) {
    const SubLayerClass = this.getSubLayerClass('mesh', SimpleMeshLayer);

    const {color, wireframe, material} = this.props;
    const {data} = props;

    if (!data) {
      return null;
    }

    const [mesh, texture] = data;

    const {viewport} = this.context;
    // Bounds are baked with projectFlat. In GlobeView projectFlat is identity,
    // so tiled terrain meshes are in lng/lat degrees instead of common-space
    // web-mercator units.
    const isGlobe = Boolean(viewport.resolution && viewport.resolution > 0);
    const boundingBox = (mesh as MeshWithBoundingBox | null)?.header?.boundingBox;
    const hasLngLatBounds =
      boundingBox &&
      boundingBox.every(
        ([x, y]) =>
          x >= -MAX_LONGITUDE && x <= MAX_LONGITUDE && y >= -MAX_LATITUDE && y <= MAX_LATITUDE
      );
    const coordinateSystem =
      isGlobe && hasLngLatBounds ? COORDINATE_SYSTEM.LNGLAT : COORDINATE_SYSTEM.CARTESIAN;

    return new SubLayerClass(props, {
      data: DUMMY_DATA,
      mesh,
      texture,
      _instanced: false,
      coordinateSystem,
      getPosition: d => [0, 0, 0],
      getColor: color,
      wireframe,
      material
    });
  }

  // Update zRange of viewport
  onViewportLoad(tiles?: Tile2DHeader<MeshAndTexture>[]): void {
    if (!tiles) {
      return;
    }

    const {zRange} = this.state;
    const ranges = tiles
      .map(tile => tile.content)
      .filter(Boolean)
      .map(arr => {
        // @ts-ignore
        const bounds = arr[0].header.boundingBox;
        return bounds.map(bound => bound[2]);
      });
    if (ranges.length === 0) {
      return;
    }
    const minZ = Math.min(...ranges.map(x => x[0]));
    const maxZ = Math.max(...ranges.map(x => x[1]));

    if (!zRange || minZ < zRange[0] || maxZ > zRange[1]) {
      this.setState({zRange: [minZ, maxZ]});
    }
  }

  renderLayers(): Layer | null | LayersList {
    const {
      color,
      material,
      elevationData,
      texture,
      wireframe,
      meshMaxError,
      elevationDecoder,
      textureMaxZoom,
      meshMaxZoom,
      tesselator,
      gridSize,
      tileSize,
      maxZoom,
      minZoom,
      extent,
      maxRequests,
      onTileLoad,
      onTileUnload,
      onTileError,
      maxCacheSize,
      maxCacheByteSize,
      refinementStrategy
    } = this.props;

    if (this.state.isTiled) {
      const tileMaxZoom = getTerrainTileMaxZoom({maxZoom, textureMaxZoom, meshMaxZoom});
      // Legacy (Martini/Delatin) meshes are baked into the active viewport's
      // projectFlat frame, so toggling projections must rebuild every tile.
      // Grid meshes are lng/lat/elev and stay valid across projections, so
      // projectionMode is omitted from the update trigger there.
      const isGridPath = tesselator === 'grid';
      const projectionMode = isGridPath ? undefined : this.context.viewport.projectionMode;
      return new TileLayer<MeshAndTexture>(
        this.getSubLayerProps({
          id: 'tiles'
        }),
        {
          getTileData: this.getTiledTerrainData.bind(this),
          renderSubLayers: this.renderSubLayers.bind(this),
          updateTriggers: {
            getTileData: {
              elevationData: urlTemplateToUpdateTrigger(elevationData),
              texture: urlTemplateToUpdateTrigger(texture),
              meshMaxError,
              textureMaxZoom,
              meshMaxZoom,
              elevationDecoder: elevationDecoderToUpdateTrigger(elevationDecoder),
              tesselator,
              gridSize,
              projectionMode
            }
          },
          onViewportLoad: this.onViewportLoad.bind(this),
          zRange: this.state.zRange || null,
          tileSize,
          maxZoom: tileMaxZoom,
          minZoom,
          extent,
          maxRequests,
          onTileLoad,
          onTileUnload,
          onTileError,
          maxCacheSize,
          maxCacheByteSize,
          refinementStrategy
        }
      );
    }

    if (!elevationData) {
      return null;
    }

    const SubLayerClass = this.getSubLayerClass('mesh', SimpleMeshLayer);
    return new SubLayerClass(
      this.getSubLayerProps({
        id: 'mesh'
      }),
      {
        data: DUMMY_DATA,
        mesh: this.state.terrain,
        texture,
        _instanced: false,
        getPosition: d => [0, 0, 0],
        getColor: color,
        material,
        wireframe
      }
    );
  }
}

const isTileSetURL = (url: string): boolean =>
  url.includes('{x}') && (url.includes('{y}') || url.includes('{-y}'));
