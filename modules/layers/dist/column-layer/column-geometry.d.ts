import { Geometry } from '@luma.gl/engine';
type ColumnGeometryProps = {
    id?: string;
    radius: number;
    height?: number;
    nradial?: number;
    vertices?: number[];
    bevelSegments?: number;
    bevelHeight?: number;
    smoothNormals?: boolean;
};
export default class ColumnGeometry extends Geometry {
    constructor(props: ColumnGeometryProps);
}
export {};
//# sourceMappingURL=column-geometry.d.ts.map