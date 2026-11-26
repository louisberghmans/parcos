export const TASK_PAGE_SIZE = 6;

export function taskPage(tasks, requestedPage = 0) {
  const pages = Math.max(1, Math.ceil(tasks.length / TASK_PAGE_SIZE));
  const page = Math.min(Math.max(0, Number.isSafeInteger(requestedPage) ? requestedPage : 0), pages - 1);
  const start = page * TASK_PAGE_SIZE;
  return { page, pages, start, end: Math.min(start + TASK_PAGE_SIZE, tasks.length), tasks: tasks.slice(start, start + TASK_PAGE_SIZE) };
}

export function renderTaskGroup(label, tasks, kind, { requestedPage, t, escapeHtml, renderCard }) {
  const current = taskPage(tasks, requestedPage);
  const titleId = `task-group-${kind}-title`;
  const listId = `task-group-${kind}-list`;
  const rangeId = `task-group-${kind}-range`;
  const range = `${current.start + 1}–${current.end} / ${tasks.length}`;
  const controls = current.pages > 1 ? `<nav class="task-pagination" aria-label="${escapeHtml(label)}">
    <button type="button" class="button secondary" data-task-group="${kind}" data-task-page="${current.page - 1}" aria-controls="${listId}" ${current.page === 0 ? "disabled" : ""}>${t("Précédent", "Previous", "Vorige")}</button>
    <span id="${rangeId}" role="status">${range}</span>
    <button type="button" class="button secondary" data-task-group="${kind}" data-task-page="${current.page + 1}" aria-controls="${listId}" ${current.page === current.pages - 1 ? "disabled" : ""}>${t("Suivant", "Next", "Volgende")}</button>
  </nav>` : "";
  return `<section class="task-group ${kind}" aria-labelledby="${titleId}"><div class="task-group-title"><strong id="${titleId}" tabindex="-1" ${current.pages > 1 ? `aria-describedby="${rangeId}"` : ""}>${escapeHtml(label)}</strong><span>${tasks.length}</span></div><div class="task-list" id="${listId}">${current.tasks.map(renderCard).join("")}</div>${controls}</section>`;
}
