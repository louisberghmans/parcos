const workspaces = ["community", "contributor", "coordinator", "administration"];

export function availableWorkspaces(role) {
  return workspaces.slice(0, role === "admin" ? 4 : role === "coordinator" ? 3 : 2);
}

export function agriculturePage(hash) {
  if (hash === "#/crops" || /^#\/crops\/[a-z0-9_-]{1,80}$/.test(hash)) return "catalogue";
  if (hash === "#/coordinator/catalogue") return "catalogue-admin";
  if (/^#\/garden-plan(?:\/(?:beds\/)?\d+)?$/.test(hash)) return "garden-plan";
  return null;
}

