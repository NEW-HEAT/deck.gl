import { Layer, LayerProps, LayerDataSource, UpdateParameters, Unit, AccessorFunction, Position, Accessor, Color, Material, DefaultProps } from '@deck.gl/core';
import { Model } from '@luma.gl/engine';
import ColumnGeometry from "./column-geometry.js";
/**
 * Bevel configuration for per-instance getBevel accessor.
 * - 'flat': No bevel (flat top)
 * - 'dome': Dome with height = radius
 * - 'cone': Cone with height = radius
 * - number: Custom dome height in world units
 * - {segs, height, bulge?}: Full control
 *   - segs: number of bevel segments (0-1=flat, 2=cone, 3+=dome)
 *   - height: bevel height in world units (must be > 0, unbounded)
 *   - bulge: curve factor (-1 to 1+), 0=standard dome, negative=concave, positive=convex bulge
 *
 * Note: height must be positive. Values <= 0 result in flat cap.
 */
export type BevelProp = 'flat' | 'dome' | 'cone' | number | {
    segs: number;
    height: number;
    bulge?: number;
};
/** All properties supported by ColumnLayer. */
export type ColumnLayerProps<DataT = unknown> = _ColumnLayerProps<DataT> & LayerProps;
/** Properties added by ColumnLayer. */
type _ColumnLayerProps<DataT> = {
    data: LayerDataSource<DataT>;
    /**
     * The number of sides to render the disk as.
     * @default 20
     */
    diskResolution?: number;
    /**
     * Number of segments for the bevel cap. Higher = smoother dome.
     * 0 = flat cap, 2 = cone, 3+ = smooth dome.
     * @default diskResolution / 4
     */
    bevelSegments?: number | null;
    /**
     * Disk size in units specified by `radiusUnits`.
     * @default 1000
     */
    radius?: number;
    /**
     * Disk rotation, counter-clockwise in degrees.
     * @default 0
     */
    angle?: number;
    /**
     * Replace the default geometry (regular polygon that fits inside the unit circle) with a custom one.
     * @default null
     */
    vertices?: Position[] | null;
    /**
     * Disk offset from the position, relative to the radius.
     * @default [0,0]
     */
    offset?: [number, number];
    /**
     * Radius multiplier, between 0 - 1
     * @default 1
     */
    coverage?: number;
    /**
     * Column elevation multiplier.
     * @default 1
     */
    elevationScale?: number;
    /**
     * Whether to draw a filled column (solid fill).
     * @default true
     */
    filled?: boolean;
    /**
     * Whether to draw an outline around the disks.
     * @default false
     */
    stroked?: boolean;
    /**
     * Whether to extrude the columns. If set to `false`, all columns will be rendered as flat polygons.
     * @default true
     */
    extruded?: boolean;
    /**
     * Whether to generate a line wireframe of the column.
     * @default false
     */
    wireframe?: boolean;
    /**
     * If `true`, the vertical surfaces of the columns use [flat shading](https://en.wikipedia.org/wiki/Shading#Flat_vs._smooth_shading).
     * @default false
     */
    flatShading?: boolean;
    /**
     * The units of the radius.
     * @default 'meters'
     */
    radiusUnits?: Unit;
    /**
     * The units of the line width.
     * @default 'meters'
     */
    lineWidthUnits?: Unit;
    /**
     * The line width multiplier that multiplied to all outlines.
     * @default 1
     */
    lineWidthScale?: number;
    /**
     * The minimum outline width in pixels.
     * @default 0
     */
    lineWidthMinPixels?: number;
    /**
     * The maximum outline width in pixels.
     * @default Number.MAX_SAFE_INTEGER
     */
    lineWidthMaxPixels?: number;
    /**
     * Material settings for lighting effect. Applies if `extruded: true`.
     *
     * @default true
     * @see https://deck.gl/docs/developer-guide/using-lighting
     */
    material?: Material;
    /**
     * Method called to retrieve the position of each column.
     * @default object => object.position
     */
    getPosition?: AccessorFunction<DataT, Position>;
    /**
     * @deprecated Use getFilledColor and getLineColor instead
     */
    getColor?: Accessor<DataT, Color>;
    /**
     * Fill collor value or accessor.
     * @default [0, 0, 0, 255]
     */
    getFillColor?: Accessor<DataT, Color>;
    /**
     * Line color value or accessor.
     *
     * @default [0, 0, 0, 255]
     */
    getLineColor?: Accessor<DataT, Color>;
    /**
     * The elevation of each cell in meters.
     * @default 1000
     */
    getElevation?: Accessor<DataT, number>;
    /**
     * The width of the outline of the column, in units specified by `lineWidthUnits`.
     *
     * @default 1
     */
    getLineWidth?: Accessor<DataT, number>;
    /**
     * The radius of each column, in units specified by `radiusUnits`.
     * This is multiplied by the `radius` prop to get the final radius.
     *
     * @default 1
     */
    getRadius?: Accessor<DataT, number>;
    /**
     * The bevel configuration for each column.
     * - 'flat': No bevel (flat top) - default
     * - 'dome': Rounded dome with smooth normals (height = radius)
     * - 'cone': Pointed cone (height = radius)
     * - {segs, height, bulge?}: Full control over bevel shape
     *
     * @default 'flat'
     */
    getBevel?: Accessor<DataT, BevelProp>;
};
/** Render extruded cylinders (tessellated regular polygons) at given coordinates. */
export default class ColumnLayer<DataT = any, ExtraPropsT extends {} = {}> extends Layer<ExtraPropsT & Required<_ColumnLayerProps<DataT>>> {
    static layerName: string;
    static defaultProps: DefaultProps<ColumnLayerProps<unknown>>;
    state: {
        fillModel?: Model;
        wireframeModel?: Model;
        models?: Model[];
        fillVertexCount: number;
        edgeDistance: number;
    };
    getShaders(): any;
    /**
     * DeckGL calls initializeState when GL context is available
     * Essentially a deferred constructor
     */
    initializeState(): void;
    updateState(params: UpdateParameters<this>): void;
    getGeometry(diskResolution: number, vertices: number[] | undefined, hasThickness: boolean): ColumnGeometry;
    protected _getModels(): {
        fillModel: Model;
        wireframeModel: Model;
        models: Model[];
    };
    protected _updateGeometry({ diskResolution, vertices, extruded, stroked }: {
        diskResolution: any;
        vertices: any;
        extruded: any;
        stroked: any;
    }): void;
    draw({ uniforms }: {
        uniforms: any;
    }): void;
}
export {};
//# sourceMappingURL=column-layer.d.ts.map