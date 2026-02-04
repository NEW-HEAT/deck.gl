// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

/**
 * Shader module for ColumnShapeExtension
 * Based on https://github.com/visgl/deck.gl-community/pull/470
 * and https://github.com/visgl/deck.gl/pull/9933
 *
 * Adds per-instance bevel shapes (dome, cone, flat) and radius scaling
 * to ColumnLayer for hierarchical/tree visualizations.
 */

import type {ShaderModule} from '@luma.gl/shadertools';

const uniformBlock = /* glsl */ `\
uniform columnShapeUniforms {
  bool bevelEnabled;
} columnShape;
`;

const vs = /* glsl */ `
${uniformBlock}

in float instanceBevelSegs;
in float instanceBevelHeights;
in float instanceBevelBulge;
in float instanceRadii;
`;

const fs = `
${uniformBlock}
`;

/**
 * Shader injection for modifying vertex positions and normals
 * based on bevel parameters
 */
const inject = {
  // Inject after size calculation to modify positions for bevel
  'vs:DECKGL_FILTER_SIZE': /* glsl */ `
    if (columnShape.bevelEnabled) {
      // Apply per-instance radius multiplier
      pos.xy *= instanceRadii;
    }
  `,

  // Modify position after projection for bevel shape
  'vs:DECKGL_FILTER_GL_POSITION': /* glsl */ `
    if (columnShape.bevelEnabled && column.extruded) {
      // Get bevel parameters
      float bevelSegs = instanceBevelSegs;
      float bevelHeight = instanceBevelHeights;
      float bevelBulge = instanceBevelBulge;

      // Calculate if we're on the top cap (z > 0 in local space)
      float localZ = positions.z;
      float elevation = instanceElevations * column.elevationScale;

      // Only apply bevel to top cap vertices
      if (localZ > 0.0 && bevelSegs >= 2.0) {
        float radialDist = length(positions.xy);

        // Calculate how far up we are on the cap (0 = edge, 1 = center)
        float capProgress = 1.0 - radialDist;

        if (capProgress > 0.0) {
          // Cone shape (bevelSegs == 2)
          if (bevelSegs < 3.0) {
            // For cone, bevelHeight determines the apex height above the column top.
            // bevelHeight is in the same units as elevation (typically meters).
            // The cone is capped at the column's elevation to avoid extending above.
            float coneHeight = min(bevelHeight, elevation);
            float zOffset = capProgress * coneHeight;
            geometry.position.z += zOffset;
          }
          // Dome shape (bevelSegs >= 3)
          else {
            // Spherical cap calculation.
            // bevelHeight controls the dome radius in world units (same as elevation).
            // A value of 1.0 creates a unit sphere cap; larger values create larger domes.
            float domeRadius = bevelHeight > 0.0 ? bevelHeight : 1.0;
            float u = radialDist;

            // Apply bulge factor to curve
            float bulgedU = u + bevelBulge * u * (1.0 - u);
            bulgedU = clamp(bulgedU, 0.0, 1.0);

            // Calculate dome height at this radial position
            float domeZ = sqrt(max(0.0, 1.0 - bulgedU * bulgedU)) * domeRadius;
            float maxDomeZ = min(domeRadius, elevation);

            geometry.position.z += min(domeZ, maxDomeZ) * capProgress;
          }
        }
      }
    }
  `,

  // Adjust normals for bevel shapes
  'vs:#decl': /* glsl */ `
    // Utility function to calculate adjusted normals for bevel shapes.
    // Note: radialDist division is safe because we return early if radialDist < 0.001
    vec3 columnShape_adjustNormal(vec3 normal, vec3 position, float bevelSegs, float bevelHeight, float bevelBulge) {
      if (bevelSegs < 2.0) {
        return normal; // Flat top, no adjustment
      }

      float radialDist = length(position.xy);
      if (radialDist < 0.001) {
        // At apex, normal points straight up
        return vec3(0.0, 0.0, 1.0);
      }

      vec2 radialDir = normalize(position.xy);

      // Cone normal - radialDist is guaranteed >= 0.001 here
      if (bevelSegs < 3.0) {
        float coneSlope = bevelHeight / radialDist;
        vec3 coneNormal = normalize(vec3(radialDir, coneSlope));
        return coneNormal;
      }

      // Dome normal - points outward from center of sphere
      float u = radialDist;
      float bulgedU = u + bevelBulge * u * (1.0 - u);
      bulgedU = clamp(bulgedU, 0.0, 1.0);

      float domeZ = sqrt(max(0.0, 1.0 - bulgedU * bulgedU));
      vec3 domeNormal = normalize(vec3(radialDir * bulgedU, domeZ));
      return domeNormal;
    }
  `
};

export type ColumnShapeModuleProps = {
  bevelEnabled?: boolean;
};

type ColumnShapeModuleUniforms = {
  bevelEnabled?: boolean;
};

function getUniforms(opts?: ColumnShapeModuleProps | {}): ColumnShapeModuleUniforms {
  if (!opts) {
    return {};
  }
  const uniforms: ColumnShapeModuleUniforms = {};
  if ('bevelEnabled' in opts) {
    uniforms.bevelEnabled = opts.bevelEnabled;
  }
  return uniforms;
}

export const columnShapeShaders = {
  name: 'columnShape',
  vs,
  fs,
  inject,
  getUniforms,
  uniformTypes: {
    bevelEnabled: 'i32'
  }
} as const satisfies ShaderModule<ColumnShapeModuleProps, ColumnShapeModuleUniforms>;
