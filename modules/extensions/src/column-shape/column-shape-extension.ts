// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

/**
 * ColumnShapeExtension - Adds per-instance bevel shapes and radius scaling to ColumnLayer.
 *
 * This extension was inspired by:
 * - https://github.com/visgl/deck.gl-community/pull/470 (ExperimentalColumnLayer)
 * - https://github.com/visgl/deck.gl/pull/9933 (Original getBevel & getRadius implementation)
 *
 * Following the recommendation from Chris Gervant to implement this as an extension
 * rather than a new layer.
 */

import {LayerExtension} from '@deck.gl/core';
import {columnShapeShaders, ColumnShapeModuleProps} from './shader-module';

import type {Layer, LayerContext, DefaultProps, Accessor, UpdateParameters} from '@deck.gl/core';

/** Bevel shape type - can be a string shortcut or a custom configuration object */
export type BevelProp =
  | 'flat'
  | 'dome'
  | 'cone'
  | {
      /** Number of bevel segments: 0-1 = flat, 2 = cone, 3+ = dome */
      segs?: number;
      /** Bevel height in world units */
      height?: number;
      /** Curve factor: 0 = standard, negative = concave, positive = convex */
      bulge?: number;
    };

/** Parsed bevel parameters for shader consumption */
type BevelParams = {
  segs: number;
  height: number;
  bulge: number;
};

const defaultProps: DefaultProps<ColumnShapeExtensionProps> = {
  getBevel: {type: 'accessor', value: 'flat'},
  getRadius: {type: 'accessor', value: 1}
};

export type ColumnShapeExtensionProps<DataT = any> = {
  /**
   * Bevel shape for the top cap of each column.
   *
   * Supported values:
   * - `'flat'`: No bevel (default flat top)
   * - `'dome'`: Rounded dome with smooth normals
   * - `'cone'`: Pointed cone shape
   * - `{segs, height, bulge}`: Full control over shape parameters
   *   - `segs`: Number of bevel segments (0-1 = flat, 2 = cone, 3+ = dome)
   *   - `height`: Bevel height in world units
   *   - `bulge`: Curve factor (-1 to 1+), 0 = standard dome
   *
   * @default 'flat'
   */
  getBevel?: Accessor<DataT, BevelProp>;
  /**
   * Per-instance radius multiplier.
   * The final radius = radiusScale * getRadius(d)
   *
   * @default 1
   */
  getRadius?: Accessor<DataT, number>;
};

/** Parses a BevelProp value into shader-compatible parameters */
function parseBevelProp(bevel: BevelProp): BevelParams {
  if (typeof bevel === 'string') {
    switch (bevel) {
      case 'dome':
        return {segs: 8, height: 1, bulge: 0};
      case 'cone':
        return {segs: 2, height: 1, bulge: 0};
      case 'flat':
      default:
        return {segs: 0, height: 0, bulge: 0};
    }
  }
  // Object form with explicit parameters
  return {
    segs: bevel.segs ?? 0,
    height: bevel.height ?? 0,
    bulge: bevel.bulge ?? 0
  };
}

/**
 * ColumnShapeExtension adds per-instance bevel shapes and radius scaling to ColumnLayer.
 *
 * This allows creating tree-like visualizations where each column can have a different
 * top cap shape (flat, dome, or cone) and a different radius.
 *
 * @example
 * ```typescript
 * import {ColumnLayer} from '@deck.gl/layers';
 * import {ColumnShapeExtension} from '@deck.gl/extensions';
 *
 * new ColumnLayer({
 *   data: hierarchicalData,
 *   getPosition: d => d.position,
 *   getElevation: d => d.height,
 *   getRadius: d => d.radiusScale,
 *   getBevel: d => {
 *     if (d.isLeaf) return 'dome';
 *     if (d.isBranch) return 'cone';
 *     return 'flat';
 *   },
 *   extensions: [new ColumnShapeExtension()]
 * });
 * ```
 */
export default class ColumnShapeExtension extends LayerExtension {
  static defaultProps = defaultProps;
  static extensionName = 'ColumnShapeExtension';

  isEnabled(layer: Layer<ColumnShapeExtensionProps>): boolean {
    // Only enable for layers with instanced rendering and ColumnLayer-like behavior
    return layer.getAttributeManager() !== null;
  }

  getShaders(this: Layer<ColumnShapeExtensionProps>, extension: this): any {
    if (!extension.isEnabled(this)) {
      return null;
    }
    return {
      modules: [columnShapeShaders]
    };
  }

  initializeState(
    this: Layer<ColumnShapeExtensionProps>,
    context: LayerContext,
    extension: this
  ): void {
    if (!extension.isEnabled(this)) {
      return;
    }

    const attributeManager = this.getAttributeManager()!;

    attributeManager.addInstanced({
      instanceBevelSegs: {
        size: 1,
        accessor: 'getBevel',
        transform: (bevel: BevelProp) => parseBevelProp(bevel).segs,
        defaultValue: 0
      },
      instanceBevelHeights: {
        size: 1,
        accessor: 'getBevel',
        transform: (bevel: BevelProp) => parseBevelProp(bevel).height,
        defaultValue: 0
      },
      instanceBevelBulge: {
        size: 1,
        accessor: 'getBevel',
        transform: (bevel: BevelProp) => parseBevelProp(bevel).bulge,
        defaultValue: 0
      },
      instanceRadii: {
        size: 1,
        accessor: 'getRadius',
        defaultValue: 1
      }
    });
  }

  updateState(
    this: Layer<ColumnShapeExtensionProps>,
    params: UpdateParameters<Layer<ColumnShapeExtensionProps>>,
    extension: this
  ): void {
    if (!extension.isEnabled(this)) {
      return;
    }

    // Check if any bevel props are non-default to enable bevel rendering
    const props = this.props;
    const bevelEnabled = props.getBevel !== undefined && props.getBevel !== 'flat';

    const columnShapeProps: ColumnShapeModuleProps = {
      bevelEnabled
    };
    this.setShaderModuleProps({columnShape: columnShapeProps});
  }
}
