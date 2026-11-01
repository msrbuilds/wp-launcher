import { config } from '../config';
import { ConflictError, ValidationError } from '../utils/errors';
import { baseImageTag, parseBaseImageTag } from './imageBuild.service';
import * as wpImageTags from './wpImageTags.service';
import * as buildJobs from './imageBuildJob.service';
import * as dockerService from './docker.service';
import { listBlueprints } from './blueprint.service';

/**
 * Image management shared by the panel's /api/admin/images routes and the MCP
 * admin tools, so the buildability and in-use guards cannot drift between them.
 */

export const blueprintsUsing = (tag: string): string[] =>
  listBlueprints().filter((b) => b.docker?.image === tag).map((b) => b.id);

export async function listImagesWithUsage() {
  const images = await dockerService.listWplImages();
  return images.map((i) => ({ ...i, usedByBlueprints: blueprintsUsing(i.tag) }));
}

export async function startBaseBuild(phpVersion: string, wpVersion: string, createdBy: string): Promise<{ jobId: string; tag: string }> {
  const matrix = await wpImageTags.getBuildableWpByPhp();
  if (!wpImageTags.isBuildable(matrix, phpVersion, wpVersion)) {
    throw new ValidationError(`PHP ${phpVersion} + WordPress ${wpVersion} is not a buildable combination`);
  }
  const tag = baseImageTag(phpVersion, wpVersion);
  const job = buildJobs.createBuildJob({ tag, kind: 'base', spec: { phpVersion, wpVersion }, createdBy });
  buildJobs.enqueueBuild(job.id, config.wordpressDir);
  return { jobId: job.id, tag };
}

/**
 * Rebuilds a base image from its tag. Refuses anything that is not one of our
 * base tags, notably custom product images, whose baked-in plugins and themes a
 * base rebuild would discard.
 */
export async function startRebuild(tag: string, createdBy: string): Promise<{ jobId: string; tag: string }> {
  const spec = parseBaseImageTag(tag);
  if (!spec) {
    throw new ValidationError(`${tag || 'That image'} is not a WP Launcher base image, so it cannot be rebuilt automatically. `
      + 'Custom product images are built with scripts/build-wp-image.sh.');
  }
  const matrix = await wpImageTags.getBuildableWpByPhp();
  if (!wpImageTags.isBuildable(matrix, spec.phpVersion, spec.wpVersion)) {
    throw new ValidationError(`PHP ${spec.phpVersion} + WordPress ${spec.wpVersion} is no longer buildable`);
  }
  // Build under the canonical tag for those versions. For `:latest` that is the
  // default pair's tag, which the runner then re-aliases back to `:latest`.
  const buildTag = baseImageTag(spec.phpVersion, spec.wpVersion);
  const job = buildJobs.createBuildJob({ tag: buildTag, kind: 'base', spec, createdBy });
  buildJobs.enqueueBuild(job.id, config.wordpressDir);
  return { jobId: job.id, tag: buildTag };
}

/** Removes an image, refusing (409) while a blueprint still references it unless forced. */
export async function removeImageGuarded(tag: string, force: boolean): Promise<void> {
  if (!force) {
    const used = blueprintsUsing(tag);
    if (used.length) throw new ConflictError(`In use by blueprint(s): ${used.join(', ')}`);
  }
  await dockerService.removeImage(tag);
}
