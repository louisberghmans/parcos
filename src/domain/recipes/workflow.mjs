import { SUPPORTED_LOCALES, WORKFLOW_STATUSES } from "./constants.mjs";
import { evaluateLicense } from "./validator.mjs";

const ALLOWED_TRANSITIONS = Object.freeze({
  draft: ["submitted", "withdrawn"],
  submitted: ["changes_requested", "approved", "rejected", "withdrawn"],
  changes_requested: ["submitted", "withdrawn"],
  approved: ["archived"],
  rejected: ["draft", "archived"],
  withdrawn: ["draft", "archived"],
  archived: ["approved"],
});

export function canRoleReview(role) {
  return role === "coordinator" || role === "admin";
}

/**
 * Object-level read authorization for recipe & contribution records.
 * Ordinary members see approved recipes and their OWN drafts/submissions, NEVER other members' pending drafts.
 */
export function canMemberViewRecipe(recipe, actor) {
  if (!actor || !actor.memberId) return false;
  const status = recipe?.editorial?.workflowStatus;
  if (status === "approved") return true;
  if (canRoleReview(actor.role)) return true;
  if (recipe?.contributor?.ownerMemberId && recipe.contributor.ownerMemberId === actor.memberId) {
    return true;
  }
  return false;
}

/**
 * Object-level edit authorization for member drafts/submissions.
 */
export function canMemberEditDraft(recipe, actor) {
  if (!actor || !actor.memberId) return false;
  const status = recipe?.editorial?.workflowStatus;
  if (status !== "draft" && status !== "changes_requested") return false;
  return recipe?.contributor?.ownerMemberId === actor.memberId;
}

/**
 * Execute a guarded workflow state transition with server-side permission enforcement.
 * Authors cannot self-approve unless they hold coordinator/admin reviewer privileges.
 */
export function transitionRecipeWorkflow(recipe, { toStatus, actor, reason = "", promoteToCurated = false, nowIso = new Date().toISOString() }) {
  if (!actor || !actor.memberId || !actor.role) {
    return { ok: false, error: "unauthorized", message: "Authenticated actor is required" };
  }
  if (!WORKFLOW_STATUSES.includes(toStatus)) {
    return { ok: false, error: "invalid_status", message: `Unknown workflow status "${toStatus}"` };
  }
  const fromStatus = recipe?.editorial?.workflowStatus;
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    return {
      ok: false,
      error: "invalid_transition",
      message: `Transition from "${fromStatus}" to "${toStatus}" is not allowed`,
    };
  }

  const isOwner = recipe?.contributor?.ownerMemberId === actor.memberId;
  const isReviewer = canRoleReview(actor.role);

  if (toStatus === "submitted" || toStatus === "withdrawn" || toStatus === "draft") {
    if (!isOwner && !isReviewer) {
      return { ok: false, error: "forbidden", message: "Only the draft owner or a coordinator/admin may change submission status" };
    }
  } else {
    // Review outcomes: approved, changes_requested, rejected, archived
    if (!isReviewer) {
      return {
        ok: false,
        error: "forbidden",
        message: "Reviewer role (coordinator or admin) is required; authors cannot self-approve",
      };
    }
    if ((toStatus === "rejected" || toStatus === "changes_requested") && !String(reason).trim()) {
      return {
        ok: false,
        error: "reason_required",
        message: `A clear reason is required when setting status to "${toStatus}"`,
      };
    }
  }

  if (toStatus === "approved" && promoteToCurated) {
    const rightsStatus = recipe.rights?.status;
    if (rightsStatus !== "cleared" && rightsStatus !== "local_only") {
      return {
        ok: false,
        error: "rights_not_cleared",
        message: "Promoting a recipe to the curated collection requires cleared or valid local community rights",
      };
    }
  }

  const auditEntry = {
    at: nowIso,
    fromStatus,
    toStatus,
    actorRole: actor.role,
    reviewerLabel: actor.displayLabel || actor.memberId,
    revision: recipe.revision,
    reason: String(reason).trim() || null,
    promotedToCurated: Boolean(toStatus === "approved" && promoteToCurated),
  };

  const next = structuredClone(recipe);
  next.editorial = {
    ...next.editorial,
    workflowStatus: toStatus,
    collection: toStatus === "approved" && promoteToCurated ? "curated" : next.editorial.collection,
    reviewedBy: isReviewer && toStatus !== "submitted" ? actor.memberId : next.editorial.reviewedBy ?? null,
    reviewedAt: isReviewer && toStatus !== "submitted" ? nowIso : next.editorial.reviewedAt ?? null,
    lastReviewReason: String(reason).trim() || null,
    auditTrail: [...(next.editorial.auditTrail || []), auditEntry],
  };

  return { ok: true, recipe: next, auditEntry };
}

/**
 * Moderation takedown: unpublishes problematic content (sets workflowStatus="archived"
 * and records takedown reason/timestamp) without corrupting historical meal snapshots.
 */
export function takedownRecipe(recipe, { actor, reason, nowIso = new Date().toISOString() }) {
  if (!actor || !canRoleReview(actor.role)) {
    return { ok: false, error: "forbidden", message: "Coordinator or admin role is required for moderation takedown" };
  }
  if (!String(reason || "").trim()) {
    return { ok: false, error: "reason_required", message: "Takedown requires an explicit moderation reason" };
  }
  const next = structuredClone(recipe);
  next.editorial = {
    ...next.editorial,
    workflowStatus: "archived",
    takedown: {
      at: nowIso,
      byRole: actor.role,
      reason: String(reason).trim(),
      historicalSnapshotsPreserved: true,
    },
    auditTrail: [
      ...(next.editorial.auditTrail || []),
      {
        at: nowIso,
        fromStatus: recipe.editorial?.workflowStatus ?? "unknown",
        toStatus: "archived",
        actorRole: actor.role,
        revision: recipe.revision,
        reason: `TAKEDOWN: ${String(reason).trim()}`,
      },
    ],
  };
  return { ok: true, recipe: next };
}

/**
 * Create a new revision for an improvement/correction or fork a distinct variant.
 * Never overwrites the prior revision object; preserves attribution.
 */
export function createRevisionProposal(baseRecipe, { kind = "correction", nextRevision, changes = {}, actor, nowIso = new Date().toISOString() }) {
  if (kind !== "correction" && kind !== "variant") {
    throw new Error('kind must be "correction" or "variant"');
  }
  const proposal = structuredClone(baseRecipe);
  if (kind === "variant") {
    const slugSuffix = String(changes.variantSlug || "variant").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "variant";
    proposal.recipeKey = `community:${baseRecipe.recipeKey.split(":")[1]}-${slugSuffix}`;
    proposal.derivedFrom = {
      recipeKey: baseRecipe.recipeKey,
      revision: baseRecipe.revision,
    };
    proposal.editorial.collection = "community";
  }
  proposal.revision = nextRevision || `${baseRecipe.revision}-prop-${nowIso.slice(0, 10)}`;
  proposal.parentRevision = baseRecipe.revision;
  proposal.editorial.workflowStatus = "submitted";
  proposal.editorial.proposalKind = kind;
  proposal.contributor = {
    ...(proposal.contributor || {}),
    ownerMemberId: actor?.memberId ?? null,
    publicCredit: actor?.publicCredit ?? proposal.contributor?.publicCredit ?? null,
    submittedAt: nowIso,
  };
  if (changes.titleByLocale) {
    for (const loc of SUPPORTED_LOCALES) {
      if (changes.titleByLocale[loc]) {
        proposal.content.locales[loc] = {
          ...(proposal.content.locales[loc] || {}),
          title: changes.titleByLocale[loc],
        };
      }
    }
  }
  if (changes.stepsByLocale) {
    for (const loc of SUPPORTED_LOCALES) {
      if (Array.isArray(changes.stepsByLocale[loc])) {
        proposal.content.locales[loc] = {
          ...(proposal.content.locales[loc] || {}),
          steps: changes.stepsByLocale[loc],
        };
      }
    }
  }
  return proposal;
}

/**
 * Public export sanitizer:
 * - Only approved recipes
 * - Rights must be open/cleared (never NC, ND, UNKNOWN, or LOCAL-COMMUNITY-ONLY)
 * - Community/original contributions MUST have explicit publicExportOptIn.granted === true
 * - Each exported media item must ALSO be openly licensed and opted in (if contributor-owned)
 * - Strips ALL personal/account identifiers (ownerMemberId, reviewedBy, usernames, emails, internal IDs)
 */
export function sanitizeForPublicExport(recipes) {
  const exported = [];
  const excluded = [];

  for (const recipe of recipes) {
    if (recipe.editorial?.workflowStatus !== "approved") {
      excluded.push({ recipeKey: recipe.recipeKey, reason: `workflowStatus="${recipe.editorial?.workflowStatus}"` });
      continue;
    }

    const licEval = evaluateLicense(recipe.rights?.licenseId);
    if (!licEval.autoImportAllowed) {
      excluded.push({ recipeKey: recipe.recipeKey, reason: `license "${recipe.rights?.licenseId}" is not openly redistributable` });
      continue;
    }

    if (recipe.origin === "community" || recipe.origin === "original") {
      const optIn = recipe.rights?.publicExportOptIn;
      if (!optIn || optIn.granted !== true || !optIn.licenseId || !evaluateLicense(optIn.licenseId).autoImportAllowed) {
        excluded.push({
          recipeKey: recipe.recipeKey,
          reason: "Missing explicit contributor open-license opt-in for external redistribution",
        });
        continue;
      }
    }

    const clean = structuredClone(recipe);

    // Strip all private / internal member metadata
    if (clean.contributor) {
      clean.contributor = {
        publicCredit: clean.rights?.publicExportOptIn?.creditName || clean.contributor.publicCredit || "Anonymous contributor",
      };
    }
    if (clean.editorial) {
      clean.editorial = {
        workflowStatus: clean.editorial.workflowStatus,
        collection: clean.editorial.collection,
        cookedVerification: clean.editorial.cookedVerification ?? "unverified",
        planningReady: Boolean(clean.editorial.planningReady),
      };
    }

    // Filter media independently: only openly licensed & opted-in media survive public export
    if (Array.isArray(clean.media)) {
      clean.media = clean.media.filter((item) => {
        const mLic = evaluateLicense(item?.rights?.licenseId);
        if (!mLic.autoImportAllowed) return false;
        if (item.source === "community" && item.rights?.publicExportOptIn?.granted !== true) {
          return false;
        }
        return true;
      });
    }

    exported.push(clean);
  }

  return { exported, excluded };
}
