// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors
import { log, createIterable } from '@deck.gl/core';
import IconLayer from "../../icon-layer/icon-layer.js";
import { sdfUniforms } from "./sdf-uniforms.js";
import fs from "./multi-icon-layer-fragment.glsl.js";
// TODO expose as layer properties
const DEFAULT_BUFFER = 192.0 / 256;
const EMPTY_ARRAY = [];
const defaultProps = {
    getIconOffsets: { type: 'accessor', value: (x) => x.offsets },
    alphaCutoff: 0.001,
    smoothing: 0.1,
    outlineWidth: 0,
    outlineColor: { type: 'color', value: [0, 0, 0, 255] }
};
class MultiIconLayer extends IconLayer {
    getShaders() {
        const shaders = super.getShaders();
        return { ...shaders, modules: [...shaders.modules, sdfUniforms], fs };
    }
    initializeState() {
        super.initializeState();
        const attributeManager = this.getAttributeManager();
        const instanceIconDefs = attributeManager.attributes.instanceIconDefs;
        // eslint-disable-next-line @typescript-eslint/unbound-method
        instanceIconDefs.settings.update = this.calculateInstanceIconDefs;
        attributeManager.addInstanced({
            instancePickingColors: {
                type: 'uint8',
                size: 4,
                accessor: (object, { index, target: value }) => this.encodePickingColor(index, value)
            }
        });
    }
    updateState(params) {
        super.updateState(params);
        const { props, oldProps, changeFlags } = params;
        let { outlineColor } = props;
        if (changeFlags.updateTriggersChanged &&
            (changeFlags.updateTriggersChanged.getIcon ||
                changeFlags.updateTriggersChanged.getIconOffsets)) {
            this.getAttributeManager().invalidate('instanceIconDefs');
        }
        if (outlineColor !== oldProps.outlineColor) {
            outlineColor = outlineColor.map(x => x / 255);
            outlineColor[3] = Number.isFinite(outlineColor[3]) ? outlineColor[3] : 1;
            this.setState({
                outlineColor
            });
        }
        if (!props.sdf && props.outlineWidth) {
            log.warn(`${this.id}: fontSettings.sdf is required to render outline`)();
        }
    }
    draw(params) {
        const { sdf, smoothing, outlineWidth } = this.props;
        const { outlineColor } = this.state;
        const outlineBuffer = outlineWidth
            ? Math.max(smoothing, DEFAULT_BUFFER * (1 - outlineWidth))
            : -1;
        const model = this.state.model;
        const sdfProps = {
            buffer: DEFAULT_BUFFER,
            outlineBuffer,
            gamma: smoothing,
            enabled: Boolean(sdf),
            outlineColor
        };
        model.shaderInputs.setProps({ sdf: sdfProps });
        super.draw(params);
        // draw text without outline on top to ensure a thick outline won't occlude other characters
        if (sdf && outlineWidth) {
            const { iconManager } = this.state;
            const iconsTexture = iconManager.getTexture();
            if (iconsTexture) {
                model.shaderInputs.setProps({ sdf: { ...sdfProps, outlineBuffer: DEFAULT_BUFFER } });
                model.draw(this.context.renderPass);
            }
        }
    }
    calculateInstanceIconDefs(attribute, { startRow, endRow }) {
        const { data, getIcon, getIconOffsets } = this.props;
        let i = attribute.getVertexOffset(startRow);
        const output = attribute.value;
        const { iterable, objectInfo } = createIterable(data, startRow, endRow);
        for (const object of iterable) {
            objectInfo.index++;
            const text = getIcon(object, objectInfo); // forwarded getText
            const offsets = getIconOffsets(object, objectInfo); // text length x 2
            if (text) {
                let j = 0;
                for (const char of Array.from(text)) {
                    const def = super.getInstanceIconDef(char);
                    def[0] = offsets[j * 2];
                    def[1] = offsets[j * 2 + 1];
                    def[6] = 1; // mask
                    output.set(def, i);
                    i += attribute.size;
                    j++;
                }
            }
        }
    }
}
MultiIconLayer.defaultProps = defaultProps;
MultiIconLayer.layerName = 'MultiIconLayer';
export default MultiIconLayer;
//# sourceMappingURL=multi-icon-layer.js.map