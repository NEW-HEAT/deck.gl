export type ColumnProps = {
    radius: number;
    angle: number;
    offset: [number, number];
    extruded: boolean;
    stroked: boolean;
    isStroke: boolean;
    coverage: number;
    elevationScale: number;
    edgeDistance: number;
    widthScale: number;
    widthMinPixels: number;
    widthMaxPixels: number;
    radiusUnits: number;
    widthUnits: number;
    /** Whether bevel is enabled (segments >= 2) */
    bevelEnabled: boolean;
    /** World-space bevel height in same units as radius */
    bevelSize: number;
    /** Normalized Z where bevel starts (1 - bevelHeight) */
    bevelTopZ: number;
};
export declare const columnUniforms: {
    readonly name: "column";
    readonly vs: "uniform columnUniforms {\n  float radius;\n  float angle;\n  vec2 offset;\n  bool extruded;\n  bool stroked;\n  bool isStroke;\n  float coverage;\n  float elevationScale;\n  float edgeDistance;\n  float widthScale;\n  float widthMinPixels;\n  float widthMaxPixels;\n  highp int radiusUnits;\n  highp int widthUnits;\n  bool bevelEnabled;\n  float bevelSize;\n  float bevelTopZ;\n} column;\n";
    readonly fs: "uniform columnUniforms {\n  float radius;\n  float angle;\n  vec2 offset;\n  bool extruded;\n  bool stroked;\n  bool isStroke;\n  float coverage;\n  float elevationScale;\n  float edgeDistance;\n  float widthScale;\n  float widthMinPixels;\n  float widthMaxPixels;\n  highp int radiusUnits;\n  highp int widthUnits;\n  bool bevelEnabled;\n  float bevelSize;\n  float bevelTopZ;\n} column;\n";
    readonly uniformTypes: {
        readonly radius: "f32";
        readonly angle: "f32";
        readonly offset: "vec2<f32>";
        readonly extruded: "f32";
        readonly stroked: "f32";
        readonly isStroke: "f32";
        readonly coverage: "f32";
        readonly elevationScale: "f32";
        readonly edgeDistance: "f32";
        readonly widthScale: "f32";
        readonly widthMinPixels: "f32";
        readonly widthMaxPixels: "f32";
        readonly radiusUnits: "i32";
        readonly widthUnits: "i32";
        readonly bevelEnabled: "f32";
        readonly bevelSize: "f32";
        readonly bevelTopZ: "f32";
    };
};
//# sourceMappingURL=column-layer-uniforms.d.ts.map