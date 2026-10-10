# Available Tools

**132 tools total** — semantic `photoshop_*` surface, including 15 public `photoshop_guard_*` tools for durable native-MCP orchestration. The legacy `photoshop_recipe_*` layer is removed.

The Guard surface includes `photoshop_guard_art_director`, which manages the high-level
Planner directive independently from Painter mutations. `action=review` records global
assessment, priorities, bounded Painter tasks and an adaptive `review_after_microplans`
horizon; `action=interrupt` returns early from Painter without a Photoshop mutation when
the directive cannot be followed safely; `action=complete` closes a fully satisfied task
queue. `photoshop_guard_status` / `photoshop_guard_resume` expose the active directive,
current task, completed micro-plan count and review/interrupt reason.

Reference for all atomic `photoshop_*` MCP tools exposed by this server (parameters, examples, and return shapes).

← Back to [README](../README.md)

### Embedded Guard

For Chat On Steroids, use the dedicated `dist/cos-plugin.js` entry point. It enables `PHOTOSHOP_GUARD_MODE=required`: read-only Photoshop tools remain directly callable, while raw mutating tools return `guard_required` and must be named inside a `photoshop_guard_cycle_auto` operation. This keeps the raw schemas visible for planning without allowing them to bypass the durable Guard.

The native Guard surface is:

- `photoshop_guard_capabilities`
- `photoshop_guard_status`
- `photoshop_guard_resume`
- `photoshop_guard_cycle_auto`
- `photoshop_guard_lint_next_pass`
- `photoshop_guard_review_image`
- `photoshop_guard_job_poll`
- `photoshop_guard_reconcile`
- `photoshop_guard_set_priorities`
- `photoshop_guard_art_director`
- `photoshop_guard_set_art_run`
- `photoshop_guard_recover_lock`
- `photoshop_guard_keep_logical_layer`
- `photoshop_guard_brush_pack_ingest`
- `photoshop_guard_brush_pack_profile`

`photoshop_guard_cycle_auto` is the normal mutation entry point. It journals intent before dispatch, closes technical report/receipt/verdict state behind the compact facade, captures required previews for visual mutations, preserves uncertainty/replay protection, and starts a durable in-process job when predicted/observed work is long-running. Complete fitting review bundles arrive as exact MCP images inline with a durable delivery receipt; request only the missing roles through `photoshop_guard_review_image` when the bounded inline budget cannot hold the complete bundle.

### Connection & Info

#### `photoshop_ping`
Return structured connection and preferred-route readiness for Photoshop.

The payload distinguishes general Photoshop connectivity from readiness of the preferred UXP
route. It includes `connected`, `ready`, `degraded`, selected `transport`, Photoshop version,
actual/expected bridge revision and revision match, active document, document count, and readiness
cache hit/age/TTL metadata. A connected legacy route with a missing or stale UXP companion is
reported as degraded rather than as fully ready.

```javascript
// Example: Check Photoshop connectivity and preferred UXP readiness
photoshop_ping()
```

#### `photoshop_get_version`
Get Photoshop version information.

```javascript
// Example: Get version details
photoshop_get_version()
```

### Document Management

#### `photoshop_create_document`
Create a new Photoshop document through the UXP companion. Guarded calls use the Guard operation id
as the stable UXP command identity, so a lost response can be reconciled from the durable command
receipt without creating a second document. Ready/revision mismatch fails before dispatch; there is
no post-dispatch ExtendScript fallback.

**Parameters:**
- `width` (number, required): Document width in pixels
- `height` (number, required): Document height in pixels
- `resolution` (number, optional): DPI resolution (default: 72)
- `colorMode` (string, optional): Color mode - RGB, CMYK, or Grayscale (default: RGB)

```javascript
// Example: Create a 1920x1080 RGB document
photoshop_create_document({
  width: 1920,
  height: 1080,
  resolution: 72,
  colorMode: "RGB"
})
```

**Returns:** the real created `document.id` plus name, dimensions, resolution, color mode, UXP
transport metadata and the stable command/receipt identity. Document creation itself is a
non-visual bootstrap step and does not require a visual verdict.

#### `photoshop_get_document_info`
Get information about the active document.

```javascript
// Example: Get current document details
photoshop_get_document_info()
```

#### `photoshop_list_documents`
List all open documents with id, name, dimensions, resolution, and active-tab flag (read-only).

**Parameters:** none

```javascript
// Example: Discover document_id values before switching tabs
photoshop_list_documents()
```

#### `photoshop_set_active_document`
Switch the active document tab. Provide exactly one identifier.

**UI effect:** this is explicit UI-activating navigation and may foreground Photoshop in the accepted
UXP runtime. It is therefore excluded from no-focus acceptance traces. Do not use it merely to satisfy
a document target; ordinary document-bound operations should use pinned `document_id` and fail closed
instead of switching tabs implicitly.

**Parameters:**
- `document_id` (number, optional): Unique id from `photoshop_list_documents` (preferred)
- `index` (number, optional): Zero-based tab order (leftmost is 0)
- `document_name` (string, optional): Document name (ambiguous if multiple tabs share the name)

```javascript
// Example: Activate by unique id
photoshop_set_active_document({ document_id: 42 })

// Example: Activate leftmost tab
photoshop_set_active_document({ index: 0 })
```

Document-bound mutating tools (and most document-scoped reads) accept optional `document_id`. Pass the positive integer id from `photoshop_get_state` / `photoshop_list_documents` so a Photoshop UI tab switch cannot retarget the operation. Production UXP handlers validate the pinned document before semantic dispatch; document-bound mutations do not silently switch tabs to satisfy a stale target. Unknown ids fail closed with `document_not_found`; malformed/non-positive ids fail with `invalid_arguments`. Successful pinned calls add `document_target: { id, pinned: true }` to their result metadata. Omitted = current active document.

Global/pure tools that do not operate on an existing document (for example brush-setting helpers, `photoshop_create_document`, `photoshop_open_image`, and pure landmark transforms/comparisons) intentionally do not expose the injected `document_id` parameter.

#### `photoshop_save_document`
Save the active document.

**Parameters:**
- `path` (string, required): Full path where to save
- `format` (string, optional): PSD, JPEG, or PNG (default: PSD)
- `quality` (number, optional): JPEG quality 1-12 (default: 8)

```javascript
// Example: Save as JPEG
photoshop_save_document({
  path: "/Users/username/Desktop/output.jpg",
  format: "JPEG",
  quality: 10
})
```

#### `photoshop_close_document`
Close the active document.

**Parameters:**
- `save` (boolean, optional): Save before closing (default: false)

```javascript
// Example: Close without saving
photoshop_close_document({ save: false })
```

### Layer Operations

#### `photoshop_create_layer`
Create a new layer.

**Parameters:**
- `name` (string, optional): Layer name

```javascript
// Example: Create a named layer
photoshop_create_layer({ name: "Background" })
```

#### `photoshop_delete_layer`
Delete one exact layer. Pass `layer_id` to discard a logical rollback unit by stable id;
the tool restores an unrelated previously-active layer when possible. Omitting `layer_id`
retains the legacy active-layer behavior.

```javascript
// Example: Delete current layer
photoshop_delete_layer()
```

#### `photoshop_merge_layer_down`
Merge one exact source layer into one exact immediately-below sibling:

```text
photoshop_merge_layer_down({ layer_id: 77, target_layer_id: 55 })
```

The tool fails closed when the ids are identical, missing, not siblings, or not adjacent.
Use it only after the source logical hypothesis is accepted and no longer requires
independent rollback.

#### `photoshop_create_text_layer`
Create a text layer.

**Parameters:**
- `text` (string, required): Text content
- `x` (number, optional): X position in pixels (default: 100)
- `y` (number, optional): Y position in pixels (default: 100)
- `fontSize` (number, optional): Font size in points (default: 24)
- `fontName` (string, optional): Font display or PostScript name (see `photoshop_list_fonts`)

```javascript
// Example: Create a text layer with Arial
photoshop_create_text_layer({
  text: "Hello World",
  x: 200,
  y: 150,
  fontSize: 48,
  fontName: "Arial"
})
```

#### `photoshop_fill_layer`
Fill the active layer with a solid color.

**Parameters:**
- `red` (number, required): Red component (0-255)
- `green` (number, required): Green component (0-255)
- `blue` (number, required): Blue component (0-255)

```javascript
// Example: Fill with blue
photoshop_fill_layer({
  red: 0,
  green: 100,
  blue: 255
})
```

#### `photoshop_get_layers`
Get list of all layers in the active document.

```javascript
// Example: List all layers
photoshop_get_layers()
```

#### `photoshop_set_layer_opacity`
Set the opacity of the active layer.

**Parameters:**
- `opacity` (number, required): Opacity value (0-100)

```javascript
// Example: Set opacity to 75%
photoshop_set_layer_opacity({ opacity: 75 })
```

#### `photoshop_set_layer_blend_mode`
Set the blend mode of the active layer.

**Parameters:**
- `blendMode` (string, required): Photoshop UI blend-mode name (NORMAL, MULTIPLY, SCREEN, OVERLAY, COLOR, …)

```javascript
// Example: Set blend mode to multiply
photoshop_set_layer_blend_mode({ blendMode: "MULTIPLY" })
```

Available blend modes: NORMAL, DISSOLVE, DARKEN, MULTIPLY, COLORBURN, LINEARBURN, DARKERCOLOR, LIGHTEN, SCREEN, COLORDODGE, LINEARDODGE, LIGHTERCOLOR, OVERLAY, SOFTLIGHT, HARDLIGHT, VIVIDLIGHT, LINEARLIGHT, PINLIGHT, HARDMIX, DIFFERENCE, EXCLUSION, SUBTRACT, DIVIDE, HUE, SATURATION, COLOR, LUMINOSITY

`COLOR` is the UI name for Color blend (colorize). The UXP implementation normalizes the public blend-mode names to the corresponding Photoshop descriptors; `DARKERCOLOR` / `LIGHTERCOLOR` use Action Manager descriptors where the DOM enum is insufficient.

#### `photoshop_set_layer_visibility`
Show or hide the active layer.

**Parameters:**
- `visible` (boolean, required): Visibility state

```javascript
// Example: Hide layer
photoshop_set_layer_visibility({ visible: false })
```

#### `photoshop_set_layer_locked`
Lock or unlock the active layer.

**Parameters:**
- `locked` (boolean, required): Lock state

```javascript
// Example: Lock layer
photoshop_set_layer_locked({ locked: true })
```

#### `photoshop_rename_layer`
Rename the active layer.

**Parameters:**
- `name` (string, required): New layer name

```javascript
// Example: Rename layer
photoshop_rename_layer({ name: "Hero Image" })
```

#### `photoshop_duplicate_layer`
Duplicate the active layer.

**Parameters:**
- `newName` (string, optional): Name for duplicated layer

```javascript
// Example: Duplicate layer with new name
photoshop_duplicate_layer({ newName: "Background Copy" })
```

#### `photoshop_merge_visible_layers`
Merge all visible layers into one.

```javascript
// Example: Merge visible layers
photoshop_merge_visible_layers()
```

#### `photoshop_flatten_image`
Flatten all layers into a single background layer.

```javascript
// Example: Flatten image
photoshop_flatten_image()
```

#### `photoshop_rasterize_layer`
Rasterize the active layer (convert text/smart object to normal layer).

```javascript
// Example: Rasterize layer
photoshop_rasterize_layer()
```

### Layer Ordering

#### `photoshop_move_layer_to_position`
Move the active layer relative to another layer.

**Parameters:**
- `targetLayerName` (string, required): Name of the reference layer
- `position` (string, required): ABOVE, BELOW, TOP, or BOTTOM

```javascript
// Example: Move layer above "Background"
photoshop_move_layer_to_position({
  targetLayerName: "Background",
  position: "ABOVE"
})
```

#### `photoshop_move_layer_to_top`
Move the active layer to the top of the layer stack.

```javascript
// Example: Move to top
photoshop_move_layer_to_top()
```

#### `photoshop_move_layer_to_bottom`
Move the active layer to the bottom of the layer stack.

```javascript
// Example: Move to bottom
photoshop_move_layer_to_bottom()
```

#### `photoshop_move_layer_up`
Move the active layer up one position.

```javascript
// Example: Move up
photoshop_move_layer_up()
```

#### `photoshop_move_layer_down`
Move the active layer down one position.

```javascript
// Example: Move down
photoshop_move_layer_down()
```

### Layer Transformations

#### `photoshop_fit_layer_to_document`
Scale the active layer to fit the document canvas while maintaining aspect ratio.

**Parameters:**
- `fillDocument` (boolean, optional): If true, fills entire canvas (may crop). If false, fits within canvas (may have margins). Default: false

```javascript
// Example: Fit layer within canvas
photoshop_fit_layer_to_document({ fillDocument: false })

// Example: Fill entire canvas (cropping if needed)
photoshop_fit_layer_to_document({ fillDocument: true })
```

#### `photoshop_scale_layer`
Scale the active layer by a percentage.

**Parameters:**
- `scalePercent` (number, required): Scale percentage (e.g., 50 for 50%, 200 for 200%)
- `centerAnchor` (boolean, optional): Scale from center (true) or top-left (false). Default: true

```javascript
// Example: Scale to 150%
photoshop_scale_layer({
  scalePercent: 150,
  centerAnchor: true
})
```

#### `photoshop_move_layer`
Move the active layer by specified offset.

**Parameters:**
- `deltaX` (number, required): Horizontal offset in pixels
- `deltaY` (number, required): Vertical offset in pixels

```javascript
// Example: Move layer 100px right and 50px down
photoshop_move_layer({
  deltaX: 100,
  deltaY: 50
})
```

#### `photoshop_rotate_layer`
Rotate the active layer.

**Parameters:**
- `degrees` (number, required): Rotation angle in degrees (positive = clockwise)

```javascript
// Example: Rotate 45 degrees clockwise
photoshop_rotate_layer({ degrees: 45 })
```

### Filters

#### `photoshop_apply_gaussian_blur`
Apply Gaussian Blur filter to the active layer.

**Parameters:**
- `radius` (number, required): Blur radius in pixels (0.1-250)

```javascript
// Example: Apply 10px blur
photoshop_apply_gaussian_blur({ radius: 10 })
```

#### `photoshop_apply_sharpen`
Apply Unsharp Mask (sharpen) filter.

**Parameters:**
- `amount` (number, required): Sharpening amount in percent (1-500)
- `radius` (number, required): Radius in pixels (0.1-250)
- `threshold` (number, optional): Threshold levels (0-255, default: 0)

```javascript
// Example: Sharpen image
photoshop_apply_sharpen({
  amount: 100,
  radius: 1.5,
  threshold: 0
})
```

#### `photoshop_apply_noise`
Apply Add Noise filter.

**Parameters:**
- `amount` (number, required): Noise amount in percent (0.1-400)
- `distribution` (string, optional): UNIFORM or GAUSSIAN (default: UNIFORM)
- `monochromatic` (boolean, optional): Monochromatic noise (default: false)

```javascript
// Example: Add noise
photoshop_apply_noise({
  amount: 10,
  distribution: "GAUSSIAN",
  monochromatic: false
})
```

#### `photoshop_apply_motion_blur`
Apply Motion Blur filter.

**Parameters:**
- `angle` (number, required): Blur angle in degrees (-360 to 360)
- `radius` (number, required): Blur distance in pixels (1-999)

```javascript
// Example: Apply motion blur
photoshop_apply_motion_blur({
  angle: 45,
  radius: 20
})
```

#### `photoshop_apply_high_pass`
Apply High Pass filter to the active raster layer (edge/detail extraction).

**Parameters:**
- `radius` (number, required): Edge retention radius in pixels (0.1-250)

```javascript
// Example: Apply 5px high pass for sharpening workflow
photoshop_apply_high_pass({ radius: 5 })
```

**Returns:** JSON `{ ok, summary, details: { filter, radius, context } }`. Fails on text, Smart Object, or Background layers — rasterize first.

#### `photoshop_apply_smart_blur`
Apply Smart Blur filter (edge-preserving blur) to the active raster layer.

**Parameters:**
- `radius` (number, required): Blur radius (0.1-100)
- `threshold` (number, required): Blur threshold (0.1-100)
- `mode` (string, optional): NORMAL, EDGEONLY, or OVERLAYEDGE (default: NORMAL)
- `quality` (string, optional): LOW, MEDIUM, or HIGH (default: MEDIUM)

```javascript
// Example: Subtle edge-preserving blur
photoshop_apply_smart_blur({
  radius: 10,
  threshold: 25,
  mode: "NORMAL",
  quality: "MEDIUM"
})
```

**Returns:** JSON `{ ok, summary, details: { filter, radius, threshold, mode, quality, context } }`.

### Color Adjustments

#### `photoshop_adjust_brightness_contrast`
Adjust brightness and contrast.

**Parameters:**
- `brightness` (number, required): Brightness adjustment (-100 to 100)
- `contrast` (number, required): Contrast adjustment (-100 to 100)

```javascript
// Example: Increase brightness and contrast
photoshop_adjust_brightness_contrast({
  brightness: 20,
  contrast: 15
})
```

#### `photoshop_adjust_hue_saturation`
Adjust hue, saturation, and lightness.

**Parameters:**
- `hue` (number, required): Hue shift (-180 to 180)
- `saturation` (number, required): Saturation adjustment (-100 to 100)
- `lightness` (number, required): Lightness adjustment (-100 to 100)

```javascript
// Example: Adjust colors
photoshop_adjust_hue_saturation({
  hue: 30,
  saturation: 20,
  lightness: 0
})
```

#### `photoshop_auto_levels`
Apply auto levels adjustment.

```javascript
// Example: Auto levels
photoshop_auto_levels()
```

#### `photoshop_auto_contrast`
Apply auto contrast adjustment.

```javascript
// Example: Auto contrast
photoshop_auto_contrast()
```

#### `photoshop_adjust_curves`
Create a Curves adjustment layer on the active document.

**Parameters:**
- `preset` (string, optional): `auto_tone` (S-curve) or `neutral` (identity curve); default `auto_tone`

```javascript
// Example: Auto-tone S-curve
photoshop_adjust_curves({ preset: 'auto_tone' })
```

#### `photoshop_desaturate`
Desaturate the layer (convert to grayscale).

```javascript
// Example: Desaturate
photoshop_desaturate()
```

#### `photoshop_invert`
Invert colors of the layer.

```javascript
// Example: Invert colors
photoshop_invert()
```

### Text Formatting

#### `photoshop_list_fonts`
List installed fonts available to Photoshop. First call may be slow (`app.fonts` can exceed 1000 entries).

**Parameters:**
- `query` (string, optional): Substring filter (matches name, postScriptName, or family)
- `limit` (number, optional): Maximum fonts to return (default: 200)

**Returns:** `{ fonts: [{ name, postScriptName, family, style }], total, truncated }`

Use `postScriptName` when setting fonts manually via `execute_script`; `photoshop_set_text_font` and `photoshop_create_text_layer` resolve display names automatically.

```javascript
// Example: Find Arial variants
photoshop_list_fonts({ query: "Arial", limit: 20 })
```

#### `photoshop_set_text_font`
Set font family and size for active text layer. Accepts display name (e.g. `"Arial"`) or PostScript name (e.g. `"ArialMT"`).

**Parameters:**
- `fontName` (string, required): Font display or PostScript name (use `photoshop_list_fonts` to discover)
- `fontSize` (number, optional): Font size in points

```javascript
// Example: Change font
photoshop_set_text_font({
  fontName: "Helvetica",
  fontSize: 48
})
```

#### `photoshop_set_text_color`
Set color for active text layer.

**Parameters:**
- `red` (number, required): Red component (0-255)
- `green` (number, required): Green component (0-255)
- `blue` (number, required): Blue component (0-255)

```javascript
// Example: Set text to blue
photoshop_set_text_color({
  red: 0,
  green: 100,
  blue: 255
})
```

#### `photoshop_set_text_alignment`
Set text alignment.

**Parameters:**
- `alignment` (string, required): LEFT, CENTER, RIGHT, LEFTJUSTIFIED, CENTERJUSTIFIED, RIGHTJUSTIFIED, FULLYJUSTIFIED

```javascript
// Example: Center align text
photoshop_set_text_alignment({ alignment: "CENTER" })
```

#### `photoshop_update_text_content`
Update text content of active text layer.

**Parameters:**
- `text` (string, required): New text content

```javascript
// Example: Update text
photoshop_update_text_content({ text: "New Text" })
```

### Selections & Masks

#### `photoshop_get_selection_bounds`
Read the active pixel selection bounds in document pixels (read-only). Does not create or modify selections.

**Returns:** JSON `{ ok, summary, details: { has_selection, bounds?, context } }` where `bounds` is `{ left, top, right, bottom, width, height }` in pixels when `has_selection` is true.

```javascript
// Example: Verify selection before creating a mask
photoshop_get_selection_bounds()
```

#### `photoshop_select_rectangle`
Create a rectangular selection.

**Parameters:**
- `left`, `top`, `right`, `bottom` (number, required): Selection bounds in pixels

```javascript
// Example: Select area
photoshop_select_rectangle({
  left: 100,
  top: 100,
  right: 500,
  bottom: 400
})
```

#### `photoshop_select_ellipse`
Create an elliptical pixel selection from a bounding box (anti-aliased).

**Parameters:**
- `left`, `top`, `right`, `bottom` (number, required): Bounding box in pixels (`right` > `left`, `bottom` > `top`)

**Returns:** JSON `{ ok, summary, details: { shape, bounds?, context } }`

```javascript
// Example: Oval selection for vignette
photoshop_select_ellipse({
  left: 50,
  top: 50,
  right: 200,
  bottom: 200
})
```

#### `photoshop_expand_selection`
Expand the active pixel selection outward by pixels.

**Parameters:**
- `pixels` (number, required): Amount to expand (minimum 1)

**Returns:** JSON `{ ok, summary, details: { pixels, bounds?, context } }`

```javascript
// Example: Grow a tight subject selection
photoshop_expand_selection({ pixels: 5 })
```

#### `photoshop_contract_selection`
Shrink the active pixel selection inward by pixels.

**Parameters:**
- `pixels` (number, required): Amount to contract (minimum 1)

**Returns:** JSON `{ ok, summary, details: { pixels, bounds?, context } }`

```javascript
// Example: Tighten a loose selection
photoshop_contract_selection({ pixels: 3 })
```

#### `photoshop_feather_selection`
Feather (soften) the edges of the active pixel selection.

**Parameters:**
- `pixels` (number, required): Feather radius in pixels (minimum 1)

**Returns:** JSON `{ ok, summary, details: { pixels, bounds?, context } }`

```javascript
// Example: Soften edges before fill
photoshop_feather_selection({ pixels: 2 })
```

#### `photoshop_save_selection`
Save the active pixel selection to a new alpha channel.

**Parameters:**
- `channel_name` (string, optional): Name for the new channel (auto-generated if omitted)

**Returns:** JSON `{ ok, summary, details: { channel_name, context } }`

```javascript
// Example: Preserve selection for later
photoshop_save_selection({ channel_name: 'MCP_Test_Sel' })
```

#### `photoshop_select_all`
Select the entire document.

```javascript
// Example: Select all
photoshop_select_all()
```

#### `photoshop_deselect`
Clear all selections.

```javascript
// Example: Deselect
photoshop_deselect()
```

#### `photoshop_invert_selection`
Invert the current selection.

```javascript
// Example: Invert selection
photoshop_invert_selection()
```

#### `photoshop_create_layer_mask`
Create a layer mask from the current selection.

```javascript
// Example: Create mask
photoshop_create_layer_mask()
```

#### `photoshop_delete_layer_mask`
Delete the layer mask from active layer.

```javascript
// Example: Delete mask
photoshop_delete_layer_mask()
```

#### `photoshop_apply_layer_mask`
Apply (merge) the layer mask to the layer.

```javascript
// Example: Apply mask
photoshop_apply_layer_mask()
```

#### `photoshop_select_subject`
Run Select Subject on the active layer (pixel selection only, no mask). Requires Photoshop 23+.

**Parameters:**
- `sample_all_layers` (boolean, optional): Sample all layers for autoCutout fallback; default `false`

```javascript
// Example: Select the main subject
photoshop_select_subject()
```

#### `photoshop_content_aware_fill`
Fill the current pixel selection using Content-Aware Fill. Requires an active selection.

```javascript
// Example: Remove selected distraction
photoshop_content_aware_fill()
```

#### `photoshop_apply_gradient_mask`
Apply a linear black-to-white gradient on the active layer mask (fade/blend).

**Parameters:**
- `direction` (string, optional): Fade direction — `bottom_to_top`, `top_to_bottom`, `left_to_right`, `right_to_left`; default `bottom_to_top`
- `start_pct` (number, optional): Gradient start along fade axis (0–100); default `0`
- `end_pct` (number, optional): Gradient end along fade axis (0–100); default `100`
- `angle_deg` (number, optional): Override gradient angle in degrees

```javascript
// Example: Fade subject into background from bottom
photoshop_apply_gradient_mask({
  direction: 'bottom_to_top',
  start_pct: 0,
  end_pct: 100
})
```

#### `photoshop_create_clipping_mask`
Create a clipping mask on the active layer (or a named layer). The target layer must sit directly above the base layer it clips into.

**Parameters:**
- `layer_name` (string, optional): Exact layer name (recursive search). Default: active layer.

```javascript
// Example: Clip the active layer to the one below
photoshop_create_clipping_mask()

// Example: Clip a named layer
photoshop_create_clipping_mask({ layer_name: 'Texture' })
```

#### `photoshop_release_clipping_mask`
Release (remove) the clipping mask from the active layer (or a named layer).

**Parameters:**
- `layer_name` (string, optional): Exact layer name (recursive search). Default: active layer.

```javascript
// Example: Unclip the active layer
photoshop_release_clipping_mask()
```

### History & Undo/Redo

#### `photoshop_undo`
Undo the last operation(s) - equivalent to Ctrl/Cmd+Z.

**Parameters:**
- `steps` (number, optional): Number of steps to undo (default: 1)

```javascript
// Example: Undo last operation
photoshop_undo()

// Example: Undo last 3 operations
photoshop_undo({ steps: 3 })
```

#### `photoshop_redo`
Redo previously undone operation(s) - equivalent to Ctrl/Cmd+Shift+Z.

**Parameters:**
- `steps` (number, optional): Number of steps to redo (default: 1)

```javascript
// Example: Redo last undone operation
photoshop_redo()

// Example: Redo last 2 undone operations
photoshop_redo({ steps: 2 })
```

#### `photoshop_get_history`
Get the history states of the active document.

```javascript
// Example: View history
photoshop_get_history()
```

### Image Manipulation

#### `photoshop_resize_image`
Resize the active image.

**Parameters:**
- `width` (number, required): New width in pixels
- `height` (number, required): New height in pixels

```javascript
// Example: Resize to Instagram post size
photoshop_resize_image({
  width: 1080,
  height: 1080
})
```

#### `photoshop_crop_document`
Crop the document to specified bounds.

**Parameters:**
- `left` (number, required): Left edge in pixels
- `top` (number, required): Top edge in pixels
- `right` (number, required): Right edge in pixels
- `bottom` (number, required): Bottom edge in pixels

```javascript
// Example: Crop document
photoshop_crop_document({
  left: 100,
  top: 100,
  right: 1820,
  bottom: 980
})
```

#### `photoshop_place_image`
Place an image file as a layer in the active document.

**Parameters:**
- `filePath` (string, required): Full path to the image file
- `x` (number, optional): Absolute canvas X of the placed layer **top-left**, in pixels (default: 0 = document left edge)
- `y` (number, optional): Absolute canvas Y of the placed layer **top-left**, in pixels (default: 0 = document top edge)

`x`/`y` are **not** an offset from Photoshop's default centered Place. After Place, the server translates the layer so `layer.bounds` top-left matches `(x, y)`.

```javascript
// Example: Place so the layer's top-left sits at (100, 200)
photoshop_place_image({
  filePath: "/Users/username/Pictures/photo.jpg",
  x: 100,
  y: 200
})
```

#### `photoshop_open_image`
Open an image file as a new document through the UXP companion. It uses the same stable durable
bootstrap receipt/recovery protocol as `photoshop_create_document`; once Photoshop has claimed the
open command, the operation is never blindly replayed after a lost response.

**Parameters:**
- `filePath` (string, required): Full path to the image file

```javascript
// Example: Open an image
photoshop_open_image({
  filePath: "/Users/username/Pictures/photo.jpg"
})
```

**Returns:** the opened document id/name/dimensions plus UXP command receipt metadata. Arbitrary
absolute filesystem paths rely on the companion's configured `localFileSystem: "fullAccess"`;
no persisted UXP session token is introduced by this tool.

### Native Sky Replacement

#### `photoshop_sky_replacement`
Native Sky Replacement. **Parameters:** `sky_image_path` (optional)

### Neural Filters (UXP bridge)

Requires `uxp-plugin/` — see [development.md](development.md).

#### `photoshop_neural_filter`
**Parameters:** `filter` (skin_smoothing|harmonize|depth_blur|super_zoom|colorize), `smoothness`, `blur`

### Layer Styles

#### `photoshop_apply_layer_style`
Apply a layer effect (Action Manager `layerEffects`) to the active layer.

**Parameters:**
- `style` (string, required): `drop_shadow` | `outer_glow` | `stroke` | `bevel_emboss`
- `red`, `green`, `blue` (number, optional): Effect color (default 0/0/0)
- `opacity` (number, optional): 0-100 (default 60)
- `size` (number, optional): Blur/size in px — stroke width for stroke (default 10)
- `distance` (number, optional): Offset in px, drop shadow only (default 8)
- `angle` (number, optional): Light angle in degrees (default 120). Drop shadow uses this local angle (`Use Global Light` is off).

```javascript
// Example: soft drop shadow on the active layer
photoshop_apply_layer_style({ style: "drop_shadow", opacity: 55, size: 14, distance: 10 })
```

### Color Grading

#### `photoshop_apply_lut`
Color Lookup (3D LUT) adjustment layer — cinematic grades in one step.

**Parameters:**
- `lut` (string, required): Built-in LUT name (e.g. `"Crisp_Warm.3dl"`, `"Kodak 5218 Fuji 3510.3dl"`, `"Moonlight.3dl"`) or absolute path to a `.cube`/`.3dl`/`.look` file

```javascript
photoshop_apply_lut({ lut: "Crisp_Warm.3dl" })
```

#### `photoshop_adjust_vibrance`
Vibrance adjustment layer. **Parameters:** `vibrance` (-100..100, default 40), `saturation` (-100..100, default 0)

#### `photoshop_adjust_exposure`
Exposure adjustment layer. **Parameters:** `exposure` (stops, default 0.5), `offset` (default 0), `gamma` (default 1)

#### `photoshop_apply_photo_filter`
Photo Filter adjustment layer (warming/cooling/tint). **Parameters:** `red`, `green`, `blue` (default 236/138/0 ≈ warming 85), `density` (0-100, default 25), `preserve_luminosity` (default true)

#### `photoshop_apply_gradient_map`
Gradient Map adjustment layer (black→white). **Parameters:** `reverse` (boolean, default false)

### Smart Objects

#### `photoshop_convert_to_smart_object`
Convert the active or named layer to an embedded Smart Object (`newPlacedLayer`). Background layers are rejected.

**Parameters:**
- `layer_name` (string, optional): exact layer name (recursive search)

```javascript
photoshop_convert_to_smart_object({ layer_name: "Logo" })
```

#### `photoshop_replace_smart_object_contents`
Replace embedded Smart Object pixels from a file (`placedLayerReplaceContents`). Preserves transforms and Smart Filters on the layer.

**Parameters:**
- `file_path` (string, required): absolute path to replacement image
- `layer_name` (string, optional): Smart Object layer name

```javascript
photoshop_replace_smart_object_contents({
  layer_name: "Screen",
  file_path: "/Users/me/designs/hero.png"
})
```

#### `photoshop_edit_smart_object_contents`
Open Smart Object embedded contents for editing (`placedLayerEditContents`). **Active document becomes the embedded .psb** until you save and close it.

**Parameters:**
- `layer_name` (string, optional): Smart Object layer name

**Returns:** `parent_document`, `embedded_document`, `layer_name`

```javascript
photoshop_edit_smart_object_contents({ layer_name: "Product" })
// ... edit embedded doc, then save/close to return to parent
```

#### `photoshop_create_smart_object_via_copy`
Create an independent Smart Object duplicate (`placedLayerMakeCopy`) — unlinked from the original embedded data.

**Parameters:**
- `layer_name` (string, optional): source Smart Object layer name

```javascript
photoshop_create_smart_object_via_copy({ layer_name: "Logo" })
```

### Image Stacking

#### `photoshop_image_stack`
Load 2+ images into one document, convert to a smart object, apply a stack mode — classic tourist removal / noise reduction without generative AI.

**Parameters:**
- `files` (string[], required): 2+ absolute image paths
- `mode` (string, optional): `mean` | `median` | `maximum` | `minimum` | `summation` | `stddev` (default `median`)

```javascript
// Example: remove tourists from 3 aligned shots
photoshop_image_stack({
  files: ["/shots/a.jpg", "/shots/b.jpg", "/shots/c.jpg"],
  mode: "median"
})
```

### Digital Painting

These tools form the Digital Painting Edition surface. See
[`digital-painting.md`](digital-painting.md) and
[`digital-painting-agent-skill.md`](digital-painting-agent-skill.md) for the
painting workflow and visual-control rules.

#### `photoshop_list_brush_presets`
List installed Photoshop brush presets with optional case-insensitive filtering
and a result limit.

#### `photoshop_select_brush_preset`
Select an installed brush preset by exact name and return the resulting brush
settings.

#### `photoshop_get_brush_settings`
Read current Brush Tool settings, including size, hardness, opacity, flow,
spacing, angle, roundness, flip state, pressure overrides, airbrush and
smoothing where available.

#### `photoshop_set_brush`
Change any supported subset of Brush Tool settings while preserving the rest of
the active Photoshop brush descriptor.

#### `photoshop_set_foreground_color`
Set the Photoshop foreground RGB color used by painting operations.

#### `photoshop_sample_color`
Sample the visible composite color at document-space coordinates without changing
the source document's Color Sampler markers.

**Parameters:**
- `x` / `y` (number, required): document-space pixel coordinate
- `radius` (integer 0–100, optional, default `0`): `0` = exact point sample; `>0` = Photoshop Average over the clipped square neighborhood
- `document_id` (number, optional): pin sampling to a specific open document

The implementation samples from a temporary merged duplicate. Average mode crops
that duplicate to the requested neighborhood, applies Photoshop's Average filter,
samples the result, then closes the duplicate without saving. Returns floating RGB,
rounded 8-bit RGB, HEX, sample mode, bounds, point, and source-document metadata.

```javascript
photoshop_sample_color({ document_id: 42, x: 640, y: 865 })
photoshop_sample_color({ document_id: 42, x: 640, y: 865, radius: 6 })
```

#### `photoshop_paint_strokes`
Paint one or many raster Brush/Pencil/Eraser/Smudge strokes on the active layer.
Supports straight/polyline and Bezier paths, closed paths,
`simulatePressure`, per-stroke RGB/size/opacity/flow overrides, one-point brush
dabs/stamps, automatic batching, and interpolated dynamics on open strokes.

**Batching:**
- `batch_mode: "AUTO"` (default) estimates the cost of rendered strokes and proactively splits expensive heterogeneous passes into short Photoshop scripts. Results include `batch_count`, `history_steps`, and `auto_chunked`.
- `batch_mode: "SINGLE_HISTORY"` requests one Photoshop history step; sufficiently expensive mixed work can still exceed the host/UXP command budget, so `AUTO` is preferred for large heterogeneous passes.

**Dynamics:** each open stroke may include a `dynamics` object with optional
`size`, `opacity`, and/or `flow` ranges written as `[start, end]`, optional
`steps` (2–64), and `easing` (`LINEAR`, `EASE_IN`, `EASE_OUT`,
`EASE_IN_OUT`). When `steps` is omitted, the tool chooses an automatic 12–40
segment count from profile magnitude plus stroke length/local brush size. Dynamic Beziers are
sampled by path length before rendering so the progression follows the visible
curve rather than raw control-point spacing.

Dynamic rendering is segmented, not native continuous tablet pressure. A strong
taper with a hard round brush can show slight segment texture; higher step
counts reduce it. Dynamics is intentionally rejected for closed strokes.

#### `photoshop_paint_dabs`
Paint up to 5000 independent Brush dabs in one MCP call. Only adjacent dabs with
identical color/size/opacity/flow are collapsed into ordered style runs; the tool
never reorders non-adjacent compatible marks. Runs are internally chunked into short
Photoshop scripts for timeout resilience. Optional `layer_id` pins execution to a stable
raster layer and restores the previously active layer afterward.

#### `photoshop_paint_regions`
Fill one or more ordered closed Bezier regions directly into raster layers. This is
the broad-mass/block-in primitive: use it for silhouettes, large value/color families
and early recognition features that would otherwise require many overlapping dabs or
thick strokes. Coordinates and Bezier handles are canvas pixels regardless of document
DPI. Each region may target a stable `layer_id`; input array order is overlap/paint
order. Optional `clip_bounds` is enforced against every anchor and handle. A region may
contain one ADD contour plus later SUBTRACT contours for holes/cutouts.

#### `photoshop_get_painting_method_capabilities`
Return the executable painting-method palette derived from tools actually registered in
the current runtime. Entries report `available`, `conditional`, or `unavailable`, plus
the primary tool, preparation tools, execution hints, limitations and fallbacks. This is
the authoritative place to distinguish a verified path from a Photoshop feature that has
no exposed execution primitive.

#### `photoshop_select_painting_method`
Read-only method router implementing:

```text
visual_intent → impact_class → method → registered runtime tool → fallback
```

It supports explicit `avoid_method_ids` and returns the selected method plus executable
fallbacks and rejected/unavailable candidates. Use it when several causal mechanisms can
address the same visual problem instead of defaulting to a round/soft brush.

The selector also accepts optional `edge_class` (`hard|firm|soft|lost|broken`) and
`preferred_method_id`. When supplied it returns `edge_selection`, compiled independently
against the same live capability map. An unavailable preferred method is reported in
`rejected` and the next compatible available edge method is selected explicitly.

#### `photoshop_analyze_value_structure`
Read-only grayscale/value evidence for Art Director review. It captures the pinned
document through the existing preview pipeline, converts the JPEG to grayscale in Node,
and returns the full grayscale image, a low-frequency downsampled grayscale thumbnail,
plus descriptive luminance summaries (`p10/p50/p90`, dark/midtone/light proportions,
center/border means). The low-frequency thumbnail suppresses small texture/noise so
major-form modelling can be judged independently of surface activity. It does **not** modify the PSD and
does **not** declare artistic PASS automatically. The caller must inspect the grayscale
image and record a machine-readable Art Director `value_check`.

#### `photoshop_execute_visual_microplan`
Execute one **atomic visual bundle** as a single MCP round-trip:

```text
0..N preparation/read steps
→ optional before photoshop_get_preview
→ 1..4 contiguous compatible visual mutations
→ mandatory final photoshop_get_preview
→ STOP for visual verdict
```

The tool is intentionally a single atomic visual bundle rather than a multi-pass planner. It cannot
queue multiple semantic passes. All bundled mutations must share one `intent`, one
semantic `region`/optional `region_bounds`, one `method_class`, one plan-level `risk`,
one `expected_visual_delta` and one `verification_envelope`. Step metadata cannot change
those boundaries, and a step cannot declare higher risk than the enclosing plan. Allowed visual mutations are currently
`photoshop_paint_strokes`, `photoshop_paint_dabs`, `photoshop_paint_regions`, `photoshop_fill_layer`, and
`photoshop_undo`. Preparation may select/read brush state, sample/measure, inspect
layers/state/history, select/create a layer, and set brush/foreground state.

For those mutations, `method_class` is executable rather than descriptive: Pencil-only
strokes are `line`, Smudge-only strokes are `smudge`, Eraser-only strokes are `erase`,
closed region painting is `region`, normal Brush/dab work is `paint`, fills are `fill`, and
Undo is `rollback`. `preset-brush` requires an explicit preceding preset selection and
normal Brush strokes. Mixed mechanisms fail closed and must be split into separate semantic
transactions.

`document_id` is required and is propagated into document-bound internal steps.
When `stage=RECOGNITION_BLOCK_IN`, the plan must use `scale=global`. Optional legacy
`recognition_features` annotations have no execution quota; exact-image review judges recognition.
Optional `style_recognition_features` records the
large-scale style cues that should already be visible in that first readable pass.
Step argument values may reference an earlier normalized JSON result with
`$steps.<stepId>.<dot.path>`. `photoshop_select_brush_preset` already returns a fresh
post-selection effective-settings readback, so an immediate duplicate
`photoshop_get_brush_settings` is unnecessary unless brush state may be stale/changed.

`protected_layer_ids` provides executable protection for features isolated on stable
layers. When present, `photoshop_paint_strokes`, `photoshop_paint_dabs` and
`photoshop_fill_layer` must pin `layer_id`, while every `photoshop_paint_regions` entry
must pin its own `layer_id`. Unknown targets and protected targets fail closed before
mutation dispatch. `replace_protected_layer_ids` is the explicit exception for an
intentional `REPLACE`/`ERASE` of a protected layer. Semantic `protected_regions` remains
descriptive rather than an arbitrary pixel mask.

Optional `logical_layer` metadata makes the rollback unit explicit. `create-new` and
`temporary-hypothesis` require exactly one create-layer step plus one or more concrete
separation reasons; all visual mutations must target that new layer through its stable-id
placeholder. `continue-logical-layer` and `adjust` must reuse the declared existing
`layer_id` and may not create another layer. `keep`, `discard` and `merge` are explicit
lifecycle decisions and are intentionally not hidden inside a paint micro-plan.

The final preview is returned in the same MCP result. Its SHA-256 opens a server
barrier: the next VisualMicroPlan is rejected until `previous_preview` supplies that
SHA plus `observed_change`, `target_resolved`, `regressions`, `uncertainty`, `verdict`
and `disposition`. The optional before preview is evidence only and never releases
the barrier.
Mutation errors are never blindly retried; the tool still attempts the mandatory
preview because an earlier operation in the same transaction may already have changed
the canvas. Remaining mutations after the first failure are not dispatched.

### Measurement & Guides

These tools support proportion checks, reference-image analysis, alignment, and
other geometry-heavy painting/design workflows. They do **not** perform face or
object landmark detection: the caller supplies the semantic points to measure.

#### `photoshop_measure_points`
Measure named document-space points and return pixel plus normalized geometry.

**Parameters:**
- `points` (array, required): `{ name, x, y }` points in document pixels
- `measurements` (array, optional): `{ name?, from, to }` distance requests between named points
- `ratios` (array, optional): `{ name?, numerator, denominator }` ratios between named measurements
- `document_id` (number, optional): pin the measurement to a specific open document

**Returns:** named points with `x_norm`/`y_norm`; each requested measurement with
`dx`, `dy`, Euclidean `distance`, `distance_over_width`, and
`distance_over_height`; plus requested ratios. `landmark_detection` is always
`false` to make the caller-supplied landmark contract explicit.

```javascript
photoshop_measure_points({
  document_id: 42,
  points: [
    { name: "left_eye", x: 640, y: 865 },
    { name: "right_eye", x: 1000, y: 825 },
    { name: "mouth", x: 835, y: 1315 }
  ],
  measurements: [
    { name: "eye_spacing", from: "left_eye", to: "right_eye" },
    { name: "eye_to_mouth", from: "left_eye", to: "mouth" }
  ]
})
```

#### `photoshop_add_guides`
Add horizontal/vertical Photoshop guides at exact pixel positions.

**Parameters:**
- `guides` (array, required): `{ orientation: "HORIZONTAL" | "VERTICAL", position }`
- `document_id` (number, optional): target document

Returns each added guide with pixel and normalized position plus the total guide
count.

#### `photoshop_list_guides`
List all guides in the target document. Returns current list-order `index`,
orientation, pixel position, and normalized position.

#### `photoshop_clear_guides`
Remove guides from the target document.

**Parameters:**
- `indices` (number[], optional): zero-based indices from `photoshop_list_guides`; omit to remove all guides
- `document_id` (number, optional): target document

#### `photoshop_transform_landmarks`
Map a caller-supplied named landmark set from one semantic frame into another.
This is a pure geometry helper and does not inspect Photoshop pixels or detect
semantic/anatomical landmarks.

**Parameters:**
- `points` (array, required): `{ name, x, y }` source points
- `source_frame` (object, required): `{ left, top, right, bottom }`
- `target_frame` (object, required): `{ left, top, right, bottom }`

Each point is converted to local `u/v` coordinates inside `source_frame` and
reconstructed inside `target_frame`. The result includes both the full
`transformed_points` records and a compact `{ name, x, y }` `points` array that
can be passed directly to measurement/comparison tools.

#### `photoshop_compare_landmarks`
Compare two caller-supplied named landmark sets after normalizing each set to
its own semantic frame.

**Parameters:**
- `reference_points` (array, required): reference `{ name, x, y }` points
- `reference_frame` (object, required): reference `{ left, top, right, bottom }`
- `candidate_points` (array, required): current/target `{ name, x, y }` points
- `candidate_frame` (object, required): candidate `{ left, top, right, bottom }`

Returns same-name point comparisons with normalized `du`, `dv`, and Euclidean
error plus `mean_error`, `rmse`, `max_error`, and `max_error_point`. Missing and
extra names are reported explicitly. `landmark_detection` is always `false`.

### Modern Export

#### `photoshop_export_as`
Export a copy as PNG/JPEG (Save for Web) or WebP/AVIF (native, PS 23.2+). Returns `version_unsupported` when the build lacks WebP/AVIF.

**Parameters:**
- `path` (string, required): Absolute output path
- `format` (string, optional): `PNG` | `JPEG` | `WEBP` | `AVIF` (default PNG)
- `quality` (number, optional): 0-100 (default 80)

<!-- BEGIN GENERATED TOOL BACKEND INVENTORY -->
## Generated backend and access inventory

> Generated by `npm run generate:tool-backend-inventory` from the current registered tool sources.
> Do not hand-edit this section; edit the generator/classification inputs and regenerate it.
> Current bridge revision: `compact-v2-20261009-component-rebuild`. Production Photoshop semantic dispatch is UXP-only and fail-closed.

Classification:

- **A** — Node / Guard / planning / pure geometry; no Photoshop backend migration required.
- **B** — orchestration over registered primitives; does not directly own a Photoshop transport.
- **C** — semantic Photoshop primitive implemented through the production UXP lane.
- **D** — explicit retired/unavailable legacy capability.

Current totals: **A=23, B=3, C=106, D=0** across **132 registered tools**.

| tool | source/category | access | primitive | transport | readiness | class | status | notes |
|---|---|---|---|---|---|---:|---|---|
| `photoshop_add_guides` | `src/tools/measurement-tools.ts` / measurement | Guard-required mutation | guides | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_adjust_brightness_contrast` | `src/tools/adjustment-catalog.ts` / adjustment | Guard-required mutation | adjustments | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_adjust_curves` | `src/tools/adjustment-catalog.ts` / adjustment | Guard-required mutation | adjustments | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_adjust_exposure` | `src/tools/color-adjustment-catalog.ts` / color-adjustment | Guard-required mutation | adjustments | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_adjust_hue_saturation` | `src/tools/adjustment-catalog.ts` / adjustment | Guard-required mutation | adjustments | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_adjust_vibrance` | `src/tools/color-adjustment-catalog.ts` / color-adjustment | Guard-required mutation | adjustments | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_analyze_value_structure` | `src/tools/value-check-tools.ts` / value-check | direct read/planning | preview + Node luminance | Node orchestration → registered primitives | underlying primitive readiness | B | inherit | Node analysis; automatically benefits when preview migrates. |
| `photoshop_apply_gaussian_blur` | `src/tools/filter-catalog.ts` / filter | Guard-required mutation | filters | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_apply_gradient_map` | `src/tools/color-adjustment-catalog.ts` / color-adjustment | Guard-required mutation | adjustments | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_apply_gradient_mask` | `src/tools/mask-catalog.ts` / mask | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_apply_high_pass` | `src/tools/filter-catalog.ts` / filter | Guard-required mutation | filters | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_apply_layer_mask` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_apply_layer_style` | `src/tools/effect-catalog.ts` / style | Guard-required mutation | layer styles | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_apply_lut` | `src/tools/color-adjustment-catalog.ts` / color-adjustment | Guard-required mutation | adjustments | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_apply_motion_blur` | `src/tools/filter-catalog.ts` / filter | Guard-required mutation | filters | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_apply_noise` | `src/tools/filter-catalog.ts` / filter | Guard-required mutation | filters | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_apply_photo_filter` | `src/tools/color-adjustment-catalog.ts` / color-adjustment | Guard-required mutation | adjustments | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_apply_sharpen` | `src/tools/filter-catalog.ts` / filter | Guard-required mutation | filters | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_apply_smart_blur` | `src/tools/filter-catalog.ts` / filter | Guard-required mutation | filters | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_auto_contrast` | `src/tools/adjustment-catalog.ts` / adjustment | Guard-required mutation | adjustments | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_auto_levels` | `src/tools/adjustment-catalog.ts` / adjustment | Guard-required mutation | adjustments | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_clear_guides` | `src/tools/measurement-tools.ts` / measurement | Guard-required mutation | guides | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_close_document` | `src/tools/document-tools.ts` / document | Guard-required mutation | documents | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_compare_landmarks` | `src/tools/measurement-tools.ts` / measurement | direct read/planning | Node/session | Node / Guard | Node/session only | A | keep |  |
| `photoshop_content_aware_fill` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_contract_selection` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_convert_to_smart_object` | `src/tools/smart-object-tools.ts` / smart-object | Guard-required mutation | smart objects | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_create_clipping_mask` | `src/tools/mask-catalog.ts` / mask | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_create_document` | `src/tools/document-tools.ts` / document | Guard-required mutation | documents | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_create_layer` | `src/tools/layer-tools.ts` / layer | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_create_layer_mask` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_create_smart_object_via_copy` | `src/tools/smart-object-tools.ts` / smart-object | Guard-required mutation | smart objects | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_create_text_layer` | `src/tools/layer-tools.ts` / layer | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_crop_document` | `src/tools/image-catalog.ts` / image | Guard-required mutation | document geometry | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_delete_layer` | `src/tools/layer-tools.ts` / layer | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_delete_layer_mask` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_desaturate` | `src/tools/adjustment-catalog.ts` / adjustment | Guard-required mutation | adjustments | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_deselect` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_duplicate_layer` | `src/tools/layer-properties-tools.ts` / layer-properties | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_edit_smart_object_contents` | `src/tools/smart-object-tools.ts` / smart-object | Guard-required mutation | smart objects | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_execute_visual_microplan` | `src/tools/visual-microplan-tools.ts` / visual-microplan | Guard-required mutation | visual orchestration | Node orchestration → registered primitives | underlying primitive readiness | B | inherit | Node-side orchestration; benefits from migrated underlying primitives/bundles. |
| `photoshop_expand_selection` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_export_as` | `src/tools/export-tools.ts` / export | Guard-required mutation | export | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_feather_selection` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_fill_layer` | `src/tools/layer-tools.ts` / layer | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP fill mutation with accepted pixel, targeting, selection and history semantics. |
| `photoshop_fit_layer_to_document` | `src/tools/layer-transform-catalog.ts` / layer-transform | Guard-required mutation | layer transforms | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_flatten_image` | `src/tools/layer-properties-tools.ts` / layer-properties | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_geometry_calculate` | `src/tools/measurement-tools.ts` / measurement | direct read/planning | Node/session | Node / Guard | Node/session only | A | keep |  |
| `photoshop_get_brush_settings` | `src/tools/painting-tools.ts` / painting | direct read/planning | brush/config | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP currentToolOptions brush-settings read; no-focus behavior accepted. |
| `photoshop_get_capabilities` | `src/tools/state-tools.ts` / state | direct read/planning | Node/session | Node / Guard | Node/session only | A | keep |  |
| `photoshop_get_document_info` | `src/tools/document-tools.ts` / document | direct read/planning | documents | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP document/layer/selection read cluster with public schema unchanged. |
| `photoshop_get_history` | `src/tools/history-tools.ts` / history | direct read/planning | history | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP historyState read with accepted normalized semantics and no-focus behavior. |
| `photoshop_get_layers` | `src/tools/layer-tools.ts` / layer | direct read/planning | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP document/layer/selection read cluster with public schema unchanged. |
| `photoshop_get_painting_method_capabilities` | `src/tools/method-palette-tools.ts` / method-palette | direct read/planning | Node/session | Node / Guard | Node/session only | A | keep |  |
| `photoshop_get_preview` | `src/tools/state-tools.ts` / state | direct read/planning | preview.read | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP Imaging API preview read with accepted pixel/no-focus behavior. |
| `photoshop_get_selection_bounds` | `src/tools/selection-catalog.ts` / selection | direct read/planning | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP document/layer/selection read cluster with public schema unchanged. |
| `photoshop_get_state` | `src/tools/state-tools.ts` / state | direct read/planning | state.read | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP state read via read-only batchPlay; public schema unchanged. |
| `photoshop_get_version` | `src/core/server-tool-catalog.ts` / server-tool | direct read/planning | Node/session | Node / Guard | Node/session only | A | keep |  |
| `photoshop_guard_art_director` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_brush_pack_ingest` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_brush_pack_profile` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_capabilities` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_cycle_auto` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_job_poll` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_keep_logical_layer` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_lint_next_pass` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_reconcile` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_recover_lock` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_resume` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_review_image` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_set_art_run` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_set_priorities` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_guard_status` | `src/tools/guard-tools.ts` / guard | Guard façade | guard/orchestration | Node / Guard | embedded Guard/runtime state | A | keep | Guard remains transport-agnostic above backend routing. |
| `photoshop_image_stack` | `src/tools/stack-tools.ts` / stack | Guard-required mutation | image stack | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_ingest_brush_pack` | `src/tools/brush-pack-tools.ts` / brush-pack | Guard-required mutation | brush-pack | UXP only — fail closed | compatible UXP companion | C | done/retain | P0-E.1 Guard-routed ABR ingestion; UXP-only with durable command receipts and fail-closed capability reporting. |
| `photoshop_invert` | `src/tools/adjustment-catalog.ts` / adjustment | Guard-required mutation | adjustments | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_invert_selection` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_list_brush_presets` | `src/tools/painting-tools.ts` / painting | direct read/planning | brush/config | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP presetManager brush-preset read; no-focus behavior accepted. |
| `photoshop_list_documents` | `src/tools/document-tools.ts` / document | direct read/planning | documents | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP document/layer/selection read cluster with public schema unchanged. |
| `photoshop_list_fonts` | `src/tools/text-tools.ts` / text | direct read/planning | text | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_list_guides` | `src/tools/measurement-tools.ts` / measurement | direct read/planning | guides | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_measure_points` | `src/tools/measurement-tools.ts` / measurement | direct read/planning | document.info + Node geometry | Node orchestration → registered primitives | underlying primitive readiness | B | inherit | Node geometry over document.info; no dedicated Photoshop measurement mutation is required. |
| `photoshop_merge_layer_down` | `src/tools/layer-tools.ts` / layer | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_merge_visible_layers` | `src/tools/layer-properties-tools.ts` / layer-properties | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_move_layer` | `src/tools/layer-transform-catalog.ts` / layer-transform | Guard-required mutation | layer transforms | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_move_layer_down` | `src/tools/layer-ordering-tools.ts` / layer-ordering | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_move_layer_to_bottom` | `src/tools/layer-ordering-tools.ts` / layer-ordering | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_move_layer_to_position` | `src/tools/layer-ordering-tools.ts` / layer-ordering | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_move_layer_to_top` | `src/tools/layer-ordering-tools.ts` / layer-ordering | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_move_layer_up` | `src/tools/layer-ordering-tools.ts` / layer-ordering | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_neural_filter` | `src/tools/effect-catalog.ts` / style | Guard-required mutation | neural-filter | UXP only — fail closed | compatible UXP companion | C | done/retain | Already UXP bridge; separate feature, not migration driver. |
| `photoshop_open_image` | `src/tools/image-placement-tools.ts` / image-placement | Guard-required mutation | document open/place | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_paint_color_gradient` | `src/tools/layer-tools.ts` / layer | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP linear raster-color gradient mutation with exact layer targeting and bounded color stops; distinct from mask gradients. |
| `photoshop_paint_dabs` | `src/tools/painting-tools.ts` / painting | Guard-required mutation | painting | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP dab mutation preserving ordered adjacent style runs and one-step history semantics. |
| `photoshop_paint_regions` | `src/tools/painting-tools.ts` / painting | Guard-required mutation | painting | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP compound-region mutation with accepted ADD/SUBTRACT geometry, cleanup and one-step history semantics. |
| `photoshop_paint_stamp_instances` | `src/tools/painting-tools.ts` / painting | Guard-required mutation | painting | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_paint_strokes` | `src/tools/painting-tools.ts` / painting | Guard-required mutation | painting | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP stroke mutation with accepted caller style/color, targeting and one-step history semantics. |
| `photoshop_ping` | `src/core/server-tool-catalog.ts` / server-tool | direct read/planning | Node/session | Node / Guard | Node/session only | A | keep |  |
| `photoshop_place_image` | `src/tools/image-placement-tools.ts` / image-placement | Guard-required mutation | document open/place | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_rasterize_layer` | `src/tools/layer-properties-tools.ts` / layer-properties | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_redo` | `src/tools/history-tools.ts` / history | Guard-required mutation | history | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_release_clipping_mask` | `src/tools/mask-catalog.ts` / mask | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_rename_layer` | `src/tools/layer-properties-tools.ts` / layer-properties | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_replace_smart_object_contents` | `src/tools/smart-object-tools.ts` / smart-object | Guard-required mutation | smart objects | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_resize_image` | `src/tools/image-catalog.ts` / image | Guard-required mutation | document geometry | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_rotate_layer` | `src/tools/layer-transform-catalog.ts` / layer-transform | Guard-required mutation | layer transforms | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_sample_color` | `src/tools/color-sampling-tools.ts` / color-sampling | direct read/planning | color sampling | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP Imaging API color sampling with accepted semantic/no-focus behavior. |
| `photoshop_sample_colors` | `src/tools/color-sampling-tools.ts` / color-sampling | direct read/planning | color sampling | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP Imaging API color sampling with accepted semantic/no-focus behavior. |
| `photoshop_save_document` | `src/tools/document-tools.ts` / document | Guard-required mutation | document.save-copy | UXP only — fail closed | compatible UXP companion | C | done/retain | Already intentionally UXP-only; preserve fail-closed persistence invariants. |
| `photoshop_save_selection` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_scale_layer` | `src/tools/layer-transform-catalog.ts` / layer-transform | Guard-required mutation | layer transforms | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_select_all` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_select_brush_preset` | `src/tools/painting-tools.ts` / painting | Guard-required mutation | brush/config | UXP only — fail closed | compatible UXP companion | C | done/retain | Brush/config mutation; production dispatch is UXP-only and fail-closed; no legacy replay path exists. |
| `photoshop_select_ellipse` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_select_layer_by_name` | `src/tools/layer-tools.ts` / layer | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_select_painting_method` | `src/tools/method-palette-tools.ts` / method-palette | direct read/planning | Node/session | Node / Guard | Node/session only | A | keep |  |
| `photoshop_select_rectangle` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_select_subject` | `src/tools/selection-catalog.ts` / selection | Guard-required mutation | selections/masks | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_set_active_document` | `src/tools/document-tools.ts` / document | Guard-required mutation | documents | UXP only — fail closed | compatible UXP companion | C | done/retain | Explicit UI-activating document navigation; may foreground Photoshop and is excluded from no-focus acceptance traces. Never use implicit switching to satisfy document_id. |
| `photoshop_set_brush` | `src/tools/painting-tools.ts` / painting | Guard-required mutation | brush/config | UXP only — fail closed | compatible UXP companion | C | done/retain | Brush/config mutation; production dispatch is UXP-only and fail-closed; no legacy replay path exists. |
| `photoshop_set_foreground_color` | `src/tools/painting-tools.ts` / painting | Guard-required mutation | brush/config | UXP only — fail closed | compatible UXP companion | C | done/retain | Brush/config mutation; production dispatch is UXP-only and fail-closed; no legacy replay path exists. |
| `photoshop_set_layer_blend_mode` | `src/tools/layer-properties-tools.ts` / layer-properties | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_set_layer_locked` | `src/tools/layer-properties-tools.ts` / layer-properties | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_set_layer_opacity` | `src/tools/layer-properties-tools.ts` / layer-properties | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_set_layer_visibility` | `src/tools/layer-properties-tools.ts` / layer-properties | Guard-required mutation | layers | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_set_text_alignment` | `src/tools/text-tools.ts` / text | Guard-required mutation | text | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_set_text_color` | `src/tools/text-tools.ts` / text | Guard-required mutation | text | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_set_text_font` | `src/tools/text-tools.ts` / text | Guard-required mutation | text | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_sky_replacement` | `src/tools/sky-replacement-tools.ts` / sky-replacement | Guard-required mutation | sky replacement | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_transform_landmarks` | `src/tools/measurement-tools.ts` / measurement | direct read/planning | Node/session | Node / Guard | Node/session only | A | keep |  |
| `photoshop_undo` | `src/tools/history-tools.ts` / history | Guard-required mutation | history | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |
| `photoshop_update_text_content` | `src/tools/text-tools.ts` / text | Guard-required mutation | text | UXP only — fail closed | compatible UXP companion | C | done/retain | UXP-only production capability; preserve fail-closed semantics. |

### Remaining non-UXP P1 catalog tools

- None.

### Remaining non-UXP P2 catalog tools

- None.

### Remaining non-UXP P3 catalog tools

- None.

### Migration completion invariant

- Production semantic Photoshop dispatch is UXP-only and fail-closed.
- P1/P2/P3 contain no registered class-C tool pending UXP migration.
- Missing/stale companion readiness is a capability failure, not permission to route through COM/ExtendScript.
- Node/Guard/orchestration tools remain backend-independent only to the extent shown in the table above.

### Intentionally disabled / out of scope

These names are not registered in the current runtime:

- `photoshop_generative_fill`
- `photoshop_generative_expand`
- `photoshop_generative_remove`

<!-- END GENERATED TOOL BACKEND INVENTORY -->
