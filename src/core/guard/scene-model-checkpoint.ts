import { normalizeSceneGeometryModel, geometryOptOutAuthorityIssue, type SceneGeometryModel } from '../scene-geometry-model.js';
import { normalizeSceneCameraImagingModel, type SceneCameraImagingModel } from '../scene-camera-imaging-model.js';

/** Models are Guard metadata, not proof of Photoshop pixels. A successful PSD
 * save may commit an explicitly authored model only when its exact accepted
 * source frame and live document incarnation match. Camera registration is a
 * separate checkpoint after durable geometry, never a same-call proposal. */
export function sceneModelCheckpoint(
  supplied: {scene_geometry_model?: unknown; scene_camera_imaging_model?: unknown},
  context: {
    document_incarnation_id?: string | null;
    painterly_frame?: {operation_id?: string; sha256?: string; canvas_width?: number; canvas_height?: number} | null;
    scene_geometry_model?: unknown;
    scene_camera_imaging_model?: unknown;
    art_director?: {style_contract?: Record<string, unknown> | null} | null;
  },
  documentId: number,
  saveArgs: {format?: unknown; path?: unknown} = {},
): {geometry?: SceneGeometryModel; camera?: SceneCameraImagingModel; error?: string} {
  if (supplied.scene_geometry_model === undefined && supplied.scene_camera_imaging_model === undefined) return {};
  if ((saveArgs.format ?? 'PSD') !== 'PSD'
    || typeof saveArgs.path !== 'string' || !/\.psd$/i.test(saveArgs.path)) {
    return {error: 'scene_model_checkpoint_psd_required: scene model authority is committed only after a real PSD save, never JPEG, PNG or an unspecified path'};
  }
  if (supplied.scene_geometry_model !== undefined && supplied.scene_camera_imaging_model !== undefined) {
    return {error: 'scene_model_checkpoint_separate_revisions_required: save and accept geometry first; bind the camera in a separate subsequent checkpoint'};
  }
  const frame = context.painterly_frame;
  if (!frame?.operation_id || !frame.sha256 || !context.document_incarnation_id) {
    return {error: 'scene_model_checkpoint_current_frame_required: an exact authoritative current visual frame and document incarnation are required'};
  }
  const matchingFrame = (source: {document_id: number; document_incarnation: string;
    operation_id?: string; preview_sha256?: string; width?: number; height?: number}) =>
    source.document_id === documentId
    && source.document_incarnation === context.document_incarnation_id
    && source.operation_id === frame.operation_id
    && source.preview_sha256 === frame.sha256
    && (source.width === undefined || source.width === frame.canvas_width)
    && (source.height === undefined || source.height === frame.canvas_height);
  try {
    if (supplied.scene_geometry_model !== undefined) {
      const geometry = normalizeSceneGeometryModel(supplied.scene_geometry_model);
      if (!matchingFrame(geometry.source_frame)) {
        return {error: 'scene_geometry_model_source_frame_mismatch: model must reference the current exact image, document dimensions and incarnation'};
      }
      const durable = context.scene_geometry_model
        ? normalizeSceneGeometryModel(context.scene_geometry_model) : undefined;
      if (durable && (durable.model_id !== geometry.model_id || geometry.revision <= durable.revision)) {
        return {error: 'scene_geometry_model_revision_conflict: preserve the durable model identity and advance its revision'};
      }
      const issue = geometryOptOutAuthorityIssue(geometry, context.art_director?.style_contract);
      if (issue) return {error: 'scene_geometry_model_style_basis_invalid: ' + issue};
      return {geometry};
    }
    const camera = normalizeSceneCameraImagingModel(supplied.scene_camera_imaging_model);
    if (!matchingFrame(camera.source_frame)) {
      return {error: 'scene_camera_imaging_model_source_frame_mismatch: camera must reference the current exact image and document incarnation'};
    }
    if (!context.scene_geometry_model) {
      return {error: 'scene_camera_imaging_geometry_missing: the geometry must already be durably committed by a completed earlier operation'};
    }
    const durableGeometry = normalizeSceneGeometryModel(context.scene_geometry_model);
    if (camera.geometry_model_id !== durableGeometry.model_id
      || camera.geometry_model_revision !== durableGeometry.revision) {
      return {error: 'scene_camera_imaging_geometry_mismatch: camera must bind to the exact current durable geometry revision'};
    }
    if (camera.lighting_color_model_id !== undefined) {
      return {error: 'scene_camera_imaging_lighting_unverified: checkpoint registration of a camera with lighting dependencies requires the visual model-admission route'};
    }
    if (context.scene_camera_imaging_model) {
      const durable = normalizeSceneCameraImagingModel(context.scene_camera_imaging_model);
      if (camera.model_id !== durable.model_id || camera.revision <= durable.revision) {
        return {error: 'scene_camera_imaging_model_revision_conflict: preserve the durable camera model identity and advance its revision'};
      }
    }
    return {camera};
  } catch (error) {
    return {error: 'scene_model_checkpoint_invalid: ' + (error instanceof Error ? error.message : String(error))};
  }
}
