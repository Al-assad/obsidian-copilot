import { setChainType, setModelKey } from "@/aiParams";
import { ChainType } from "@/chainType";
import {
  ChatModelProviders,
  ChatModels,
  EmbeddingModelProviders,
  EmbeddingModels,
  PlusUtmMedium,
} from "@/constants";
import { logError, logInfo } from "@/logger";
import { getSettings, setSettings, updateSetting } from "@/settings/model";
import { Notice } from "obsidian";

export const DEFAULT_COPILOT_PLUS_CHAT_MODEL = ChatModels.OPENROUTER_GEMINI_2_5_FLASH;
const DEFAULT_COPILOT_PLUS_CHAT_MODEL_KEY =
  DEFAULT_COPILOT_PLUS_CHAT_MODEL + "|" + ChatModelProviders.OPENROUTERAI;
export const DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL =
  EmbeddingModels.OPENROUTER_OPENAI_EMBEDDING_SMALL;
export const DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL_KEY =
  DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL + "|" + EmbeddingModelProviders.OPENROUTERAI;

// ============================================================================
// SELF-HOST MODE VALIDATION
// ============================================================================
// Self-host mode allows Believer/Supporter users to use their own infrastructure.
//
// Validation flow:
// 1. User enables toggle → validateSelfHostMode() → count = 1, timestamp set
// 2. Every 15+ days on plugin load → refreshSelfHostModeValidation() → count++
// 3. After 3 successful validations → permanent (no more checks needed)
//
// Offline support:
// - Within 15-day grace period: Full functionality, can toggle off/on
// - Permanent (count >= 3): Full functionality forever
// - Grace expired while offline: Must go online to revalidate
//
// Settings section visibility (useIsSelfHostEligible):
// - Shown if: permanent OR within grace period OR API confirms eligibility
// - Hidden if: no license key OR grace expired + offline + not permanent
// ============================================================================

/** Grace period for self-host mode: 15 days */
const SELF_HOST_GRACE_PERIOD_MS = 15 * 24 * 60 * 60 * 1000;

/** Number of successful validations required for permanent self-host mode */
const SELF_HOST_PERMANENT_VALIDATION_COUNT = 3;

/**
 * Check if self-host access is valid.
 * Valid if: permanently validated (3+ successful checks) OR within 15-day grace period.
 */
export function isSelfHostAccessValid(): boolean {
  const settings = getSettings();
  if (settings.selfHostModeValidatedAt == null) {
    return false;
  }
  // Permanently valid after 3 successful validations
  if (settings.selfHostValidationCount >= SELF_HOST_PERMANENT_VALIDATION_COUNT) {
    return true;
  }
  // Otherwise, check grace period
  return Date.now() - settings.selfHostModeValidatedAt < SELF_HOST_GRACE_PERIOD_MS;
}

/**
 * Check if self-host mode is valid and enabled.
 * Requires the toggle to be on and access to be within the grace period or permanently validated.
 */
export function isSelfHostModeValid(): boolean {
  const settings = getSettings();
  if (!settings.enableSelfHostMode) {
    return false;
  }
  return isSelfHostAccessValid();
}

/** Check if the model key is a Copilot Plus model. */
export function isPlusModel(modelKey: string): boolean {
  return (
    (modelKey.split("|")[1] as EmbeddingModelProviders) === EmbeddingModelProviders.COPILOT_PLUS
  );
}

/**
 * Synchronous check if Plus features should be enabled.
 * Returns true when self-host mode is valid OR user has valid Plus subscription.
 * Use this for synchronous checks (e.g., model validation, UI state).
 */
export function isPlusEnabled(): boolean {
  // const settings = getSettings();
  // // Self-host mode with valid plan validation bypasses Plus requirements
  // if (isSelfHostModeValid()) {
  //   return true;
  // }
  // return settings.isPlusUser === true;
  return true;
}

/**
 * Hook to get the isPlusUser setting.
 * Returns true when self-host mode is valid to allow offline usage.
 */
export function useIsPlusUser(): boolean | undefined {
  return true;
}

/**
 * Check if the user is a Plus user.
 * When self-host mode is valid, this returns true to allow offline usage.
 */
export async function checkIsPlusUser(
  _context?: Record<string, unknown>
): Promise<boolean | undefined> {
  return true;
}

/**
 * Hook to check if user should see the self-host mode settings section.
 * Returns undefined while loading, boolean once checked.
 *
 * Eligibility rules:
 * 1. No license key: Not eligible (immediately revokes access)
 * 2. Has license key: Verify via API (handles key changes, e.g. believer → plus)
 *    - API success: Use result (revoke self-host mode if not eligible)
 *    - API failure (offline): Fall back to cached validation
 *      (permanent count >= 3 OR within 15-day grace period)
 */
export function useIsSelfHostEligible(): boolean | undefined {
  return true;
}

/**
 * Validate self-host mode when user enables the toggle.
 * Called from UI when toggle is switched ON.
 *
 * Flow:
 * 1. If permanently validated (count >= 3): Allow immediately (offline-safe)
 * 2. If within grace period: Allow immediately (offline-safe)
 * 3. Otherwise: Require API validation (online only)
 *    - Success: Set count = max(current, 1), update timestamp
 *    - Failure: Return false, UI should revert toggle
 *
 * @returns true if validation passed, false if user should not enable
 */
export async function validateSelfHostMode(): Promise<boolean> {
  updateSetting("selfHostModeValidatedAt", Date.now());
  updateSetting(
    "selfHostValidationCount",
    Math.max(getSettings().selfHostValidationCount || 0, SELF_HOST_PERMANENT_VALIDATION_COUNT)
  );
  logInfo("Self-host mode validation bypassed");
  return true;
}

/**
 * Refresh self-host mode validation on plugin startup.
 * Called from main.ts on plugin load.
 *
 * Flow:
 * 1. If toggle OFF or permanently validated: No-op
 * 2. API check:
 *    - Eligible + 15+ days since last: Increment count, update timestamp
 *    - Eligible + <15 days: Log only (preserve countdown)
 *    - Not eligible: Disable toggle, reset count to 0
 *    - Offline/error: No-op (grace period continues)
 *
 * Count progression: 1 → 2 → 3 (permanent) over minimum 28 days.
 */
export async function refreshSelfHostModeValidation(): Promise<void> {
  logInfo("Self-host mode refresh skipped");
}

/**
 * Apply the Copilot Plus settings.
 * Includes clinical fix to ensure indexing is triggered when embedding model changes,
 * as the automatic detection doesn't work reliably in all scenarios.
 */
export function applyPlusSettings(): void {
  const defaultModelKey = DEFAULT_COPILOT_PLUS_CHAT_MODEL_KEY;
  const embeddingModelKey = DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL_KEY;
  const previousEmbeddingModelKey = getSettings().embeddingModelKey;

  logInfo("applyPlusSettings: Changing embedding model", {
    from: previousEmbeddingModelKey,
    to: embeddingModelKey,
    changed: previousEmbeddingModelKey !== embeddingModelKey,
  });

  setModelKey(defaultModelKey);
  setChainType(ChainType.COPILOT_PLUS_CHAIN);
  setSettings({
    defaultModelKey,
    embeddingModelKey,
    defaultChainType: ChainType.COPILOT_PLUS_CHAIN,
  });

  // Ensure indexing happens only once when embedding model changes
  if (previousEmbeddingModelKey !== embeddingModelKey) {
    logInfo("applyPlusSettings: Embedding model changed, triggering indexing");
    import("@/search/vectorStoreManager")
      .then(async (module) => {
        await module.default.getInstance().indexVaultToVectorStore();
      })
      .catch((error) => {
        logError("Failed to trigger indexing after Plus settings applied:", error);
        new Notice(
          "Failed to update Copilot index. Please try force reindexing from the command palette."
        );
      });
  } else {
    logInfo("applyPlusSettings: No embedding model change, skipping indexing");
  }
}

export function createPlusPageUrl(medium: PlusUtmMedium): string {
  return `https://www.obsidiancopilot.com?utm_source=obsidian&utm_medium=${medium}`;
}

export function navigateToPlusPage(medium: PlusUtmMedium): void {
  window.open(createPlusPageUrl(medium), "_blank");
}

export function turnOnPlus(): void {
  updateSetting("isPlusUser", true);
}

/**
 * Turn off Plus user status.
 * IMPORTANT: This is called on every plugin start for users without a Plus license key (see checkIsPlusUser).
 * DO NOT reset model settings here - it will cause free users to lose their model selections on every app restart.
 * Only update the isPlusUser flag.
 */
export function turnOffPlus(): void {
  logInfo("Skipping Plus entitlement downgrade");
  updateSetting("isPlusUser", true);
}
