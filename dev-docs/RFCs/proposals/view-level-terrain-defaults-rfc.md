# RFC: View-Level Terrain Defaults

* **Author**: Chris Rich
* **Date**: May, 2026
* **Status**: **Draft**

References:
* [Terrain surface fitting RFC](https://github.com/visgl/deck.gl/issues/7195)
* [Automatically match terrain elevation in Mapbox/MapLibre](https://github.com/visgl/deck.gl/issues/7064)
* [Dynamically toggling TerrainLayer/TerrainExtension](https://github.com/visgl/deck.gl/issues/8450)
* [Multi-view TerrainExtension support](https://github.com/visgl/deck.gl/issues/9474)
* [ViewProps.parameters](https://github.com/visgl/deck.gl/pull/10262)

## Summary

This RFC proposes an opt-in terrain-aware mode that can be configured at the `View` level, with an optional `Deck`-level default for single-view applications. When enabled, compatible layers can receive `TerrainExtension` behavior by default, built-in navigation widgets can target the terrain-aware semantics of their view, and the existing per-layer `TerrainExtension` API remains available for explicit overrides.

The goal is for terrain-first applications to express the intended mental model directly:

```ts
new Deck({
  views: new MapView({
    id: 'main',
    controller: {type: TerrainController},
    terrain: true
  }),
  layers: [
    new TerrainLayer({
      id: 'terrain',
      operation: 'terrain+draw'
    }),
    new GeoJsonLayer({id: 'roads', data: roads}),
    new ScatterplotLayer({id: 'points', data: points}),
    new TextLayer({id: 'screen-labels', data: labels, terrain: false})
  ]
});
```

## Motivation

Terrain-aware deck.gl apps commonly combine a `TerrainLayer` or 3D tileset, `TerrainController`, multiple overlay layers, custom/composite layers, and widgets such as `ZoomWidget`, `ResetViewWidget`, `CompassWidget`, `GimbalWidget`, and `PopupWidget`.

Today, `TerrainController` makes navigation terrain-aware, but compatible layers still need `TerrainExtension` attached manually. In larger apps this creates boilerplate and easy-to-miss edge cases, especially when layers are generated dynamically or through composite sublayers. It also makes terrain feel like a layer implementation detail, even though terrain is often a property of the view being built.

The desired model is:

> This view is terrain-aware. Camera controls, widgets, picking, and compatible layers should respect the same terrain surface unless explicitly opted out.

## Recent View Prop Context

`ViewProps.parameters` establishes an important precedent: views can now carry rendering defaults that are merged between global `Deck` defaults and explicit layer props. Terrain defaults should follow the same shape instead of adding a separate controller-only mode.

Recommended precedence:

1. Explicit layer props and explicitly supplied layer extensions.
2. `View` terrain defaults for the target viewport.
3. Optional `Deck` terrain defaults.
4. Existing behavior.

This keeps terrain aligned with the `View` descriptor, where multi-view rendering, per-view controllers, and view-specific render parameters are already configured.

## Goals

* Make terrain awareness a first-class `View` mode.
* Automatically apply `TerrainExtension` behavior to compatible layers when a terrain-enabled view renders them.
* Preserve explicit per-layer `extensions` and `terrainDrawMode` behavior.
* Provide a simple layer opt-out.
* Let built-in navigation widgets dispatch updates through the target view semantics.
* Support multi-view applications where only some views are terrain-aware.
* Degrade gracefully if no terrain source is available.

## Non-Goals

* Do not change behavior unless the new terrain mode is enabled.
* Do not force every layer to be draped.
* Do not remove or deprecate explicit `TerrainExtension` usage.
* Do not solve all Mapbox/MapLibre native terrain alignment in this RFC, though the API should not block it.
* Do not require custom layers to be auto-detected unless they opt into terrain compatibility.

## Proposed API

### `View.terrain`

Add a `terrain` prop to common view props:

```ts
type TerrainDefaults =
  | boolean
  | {
      enabled?: boolean;
      applyToLayers?: 'compatible' | false;
      applyToWidgets?: boolean;
      defaultDrawMode?: 'auto' | 'offset' | 'drape';
    };

type CommonViewProps<ViewState> = {
  // existing props
  parameters?: Parameters;
  controller?: ControllerOptions;

  // proposed
  terrain?: TerrainDefaults;
};
```

`terrain: true` is shorthand for:

```ts
terrain: {
  enabled: true,
  applyToLayers: 'compatible',
  applyToWidgets: true,
  defaultDrawMode: 'auto'
}
```

`View.terrain` is the primary API because terrain awareness is normally tied to a viewport and controller, not the entire canvas.

Example:

```ts
import {Deck, MapView, TerrainController} from '@deck.gl/core';
import {TerrainLayer} from '@deck.gl/geo-layers';
import {GeoJsonLayer, ScatterplotLayer, TextLayer} from '@deck.gl/layers';
import {ZoomWidget, ResetViewWidget, CompassWidget} from '@deck.gl/widgets';

new Deck({
  views: new MapView({
    id: 'main',
    controller: {type: TerrainController},
    terrain: {
      enabled: true,
      applyToLayers: 'compatible',
      applyToWidgets: true,
      defaultDrawMode: 'auto'
    }
  }),

  layers: [
    new TerrainLayer({
      id: 'terrain',
      operation: 'terrain+draw'
    }),
    new GeoJsonLayer({id: 'roads', data: roads}),
    new ScatterplotLayer({id: 'points', data: points}),
    new TextLayer({id: 'screen-labels', data: labels, terrain: false})
  ],

  widgets: [
    new ZoomWidget({viewId: 'main'}),
    new ResetViewWidget({viewId: 'main'}),
    new CompassWidget({viewId: 'main'})
  ]
});
```

### Optional `Deck.terrain`

For single-view applications, `Deck.terrain` may provide a default:

```ts
new Deck({
  terrain: true,
  controller: {type: TerrainController},
  layers
});
```

If both `Deck.terrain` and `View.terrain` are supplied, the view prop overrides the deck prop for that view. This mirrors `Deck.parameters`, `View.parameters`, and `Layer.parameters`.

### Layer opt-out and overrides

Layers can opt out of view-level terrain defaults:

```ts
new TextLayer({
  id: 'screen-labels',
  data: labels,
  terrain: false
});
```

Existing explicit layer configuration remains authoritative:

```ts
new PathLayer({
  id: 'trails',
  data: trails,
  terrainDrawMode: 'drape',
  extensions: [new TerrainExtension()]
});
```

When a layer already supplies `TerrainExtension`, deck.gl must not append another instance. When a layer supplies `terrainDrawMode`, that value overrides the view's `defaultDrawMode`.

## Layer Defaulting

When a terrain-enabled view is active, deck.gl should append a singleton `TerrainExtension` internally to compatible layers that do not already include one and have not opted out.

The compatibility check should be conservative:

* Built-in layers that are known to work with `TerrainExtension` can opt in through a layer capability marker or an internal allowlist.
* Composite layers should be treated as compatible if their sublayers can inherit terrain defaults through `getSubLayerProps`.
* Custom layers should not be auto-detected by guesswork. They can opt in by explicitly adding `TerrainExtension` or, if introduced, by declaring a terrain capability marker.
* Non-geospatial, screen-space, post-processing, and terrain source layers should not receive automatic terrain fitting.

Composite layers should propagate terrain defaults to compatible sublayers unless `_subLayerProps` explicitly overrides them:

```ts
new GeoJsonLayer({
  id: 'features',
  data,
  _subLayerProps: {
    'points-text': {terrain: false}
  }
});
```

## Draw Mode Defaults

The current `TerrainExtension` automatic selection should remain the default:

* `offset` for layers with anchor positions or 2.5D/extruded behavior.
* `drape` for flat geometry that should be rendered into the terrain cover.

The view can override the default:

```ts
new MapView({
  id: 'main',
  terrain: {
    enabled: true,
    defaultDrawMode: 'drape'
  }
});
```

Layer-level `terrainDrawMode` still wins:

```ts
new ScatterplotLayer({
  id: 'summits',
  data,
  terrainDrawMode: 'offset'
});
```

## Widget and Controller Integration

Built-in widgets that mutate view state should use the target view's active controller semantics instead of duplicating flat `MapController` assumptions.

For terrain-aware views, this means:

* `ZoomWidget` should preserve the terrain-aware camera position updates expected from `TerrainController`.
* `ResetViewWidget` should reset through the same view/controller path used by interactive navigation.
* `CompassWidget` and `GimbalWidget` should respect the target view and not update unrelated views.
* Picking-oriented widgets such as `PopupWidget` and `ContextMenuWidget` should continue to use `viewId` so terrain-aware picking behavior is scoped to the active view.

This may require a small public or protected helper on `Widget`/`Deck` that applies a view-state delta through the view's controller when one exists, while retaining the current direct `_onViewStateChange` fallback for non-interactive or custom views.

## Multi-View Behavior

Multi-view support is a core requirement. A layer may render in both a terrain-aware view and a flat overview view.

Recommended behavior:

* Terrain policy is resolved per viewport from `view.props.terrain`, falling back to `deck.props.terrain`.
* Automatic extension injection may happen once at the layer level, but `TerrainEffect` should apply terrain fitting only while rendering a terrain-enabled viewport.
* A flat view should not become terrain-aware just because another view uses `terrain: true`.
* Widgets must continue to honor `viewId`.

This connects directly to the multi-view TerrainExtension work in #9474. The RFC should be considered incomplete unless the implementation can clearly answer how `TerrainEffect`, picking, and draped terrain covers are scoped by viewport id.

## Graceful Degradation

If no layer with `operation: 'terrain'` or `operation: 'terrain+draw'` is available in the active view, terrain mode should degrade to current rendering:

* Layers render in their normal coordinate space.
* Widgets still update view state.
* `TerrainController` behaves like `MapController` when it cannot pick an elevation source.
* A development warning may be useful, but repeated warnings during tile loading should be avoided.

## Implementation Sketch

1. Add `terrain` to `CommonViewProps` and optionally `DeckProps`.
2. Normalize terrain policy per view in `ViewManager` or render-time helpers.
3. Add a helper for detecting whether a layer already has `TerrainExtension`.
4. Add conservative terrain compatibility metadata for built-in layers, or start with an internal allowlist.
5. During layer update, append a shared `TerrainExtension` to eligible layers without mutating user layer instances.
6. Ensure composite layer terrain defaults pass through `getSubLayerProps` and `_subLayerProps` can opt out.
7. Gate `TerrainEffect` work by the active viewport's resolved terrain policy.
8. Update widget view-state helpers so terrain-aware views can route widget-initiated updates through controller-compatible behavior.
9. Add tests for single-view defaults, explicit overrides, layer opt-out, composite sublayers, and multi-view terrain/flat rendering.

## Alternatives Considered

### Keep terrain layer-only

The current explicit `TerrainExtension` model is precise and remains important for overrides, but it requires every app or composite layer author to remember terrain wiring repeatedly. It does not match terrain-first apps where terrain is a property of the view.

### Put terrain under controller options

`controller: {type: TerrainController}` already expresses terrain-aware navigation, but layer fitting, picking, and widget behavior are not controller-only concerns. Putting terrain defaults on the controller would hide rendering behavior inside an interaction object.

### Use only `Deck.terrain`

A deck-level prop is convenient for single-view apps, but it is ambiguous in multi-view layouts. Following the new `ViewProps.parameters` precedent makes the view the primary scope and keeps `Deck.terrain` as a shorthand default.

## Open Questions

* Should the layer opt-out prop be named `terrain`, `terrainEnabled`, or `_terrain` while the extension remains experimental?
* Should `Deck.terrain` ship in the first implementation, or should the first version require `View.terrain`?
* Should compatibility be represented as static layer metadata, an extension method, or an internal allowlist?
* Should view-level `terrain: false` only disable automatic defaults, or should it also suppress explicitly attached `TerrainExtension` in that view?
* How should custom composite layers expose terrain compatibility for generated sublayers?
* Should terrain defaults eventually cover native Mapbox/MapLibre terrain sources, or only deck.gl terrain sources identified by `operation: 'terrain'`?
