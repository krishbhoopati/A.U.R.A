import { runAgent1 } from "./agents/agent1-geometry";
import { runAgent2 } from "./agents/agent2-placement";
import { runAgent3 } from "./agents/agent3-assembly";
import { isBackboardServiceError } from "./backboard-client";
import { db } from "./db";
import { getEnv } from "./env";
import { isGeminiQuotaError, isGeminiServiceError } from "./gemini";
import { storage } from "./storage";

function formatPipelineError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (isGeminiQuotaError(error)) {
    return "Gemini API quota exceeded. The fallback planner was attempted, but processing still could not complete.";
  }

  if (isGeminiServiceError(error)) {
    return "Gemini API request failed. Please retry after confirming the API key, quota, and network access.";
  }

  if (isBackboardServiceError(error)) {
    return `Backboard API request failed: ${message.substring(0, 240)}`;
  }

  if (/Failed to fetch image/i.test(message)) {
    return "The uploaded floor plan could not be fetched from object storage.";
  }

  if (/must be|unknown room|invalid json|detected no rooms/i.test(message)) {
    return message;
  }

  return "Processing failed while building the scene. Check the server logs for details.";
}

export async function runPipeline(jobId: string, floorplanImageUrl: string, useCase: string): Promise<void> {
  try {
    // --- Agent 1 ---
    await db.updateJobStatus(jobId, "agent1_running");
    const floorplan = await runAgent1(floorplanImageUrl);
    await db.updateJobStatus(jobId, "agent1_done", { agent1Output: floorplan });

    // --- Agent 2 ---
    await db.updateJobStatus(jobId, "agent2_running");
    const { objects, useCaseCategory, placementNotes } = await runAgent2(floorplan, useCase);
    await db.updateJobStatus(jobId, "agent2_done", { agent2Output: { objects, useCaseCategory, placementNotes } });

    // --- Agent 3 ---
    await db.updateJobStatus(jobId, "agent3_running");
    const sceneFile = runAgent3({ floorplan, objects, useCaseCategory, placementNotes, useCase, floorplanImageUrl });

    // --- Save to Object Storage ---
    const sceneKey = `scenes/${sceneFile.sceneId}.json`;
    await storage.uploadScene(sceneKey, sceneFile);

    // --- Save to Database ---
    const sceneId = await db.createScene({
      sceneId: sceneFile.sceneId,
      jobId,
      sceneStorageKey: sceneKey,
      useCase,
      useCaseCategory,
      floorplanWidth: floorplan.width,
      floorplanDepth: floorplan.depth,
      objectCount: objects.length,
      shareUrl: `${getEnv().APP_BASE_URL}/scene/${sceneFile.sceneId}`,
    });

    await db.updateJobStatus(jobId, "complete", { sceneId });

  } catch (error) {
    await db.updateJobStatus(jobId, "failed", { errorMessage: formatPipelineError(error) });
    throw error;
  }
}
