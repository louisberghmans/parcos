import assert from "node:assert/strict";
import test from "node:test";
import { taskPage, renderTaskGroup } from "../public/app/tasks/task-group.js";

test("all task cards are reachable across pages with no duplicates or omissions", () => {
  for (const count of [0, 1, 6, 7, 12, 13, 80]) {
    const tasks = Array.from({ length: count }, (_, index) => ({ id: index + 1 }));
    const reached = [];
    for (let page = 0; page < taskPage(tasks).pages; page += 1) {
      const result = taskPage(tasks, page);
      assert.ok(result.tasks.length <= 6);
      reached.push(...result.tasks);
    }
    assert.deepEqual(reached, tasks);
  }
});

test("paging clamps after claiming/completing the final task on a page", () => {
  const tasks = Array.from({ length: 6 }, (_, id) => ({ id }));
  assert.deepEqual(taskPage(tasks, 2).tasks, tasks);
  assert.equal(taskPage(tasks, 2).page, 0);
  for (const invalid of [-1, NaN, 1.5, undefined]) assert.equal(taskPage(tasks, invalid).page, 0);
  assert.deepEqual(taskPage([], 9).tasks, []);
});

test("paging controls expose range, accessible relationships and all three languages", () => {
  const tasks = Array.from({ length: 13 }, (_, index) => ({ id: index + 1 }));
  for (const [locale, previous, next] of [[0, "Précédent", "Suivant"], [1, "Previous", "Next"], [2, "Vorige", "Volgende"]]) {
    const options = { t: (...labels) => labels[locale], escapeHtml: (text) => text.replaceAll("&", "&amp;"), renderCard: ({ id }) => `<article>${id}</article>` };
    const first = renderTaskGroup("Tasks & work", tasks, "available", options);
    assert.match(first, /aria-labelledby="task-group-available-title"/);
    assert.match(first, /aria-controls="task-group-available-list"/);
    assert.match(first, /tabindex="-1"/);
    assert.match(first, /aria-describedby="task-group-available-range"/);
    assert.match(first, /Tasks &amp; work/);
    assert.match(first, /1–6 \/ 13/);
    assert.ok(first.includes(`disabled>${previous}`));
    assert.ok(first.includes(`>${next}`));
    const last = renderTaskGroup("Tasks", tasks, "available", { ...options, requestedPage: 2 });
    assert.match(last, /13–13 \/ 13/);
    assert.match(last, /<article>13<\/article>/);
    assert.ok(last.includes(`disabled>${next}`));
    assert.doesNotMatch(renderTaskGroup("Tasks", tasks.slice(0, 6), "urgent", options), /task-pagination/);
  }
});
