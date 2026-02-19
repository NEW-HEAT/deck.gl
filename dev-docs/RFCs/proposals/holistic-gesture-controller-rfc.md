# RFC: Holistic Gesture Controller

- **Authors**: deck.gl Contributors
- **Date**: February 2026
- **Status**: Proposal

## Summary

This RFC proposes a comprehensive, holistic gesture interaction system for deck.gl that provides a unified and clearly defined contract for human-to-view-state interactions across all Controller types. The goal is to create a showcase implementation that demonstrates best practices for gesture handling and establishes standardized patterns for future controller development.

## Motivation

Currently, deck.gl's controller architecture supports various input methods (mouse, touch, keyboard, wheel) across different controller types (MapController, OrbitController, FirstPersonController, etc.). However, there are several gaps and opportunities for improvement:

1. **Inconsistent Gesture Support**: Different controllers support different combinations of gestures, making it difficult for users to predict behavior
2. **Limited Multi-Modal Interaction**: Combining input methods (e.g., keyboard + mouse, touch + stylus) is not well-defined
3. **Unclear API Contract**: The relationship between gestures, interaction states, and view state transformations lacks formal specification
4. **Accessibility Gaps**: Limited support for alternative input methods and assistive technologies
5. **Complex Gesture Patterns**: Advanced gestures (two-finger rotation, three-finger pan, etc.) are not consistently implemented

This RFC proposes a holistic approach that treats all human input as a unified gesture system with clear contracts, enabling:
- Predictable and consistent interactions across all controllers
- Better accessibility and multi-modal input support
- Easier customization and extension of gesture handling
- Clear documentation of the gesture-to-view-state transformation pipeline

## References

- [View State RFC](../proposals/view-state-rfc.md) - Common view state representation
- [Per-View Controllers RFC](../v6.0/per-view-controllers-rfc.md) - Multiple controller support
- [Auto Controls RFC](../v5.3/auto-controls-rfc.md) - Stateful controller management
- [mjolnir.js](https://github.com/visgl/mjolnir.js) - Current event handling library

## Design Goals

1. **Unified Gesture Model**: Define a comprehensive gesture taxonomy that covers all input modalities
2. **Clear API Contract**: Establish explicit contracts between gesture recognizers, controllers, and view states
3. **Composability**: Enable combining multiple gestures and input methods seamlessly
4. **Extensibility**: Make it easy to add custom gestures or modify existing ones
5. **Accessibility**: Support alternative input methods and assistive technologies
6. **Performance**: Ensure smooth 60fps interactions even with complex gesture recognition
7. **Backward Compatibility**: Maintain compatibility with existing controller implementations

## Proposed Architecture

### Gesture Taxonomy

Define a comprehensive gesture taxonomy that categorizes all user interactions:

#### Primary Gestures
- **Pan**: Linear translation (mouse drag, touch drag, arrow keys)
- **Rotate**: Angular rotation around an axis (two-finger twist, Ctrl+drag, Q/E keys)
- **Zoom**: Scale transformation (pinch, wheel, +/- keys, double-click)
- **Pitch**: Tilt/elevation angle change (touch drag up/down with modifier, drag with right button)
- **Bearing**: Compass rotation (touch twist, Shift+drag)

#### Composite Gestures
- **Pan + Zoom**: Simultaneous translation and scaling
- **Rotate + Pan**: Combined rotation and translation
- **Orbit**: Rotation around a target point
- **Fly**: Combined movement in 3D space

#### Auxiliary Interactions
- **Click/Tap**: Point selection
- **Double-Click/Double-Tap**: Quick zoom
- **Long-Press**: Context menu or mode switch
- **Hover**: Cursor positioning for reference point
- **Keyboard Shortcuts**: Direct view state manipulation

### Gesture Recognition Pipeline

```
┌─────────────────┐
│  Raw Input      │  (mouse, touch, keyboard, gamepad, etc.)
│  Events         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Event          │  (mjolnir.js or successor)
│  Normalization  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Gesture        │  (recognize patterns, compute deltas)
│  Recognition    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Gesture        │  (filter based on enabled gestures)
│  Filtering      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  View State     │  (translate gesture to view state changes)
│  Transformation │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Constraint     │  (apply bounds, limits, validation)
│  Application    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Interpolation  │  (smooth transitions, inertia)
│  & Animation    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Updated        │
│  View State     │
└─────────────────┘
```

### API Contract

#### GestureRecognizer Interface

```typescript
interface GestureRecognizer {
  /**
   * Gesture type identifier
   */
  readonly type: GestureType;
  
  /**
   * Recognizes a gesture from input events
   * @returns GestureEvent if recognized, null otherwise
   */
  recognize(event: InputEvent, state: RecognizerState): GestureEvent | null;
  
  /**
   * Priority for gesture recognition (higher = earlier)
   */
  readonly priority: number;
  
  /**
   * Can this gesture run simultaneously with another?
   */
  canCoexistWith(other: GestureType): boolean;
}

interface GestureEvent {
  type: GestureType;
  phase: 'start' | 'update' | 'end' | 'cancel';
  
  // Raw input information
  pointers: Pointer[];
  modifiers: KeyModifiers;
  
  // Gesture-specific data
  delta: GestureDelta;
  velocity: GestureVelocity;
  
  // Position information
  center: [number, number];  // Center point of gesture
  referencePoint?: [number, number];  // Reference point for transformation
}

type GestureType = 
  | 'pan' 
  | 'rotate' 
  | 'zoom' 
  | 'pinch'
  | 'pitch' 
  | 'bearing'
  | 'tap'
  | 'double-tap'
  | 'long-press'
  | 'keyboard';

interface GestureDelta {
  // Linear deltas
  x?: number;
  y?: number;
  
  // Angular deltas (radians)
  angle?: number;
  bearing?: number;
  pitch?: number;
  
  // Scale deltas
  scale?: number;
  zoom?: number;
}
```

#### HolisticController Interface

```typescript
interface HolisticControllerOptions extends ControllerOptions {
  /**
   * Gesture configuration - fine-grained control over each gesture
   */
  gestures?: {
    pan?: boolean | PanGestureOptions;
    rotate?: boolean | RotateGestureOptions;
    zoom?: boolean | ZoomGestureOptions;
    pitch?: boolean | PitchGestureOptions;
    bearing?: boolean | BearingGestureOptions;
    tap?: boolean | TapGestureOptions;
    doubleTap?: boolean | DoubleTapGestureOptions;
    longPress?: boolean | LongPressGestureOptions;
    keyboard?: boolean | KeyboardGestureOptions;
  };
  
  /**
   * Input device configuration
   */
  devices?: {
    mouse?: boolean | MouseDeviceOptions;
    touch?: boolean | TouchDeviceOptions;
    keyboard?: boolean | KeyboardDeviceOptions;
    gamepad?: boolean | GamepadDeviceOptions;
    stylus?: boolean | StylusDeviceOptions;
  };
  
  /**
   * Gesture combination rules
   */
  gestureRules?: {
    // Allow simultaneous gestures
    allowSimultaneous?: [GestureType, GestureType][];
    
    // Gesture conflicts (mutually exclusive)
    conflicts?: [GestureType, GestureType][];
    
    // Priority order for ambiguous gestures
    priority?: GestureType[];
  };
  
  /**
   * Accessibility features
   */
  accessibility?: {
    // Support for screen readers
    announceViewStateChanges?: boolean;
    
    // Larger hit areas for gestures
    increasedHitArea?: number;
    
    // Reduced motion mode
    reducedMotion?: boolean;
    
    // Alternative input methods
    alternativeInputs?: boolean;
  };
}

interface PanGestureOptions {
  enabled: boolean;
  
  // Input methods that can trigger pan
  mouse?: boolean | {
    button?: 'left' | 'right' | 'middle';
    modifier?: 'none' | 'shift' | 'ctrl' | 'alt';
  };
  touch?: boolean | {
    fingers?: number;  // Number of fingers (1 for single-finger pan)
  };
  keyboard?: boolean | {
    keys?: string[];  // Arrow keys by default
    speed?: number;
  };
  
  // Behavior
  inertia?: boolean | number;  // Momentum scrolling
  damping?: number;  // Friction coefficient
  
  // Constraints
  axis?: 'x' | 'y' | 'both';  // Lock to specific axis
  bounds?: {
    minX?: number;
    maxX?: number;
    minY?: number;
    maxY?: number;
  };
}

interface ZoomGestureOptions {
  enabled: boolean;
  
  // Input methods
  wheel?: boolean | {
    speed?: number;
    smooth?: boolean;
  };
  pinch?: boolean | {
    sensitivity?: number;
  };
  doubleTap?: boolean | {
    zoomLevel?: number;  // Zoom factor per double-tap
  };
  keyboard?: boolean | {
    keys?: string[];  // +/- keys by default
    speed?: number;
  };
  
  // Behavior
  animate?: boolean;
  duration?: number;
  
  // Constraints
  min?: number;
  max?: number;
  center?: 'cursor' | 'viewport' | 'fixed';  // Zoom center point
}
```

#### ViewState Transformation Contract

```typescript
interface ViewStateTransformer<T extends ViewState> {
  /**
   * Transform a gesture into view state changes
   */
  transformGesture(
    gesture: GestureEvent,
    currentViewState: T,
    options: TransformOptions
  ): Partial<T>;
  
  /**
   * Compute the interpolated view state during transitions
   */
  interpolate(
    startViewState: T,
    endViewState: T,
    t: number  // Interpolation parameter [0, 1]
  ): T;
  
  /**
   * Apply constraints to ensure valid view state
   */
  applyConstraints(viewState: Partial<T>, options: ConstraintOptions): T;
  
  /**
   * Compute velocity for inertia/momentum
   */
  computeVelocity(
    gesture: GestureEvent,
    history: GestureEvent[]
  ): GestureVelocity;
}

interface TransformOptions {
  // Reference point for transformations (e.g., cursor position for zoom)
  referencePoint?: [number, number];
  
  // Viewport information for coordinate transformations
  viewport: {
    width: number;
    height: number;
    center: [number, number];
  };
  
  // Sensitivity multipliers
  sensitivity?: {
    pan?: number;
    rotate?: number;
    zoom?: number;
  };
}
```

### Implementation Strategy

#### Phase 1: Core Gesture System

1. **Gesture Recognition Layer**
   - Implement unified gesture recognizers for all input types
   - Create composable recognizers that can work together
   - Add support for custom gesture recognizers

2. **Gesture Event Pipeline**
   - Normalize all input events to common format
   - Implement gesture filtering based on enabled options
   - Add gesture conflict resolution

3. **Basic HolisticController**
   - Implement HolisticController extending base Controller
   - Support all existing gesture types
   - Maintain backward compatibility with existing controllers

#### Phase 2: Enhanced Interactions

1. **Multi-Modal Input**
   - Simultaneous touch + mouse support
   - Stylus pressure/tilt integration
   - Gamepad analog stick support

2. **Advanced Gestures**
   - Three-finger swipe for quick navigation
   - Pinch + rotate combinations
   - Pressure-sensitive interactions (stylus, trackpad)

3. **Gesture Customization**
   - User-defined gesture mappings
   - Per-gesture configuration
   - Dynamic gesture enabling/disabling

#### Phase 3: Accessibility & Polish

1. **Accessibility Features**
   - Screen reader announcements
   - Keyboard-only navigation
   - High contrast gesture indicators
   - Reduced motion support

2. **Developer Tools**
   - Gesture debugging overlay
   - Performance monitoring
   - Gesture recording/playback

3. **Documentation & Examples**
   - Comprehensive API documentation
   - Interactive examples for each gesture
   - Migration guide from existing controllers

## Use Cases

### Use Case 1: Map Navigation (Standard Desktop)

```typescript
const deck = new Deck({
  controller: new HolisticController({
    gestures: {
      pan: {
        mouse: {button: 'left'},
        keyboard: {keys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']},
        inertia: true
      },
      rotate: {
        mouse: {button: 'right'},
        keyboard: {keys: ['q', 'e']}
      },
      zoom: {
        wheel: {smooth: true},
        keyboard: {keys: ['+', '-', '=', '_']},
        doubleTap: true,
        center: 'cursor'
      },
      bearing: {
        mouse: {button: 'left', modifier: 'shift'}
      },
      pitch: {
        mouse: {button: 'right'},
        keyboard: {keys: ['w', 's']}
      }
    }
  })
});
```

### Use Case 2: Touch-First Mobile Experience

```typescript
const deck = new Deck({
  controller: new HolisticController({
    gestures: {
      pan: {
        touch: {fingers: 1},
        inertia: 500  // Longer momentum on mobile
      },
      zoom: {
        pinch: {sensitivity: 1.2},
        doubleTap: {zoomLevel: 2},
        center: 'cursor'
      },
      rotate: {
        touch: {fingers: 2}  // Two-finger twist
      },
      bearing: {
        touch: {fingers: 2}
      }
    },
    devices: {
      // Disable mouse on mobile
      mouse: false,
      keyboard: false
    },
    accessibility: {
      increasedHitArea: 10  // Larger touch targets
    }
  })
});
```

### Use Case 3: 3D Scene Exploration (First-Person)

```typescript
const deck = new Deck({
  controller: new HolisticController({
    gestures: {
      pan: {
        // WASD for movement
        keyboard: {
          keys: ['w', 'a', 's', 'd'],
          speed: 10
        },
        // Click and drag to move
        mouse: {button: 'left'}
      },
      rotate: {
        // Mouse look
        mouse: {button: 'right'},
        // Arrow keys for looking around
        keyboard: {keys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']}
      },
      zoom: {
        // Scroll to move forward/back
        wheel: true,
        keyboard: {keys: ['r', 'f']}  // Raise/Fall
      }
    },
    gestureRules: {
      // Allow moving and looking simultaneously
      allowSimultaneous: [
        ['pan', 'rotate'],
        ['pan', 'zoom'],
        ['rotate', 'zoom']
      ]
    }
  })
});
```

### Use Case 4: Accessibility-First Design

```typescript
const deck = new Deck({
  controller: new HolisticController({
    gestures: {
      pan: {
        keyboard: {
          keys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
          speed: 5  // Slower for precise control
        }
      },
      zoom: {
        keyboard: {
          keys: ['+', '-'],
          speed: 0.1  // Fine-grained zoom
        }
      }
    },
    accessibility: {
      announceViewStateChanges: true,  // Screen reader feedback
      reducedMotion: true,  // No animations
      increasedHitArea: 20,  // Larger interaction areas
      alternativeInputs: true  // Support for switch access, etc.
    }
  })
});
```

### Use Case 5: Custom Gesture Combinations

```typescript
class ThreeFingerPanRecognizer implements GestureRecognizer {
  type: GestureType = 'pan';
  priority = 100;
  
  recognize(event: InputEvent, state: RecognizerState): GestureEvent | null {
    if (event.type === 'touchmove' && event.touches.length === 3) {
      return {
        type: 'pan',
        phase: 'update',
        pointers: event.touches,
        delta: {
          x: event.deltaX * 2,  // Faster pan with three fingers
          y: event.deltaY * 2
        },
        center: this.computeCenter(event.touches)
      };
    }
    return null;
  }
  
  canCoexistWith(other: GestureType): boolean {
    return false;  // Exclusive gesture
  }
}

const deck = new Deck({
  controller: new HolisticController({
    customRecognizers: [new ThreeFingerPanRecognizer()],
    gestures: {
      pan: {
        touch: {fingers: 1}
      }
    }
  })
});
```

## Technical Considerations

### Performance

- **Gesture Recognition**: Use efficient algorithms to minimize latency (<16ms for 60fps)
- **Event Throttling**: Throttle high-frequency events (wheel, touchmove) appropriately
- **Batch Updates**: Batch multiple gesture events into single view state update
- **Web Workers**: Consider offloading complex gesture recognition to workers

### Browser Compatibility

- **Touch Events**: Support both Touch Events and Pointer Events APIs
- **Passive Listeners**: Use passive event listeners where possible for better scroll performance
- **Feature Detection**: Gracefully degrade on older browsers
- **Vendor Prefixes**: Handle webkit/moz prefixes for older mobile browsers

### Coordinate Systems

- **Screen Coordinates**: Raw pixel coordinates from input events
- **NDC (Normalized Device Coordinates)**: [-1, 1] range for viewport-independent calculations
- **World Coordinates**: Geographic or 3D world coordinates for view state
- **Transformation Pipeline**: Clear conversion between coordinate systems

### State Management

- **Gesture State**: Track ongoing gestures (isDragging, isRotating, etc.)
- **View State History**: Maintain history for undo/redo, debugging
- **Transition State**: Handle interrupted transitions gracefully
- **Concurrent Gestures**: Manage multiple simultaneous gestures

### Testing Strategy

- **Unit Tests**: Test each gesture recognizer independently
- **Integration Tests**: Test gesture combinations and conflicts
- **Visual Tests**: Screenshot-based tests for gesture effects
- **Performance Tests**: Benchmark gesture recognition and view state updates
- **Manual Testing**: Touch device testing lab, various input devices

## Migration Path

### Backward Compatibility

The HolisticController should maintain backward compatibility with existing controller usage:

```typescript
// Old API still works
const deck = new Deck({
  controller: true,  // Uses default MapController
  scrollZoom: true,
  dragPan: true,
  dragRotate: true
});

// New API provides more control
const deck = new Deck({
  controller: new HolisticController({
    gestures: {
      pan: true,
      rotate: true,
      zoom: true
    }
  })
});
```

### Gradual Adoption

1. **Phase 1**: Introduce HolisticController alongside existing controllers
2. **Phase 2**: Add deprecation warnings to old controller options
3. **Phase 3**: Migrate all examples to HolisticController
4. **Phase 4**: (Future major version) Make HolisticController the default

### Migration Tools

- **Compatibility Layer**: Automatically convert old options to new format
- **Migration Guide**: Step-by-step guide for updating applications
- **Codemod**: Automated code transformation tool
- **Deprecation Timeline**: Clear timeline for old API removal

## Open Questions

### 1. Gesture Conflict Resolution

**Question**: How should we handle conflicting gestures that could be triggered by the same input?

**Example**: A single-finger drag could be interpreted as pan OR as the start of a two-finger pinch if a second finger is added.

**Options**:
- A) Wait briefly to disambiguate (adds latency)
- B) Use gesture priority system (may miss intended gesture)
- C) Allow both and let user configure (complex API)

**Recommendation**: Implement priority-based system (B) with configurable priorities, and add delay option (A) as advanced feature.

### 2. Custom Gesture Definition API

**Question**: What's the right API for developers to define completely custom gestures?

**Options**:
- A) Provide callback-based API (flexible but requires understanding of internals)
- B) Declarative configuration (limited but easier to use)
- C) Plugin architecture (powerful but more complex)

**Recommendation**: Start with callback-based API (A) via GestureRecognizer interface, add declarative helpers for common patterns.

### 3. Performance vs. Features Trade-off

**Question**: Should we optimize for performance or feature completeness?

**Considerations**:
- More gesture recognizers = more processing per event
- Complex gesture combinations = more state tracking
- Smooth animations = more render cycles

**Recommendation**: Implement lazy evaluation - only activate recognizers for enabled gestures. Provide performance profiling tools.

### 4. Touch Device Specific Gestures

**Question**: Should we have touch-specific gestures that don't have mouse/keyboard equivalents?

**Examples**: 
- Shake gesture
- Device orientation
- Pressure sensitivity

**Recommendation**: Yes, but make them opt-in and clearly document as touch-only.

### 5. Integration with External Gesture Libraries

**Question**: Should we integrate with established gesture libraries (Hammer.js, Interact.js, etc.)?

**Pros**: Mature implementations, less code to maintain
**Cons**: Additional dependencies, potential conflicts with deck.gl's architecture

**Recommendation**: Abstract the gesture recognition layer to allow pluggable implementations, but provide a default implementation built on mjolnir.js.

## Success Metrics

This RFC will be considered successful if:

1. **Unified API**: 90%+ of gesture configurations can be expressed through the new API
2. **Performance**: No regression in gesture response time (maintain <16ms latency)
3. **Adoption**: New controller adopted in at least 3 official examples within 6 months
4. **Accessibility**: WCAG 2.1 AA compliance for keyboard navigation
5. **Developer Satisfaction**: Positive feedback from community on ease of use and customization
6. **Code Quality**: 80%+ test coverage for gesture recognition and view state transformation

## Future Enhancements

Beyond the scope of this RFC but worth considering for future iterations:

1. **Gesture Recording & Playback**: Record user interactions for testing/debugging
2. **ML-Based Gesture Recognition**: Use machine learning to recognize complex gestures
3. **Haptic Feedback**: Provide tactile feedback for gestures (mobile, game controllers)
4. **Voice Control**: Voice commands for view state manipulation
5. **Eye Tracking**: Gaze-based navigation for accessibility
6. **AR/VR Support**: Hand tracking and 6DOF controllers
7. **Collaborative Gestures**: Multi-user simultaneous control
8. **Gesture Macros**: Record and replay gesture sequences

## Conclusion

This RFC proposes a comprehensive, holistic approach to gesture handling in deck.gl that:

- **Unifies** all input modalities under a consistent API
- **Clarifies** the contract between gestures, controllers, and view states
- **Enables** advanced interaction patterns and multi-modal input
- **Improves** accessibility for all users
- **Maintains** backward compatibility with existing applications

By implementing this RFC, deck.gl will have a best-in-class interaction system that sets the standard for geospatial and 3D visualization libraries.

## Appendices

### Appendix A: Gesture Type Definitions

```typescript
type GestureType = 
  // Primary gestures
  | 'pan'           // Linear translation
  | 'rotate'        // Angular rotation
  | 'zoom'          // Scale transformation
  | 'pitch'         // Elevation angle
  | 'bearing'       // Compass heading
  
  // Composite gestures
  | 'pinch'         // Two-finger scale gesture
  | 'twist'         // Two-finger rotation gesture
  | 'orbit'         // Rotation around point
  | 'fly'           // 3D navigation
  
  // Point gestures
  | 'tap'           // Single tap/click
  | 'double-tap'    // Double tap/click
  | 'long-press'    // Press and hold
  | 'hover'         // Cursor hover
  
  // Keyboard gestures
  | 'keyboard'      // Any keyboard input
  
  // Device-specific
  | 'gamepad'       // Gamepad input
  | 'stylus'        // Stylus-specific
  
  // Custom
  | string;         // Allow custom gesture types
```

### Appendix B: Coordinate Transformation Examples

```typescript
// Example: Transform screen coordinates to world coordinates
function screenToWorld(
  screenPos: [number, number],
  viewport: Viewport,
  viewState: MapViewState
): [number, number, number] {
  const [x, y] = screenPos;
  const ndc = viewport.screenToNDC([x, y]);
  return viewport.unproject([ndc[0], ndc[1]]);
}

// Example: Compute zoom delta from wheel event
function wheelToZoomDelta(
  wheelDelta: number,
  options: ZoomGestureOptions
): number {
  const speed = options.wheel?.speed ?? 1.0;
  const smooth = options.wheel?.smooth ?? true;
  
  let delta = wheelDelta * speed;
  
  if (smooth) {
    // Apply easing for smooth zoom
    delta = Math.sign(delta) * Math.pow(Math.abs(delta), 0.9);
  }
  
  return delta;
}

// Example: Apply inertia to pan gesture
function applyInertia(
  velocity: {x: number, y: number},
  damping: number,
  deltaTime: number
): {x: number, y: number} {
  const decay = Math.exp(-damping * deltaTime);
  return {
    x: velocity.x * decay,
    y: velocity.y * decay
  };
}
```

### Appendix C: Comparison with Other Libraries

| Feature | deck.gl (Current) | Mapbox GL JS | Google Maps | Leaflet | deck.gl (Proposed) |
|---------|-------------------|--------------|-------------|---------|-------------------|
| Multi-touch | Partial | Yes | Yes | Yes | **Yes** |
| Keyboard Nav | Basic | Limited | Limited | Limited | **Comprehensive** |
| Custom Gestures | No | Limited | No | Plugins | **Yes** |
| Gesture Composition | No | No | No | No | **Yes** |
| Accessibility | Limited | Limited | Limited | Limited | **WCAG 2.1 AA** |
| API Complexity | Medium | Medium | Low | Low | **Medium-High** |
| Documentation | Good | Excellent | Good | Excellent | **Excellent** |

### Appendix D: Related Technologies

- **mjolnir.js**: Current event handling library used by deck.gl
- **Hammer.js**: Popular touch gesture library
- **Interact.js**: Drag and drop, resize, multi-touch gestures
- **Pointer Events API**: W3C standard for unified pointer input
- **Touch Events API**: Mobile touch input handling
- **Gamepad API**: Browser API for game controller input
- **WebXR**: AR/VR hand tracking and controller input
