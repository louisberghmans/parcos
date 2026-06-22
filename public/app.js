const app = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
const toastRoot = document.querySelector("#toast-root");

const state = {
  member: null,
  csrfToken: null,
  setupRequired: false,
  parcName: "ParcOS",
  beds: [],
  areas: [],
  events: [],
  members: [],
  page: "today",
  filter: "all",
  eventFilter: "all",
  calendarView: "month",
  calendarDate: new Date(),
  search: "",
  selectedAreaId: null,
  selectedBed: null,
  selectedEvent: null,
};

const statusMeta = {
  unknown: { label: "À vérifier", tone: "unknown" },
  ready: { label: "Disponible", tone: "ready" },
  growing: { label: "Ça pousse", tone: "growing" },
  harvest: { label: "À récolter", tone: "harvest" },
  clear: { label: "À nettoyer", tone: "clear" },
  winter: { label: "Au repos", tone: "winter" },
};

const roleLabels = { member: "Membre", coordinator: "Coordinateur", admin: "Administrateur" };
const eventTypeMeta = {
  work: { label: "Chantier", icon: "♧" },
  workshop: { label: "Atelier", icon: "✦" },
  community: { label: "Communauté", icon: "☕" },
  school: { label: "École", icon: "⌂" },
  planning: { label: "Coordination", icon: "◇" },
  milestone: { label: "Saison", icon: "◌" },
};
const eventStateLabels = { draft: "Brouillon", published: "Publié", cancelled: "Annulé", completed: "Terminé" };

function eventCoverUrl(event) {
  return event.title === "Permanence au potager" ? "/assets/permanence-jardin-stylisee.png" : null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function formatDate(value, options = { day: "numeric", month: "short" }) {
  return value ? new Intl.DateTimeFormat("fr-BE", options).format(new Date(value)) : "—";
}

function formatEventDate(value, options = { weekday: "long", day: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat("fr-BE", options).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function datetimeLocalValue(value) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function relativeDate(value) {
  if (!value) return "Jamais";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400_000);
  if (days <= 0) return "Aujourd’hui";
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} jours`;
  return formatDate(value, { day: "numeric", month: "short", year: "numeric" });
}

function initials(name) {
  return String(name ?? "P").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function isCoordinator() {
  return ["coordinator", "admin"].includes(state.member?.role);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (state.csrfToken && !["GET", "HEAD"].includes(options.method || "GET")) headers["X-CSRF-Token"] = state.csrfToken;
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.includes("/auth/login")) {
      state.member = null;
      state.csrfToken = null;
      renderLogin();
    }
    throw new Error(payload.error || "Une erreur est survenue.");
  }
  return payload;
}

function showToast(message) {
  toastRoot.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  window.setTimeout(() => { toastRoot.innerHTML = ""; }, 3200);
}

function renderLogin(error = "") {
  modalRoot.innerHTML = "";
  app.innerHTML = `<main class="auth-page">
    <section class="auth-visual">
      <div class="auth-brand"><span class="brand-mark">P</span><span><strong>Le Potager</strong><small>du Parc Parmentier</small></span></div>
      <div><p class="eyebrow light">Notre potager, ensemble</p><h1>Bienvenue au Potager<br>du Parc Parmentier.</h1><p>L’espace privé des membres pour observer, cultiver et partager.</p></div>
    </section>
    <section class="auth-panel">
      <div class="auth-form-wrap">
        <p class="eyebrow">Espace membres</p><h2>Se connecter</h2>
        <p class="muted">Utilisez le nom d’utilisateur reçu lors de votre invitation.</p>
        ${error ? `<div class="form-error">${escapeHtml(error)}</div>` : ""}
        <form id="login-form" class="form-stack">
          <label>Nom d’utilisateur<input name="username" autocomplete="username" required autofocus></label>
          <label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
          <button class="button primary" type="submit">Entrer dans le potager</button>
        </form>
        <p class="auth-help">Pas encore de profil ? Un coordinateur peut vous remettre une invitation ParcOS.</p>
      </div>
    </section>
  </main>`;
  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      const data = new FormData(event.currentTarget);
      const result = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: data.get("username"), password: data.get("password") }) });
      state.member = result.member;
      state.csrfToken = result.csrfToken;
      state.setupRequired = result.setupRequired;
      state.parcName = result.parcName;
      if (state.setupRequired) return renderSetup();
      await Promise.all([loadAreas(), loadBeds(), loadEvents(), loadMembers()]);
      renderApp();
      const linkedEventId = Number(new URLSearchParams(location.search).get("event"));
      if (linkedEventId) openEvent(linkedEventId);
    } catch (loginError) {
      renderLogin(loginError.message);
    }
  });
}

function renderSetup(error = "") {
  modalRoot.innerHTML = "";
  const areaRow = (index, name = "", prefix = "") => `<div class="setup-area" data-setup-area>
    <label>Nom du lieu<input name="areaName" maxlength="100" required placeholder="Ex. Grand potager" value="${escapeHtml(name)}"></label>
    <label>Préfixe<input name="areaPrefix" maxlength="6" required pattern="[A-Za-z0-9]{2,6}" placeholder="GP" value="${escapeHtml(prefix)}"></label>
    <label class="setup-access"><input name="membersCanAccess" type="checkbox" checked> Visible par les membres</label>
    ${index ? '<button type="button" class="text-link remove-setup-area">Retirer</button>' : ""}
  </div>`;
  app.innerHTML = `<main class="auth-page setup-page"><section class="auth-visual"><div class="auth-brand"><span class="brand-mark">P</span><span><strong>ParcOS</strong><small>Configuration initiale</small></span></div><div><p class="eyebrow light">Bienvenue, admin</p><h1>Commençons par<br>votre terrain.</h1><p>Ces informations structurent les lieux, planches et droits d’accès de votre installation.</p></div></section>
    <section class="auth-panel"><div class="auth-form-wrap setup-wrap"><p class="eyebrow">Étape unique</p><h2>Quel parc gérez-vous ?</h2>${error ? `<div class="form-error">${escapeHtml(error)}</div>` : ""}
      <form id="setup-form" class="form-stack"><label>Nom du parc<input name="parcName" maxlength="100" required autofocus placeholder="Ex. Parc des Tilleuls"></label><fieldset><legend>Lieux et zones à gérer</legend><div id="setup-areas">${areaRow(0)}</div><button type="button" class="button ghost" id="add-setup-area">+ Ajouter un lieu</button></fieldset><button class="button primary" type="submit">Créer mon espace ParcOS</button></form>
    </div></section></main>`;
  const areasRoot = document.querySelector("#setup-areas");
  document.querySelector("#add-setup-area").addEventListener("click", () => {
    if (areasRoot.children.length >= 20) return showToast("Maximum 20 lieux lors de la configuration.");
    areasRoot.insertAdjacentHTML("beforeend", areaRow(areasRoot.children.length));
  });
  areasRoot.addEventListener("click", (event) => {
    if (event.target.matches(".remove-setup-area")) event.target.closest("[data-setup-area]").remove();
  });
  document.querySelector("#setup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const areas = [...areasRoot.querySelectorAll("[data-setup-area]")].map((row) => ({
        name: row.querySelector("[name=areaName]").value,
        codePrefix: row.querySelector("[name=areaPrefix]").value,
        membersCanAccess: row.querySelector("[name=membersCanAccess]").checked,
      }));
      const result = await api("/api/setup", { method: "POST", body: JSON.stringify({ parcName: new FormData(event.currentTarget).get("parcName"), areas }) });
      state.setupRequired = result.setupRequired;
      state.parcName = result.parcName;
      await Promise.all([loadAreas(), loadBeds(), loadEvents(), loadMembers()]);
      renderApp();
      showToast("Votre espace ParcOS est prêt.");
    } catch (setupError) {
      renderSetup(setupError.message);
    }
  });
}

function renderInvite(token, error = "") {
  modalRoot.innerHTML = "";
  app.innerHTML = `<main class="auth-page invitation-page">
    <section class="auth-visual invitation-visual">
      <div class="auth-brand"><span class="brand-mark">P</span><span><strong>Le Potager</strong><small>du Parc Parmentier</small></span></div>
      <div><p class="eyebrow light">Invitation personnelle</p><h1>Votre place<br>au potager.</h1><p>Créez votre profil privé ParcOS. Aucune adresse e-mail n’est demandée.</p></div>
    </section>
    <section class="auth-panel"><div class="auth-form-wrap">
      <p class="eyebrow">Nouveau membre</p><h2>Créer mon profil</h2>
      ${error ? `<div class="form-error">${escapeHtml(error)}</div>` : ""}
      <form id="invite-form" class="form-stack">
        <label>Votre nom<input name="displayName" autocomplete="name" required autofocus placeholder="Ex. Louis Berghmans"></label>
        <label>Choisissez un nom d’utilisateur<input name="username" autocomplete="username" required minlength="3" placeholder="Ex. louis"></label>
        <label>Choisissez un mot de passe<input name="password" type="password" autocomplete="new-password" required minlength="12"><small>12 caractères minimum. Un coordinateur pourra réinitialiser votre accès si nécessaire.</small></label>
        <button class="button primary" type="submit">Créer mon profil</button>
      </form>
    </div></section>
  </main>`;
  document.querySelector("#invite-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await api("/api/invites/redeem", { method: "POST", body: JSON.stringify({ token, displayName: data.get("displayName"), username: data.get("username"), password: data.get("password") }) });
      state.member = result.member;
      state.csrfToken = result.csrfToken;
      history.replaceState({}, "", "/");
      await Promise.all([loadAreas(), loadBeds(), loadEvents(), loadMembers()]);
      renderApp();
      showToast("Bienvenue dans ParcOS !");
    } catch (inviteError) {
      renderInvite(token, inviteError.message);
    }
  });
}

function renderReset(token, error = "") {
  modalRoot.innerHTML = "";
  app.innerHTML = `<main class="auth-page invitation-page">
    <section class="auth-visual invitation-visual"><div class="auth-brand"><span class="brand-mark">P</span><span><strong>Le Potager</strong><small>du Parc Parmentier</small></span></div><div><p class="eyebrow light">Récupération du profil</p><h1>Un nouvel accès,<br>le même profil.</h1><p>Choisissez un nouveau mot de passe. Ce lien ne peut être utilisé qu’une fois.</p></div></section>
    <section class="auth-panel"><div class="auth-form-wrap"><p class="eyebrow">Accès ParcOS</p><h2>Nouveau mot de passe</h2>${error ? `<div class="form-error">${escapeHtml(error)}</div>` : ""}<form id="reset-form" class="form-stack"><label>Nouveau mot de passe<input name="password" type="password" autocomplete="new-password" minlength="12" required><small>12 caractères minimum.</small></label><button class="button primary" type="submit">Retrouver mon profil</button></form></div></section>
  </main>`;
  document.querySelector("#reset-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const password = new FormData(event.currentTarget).get("password");
      const result = await api("/api/access/reset", { method: "POST", body: JSON.stringify({ token, password }) });
      state.member = result.member;
      state.csrfToken = result.csrfToken;
      history.replaceState({}, "", "/");
      await Promise.all([loadAreas(), loadBeds(), loadEvents(), loadMembers()]);
      renderApp();
      showToast("Votre accès a été renouvelé.");
    } catch (resetError) {
      renderReset(token, resetError.message);
    }
  });
}

function shell(content) {
  return `<div class="app-shell">
    <header class="topbar">
      <button class="brand-button" data-page="today"><span class="brand-mark small">P</span><span><strong>ParcOS</strong><small>${escapeHtml(state.parcName)}</small></span></button>
      <button class="avatar-button" data-page="profile" aria-label="Ouvrir mon profil">${escapeHtml(initials(state.member.displayName))}</button>
    </header>
    <main class="main-content">${content}</main>
    <nav class="bottom-nav" aria-label="Navigation principale">
      <button data-page="today" class="${state.page === "today" ? "active" : ""}"><span>⌂</span>Aujourd’hui</button>
      <button data-page="agenda" class="${state.page === "agenda" ? "active" : ""}"><span>□</span>Agenda</button>
      <button data-page="garden" class="${state.page === "garden" ? "active" : ""}"><span>♧</span>Potager</button>
      <button data-page="profile" class="${state.page === "profile" ? "active" : ""}"><span>○</span>Profil</button>
    </nav>
  </div>`;
}

function renderApp() {
  if (!state.member) return renderLogin();
  if (state.setupRequired) return renderSetup();
  const page = state.page === "agenda" ? renderAgenda() : state.page === "garden" ? renderGarden() : state.page === "profile" ? renderProfile() : renderToday();
  app.innerHTML = shell(page);
  bindShell();
}

function renderToday() {
  const harvest = state.beds.filter((bed) => bed.status === "harvest");
  const attention = state.beds.filter((bed) => ["clear", "unknown"].includes(bed.status));
  const noPhoto = state.beds.filter((bed) => !bed.photoUrl).length;
  const nextEvent = state.events.find((event) => new Date(event.endsAt) >= new Date() && event.state === "published");
  return `<section class="page today-page">
    <div class="welcome-row"><div><p class="eyebrow">Bonjour ${escapeHtml(state.member.displayName.split(" ")[0])}</p><h1>Que se passe-t-il<br>au potager ?</h1></div><span class="date-badge">${escapeHtml(new Intl.DateTimeFormat("fr-BE", { weekday: "short", day: "numeric", month: "short" }).format(new Date()))}</span></div>
    <article class="hero-card"><div><span class="hero-kicker">Le potager aujourd’hui</span><h2>${harvest.length} planche${harvest.length === 1 ? "" : "s"} à récolter</h2><p>${attention.length} zone${attention.length === 1 ? "" : "s"} demande${attention.length === 1 ? "" : "nt"} de l’attention.</p><button class="button light" data-page="garden">Voir les planches</button></div></article>
    <div class="section-heading"><div><p class="eyebrow">Prochain rendez-vous</p><h2>À l’agenda</h2></div><button class="text-link" data-page="agenda">Tout voir</button></div>
    ${nextEvent ? compactEventCard(nextEvent) : '<div class="empty-state"><strong>Rien de prévu pour le moment</strong><p>Les prochains rendez-vous apparaîtront ici.</p></div>'}
    <div class="section-heading"><div><p class="eyebrow">En un coup d’œil</p><h2>État du potager</h2></div></div>
    <div class="stat-grid">
      <button data-filter-link="harvest"><strong>${harvest.length}</strong><span>À récolter</span></button>
      <button data-filter-link="ready"><strong>${state.beds.filter((bed) => bed.status === "ready").length}</strong><span>Disponibles</span></button>
      <button data-filter-link="clear"><strong>${attention.length}</strong><span>À vérifier</span></button>
      <button data-filter-link="no-photo"><strong>${noPhoto}</strong><span>Sans photo</span></button>
    </div>
    ${harvest.length ? `<div class="section-heading compact"><div><p class="eyebrow">Récolte ouverte</p><h2>Prêt maintenant</h2></div></div><div class="mini-bed-list">${harvest.slice(0, 4).map(miniBed).join("")}</div>` : ""}
  </section>`;
}

function compactEventCard(event) {
  const meta = eventTypeMeta[event.type] || eventTypeMeta.work;
  const registration = event.registration;
  return `<button class="next-event-card" data-event-id="${event.id}">
    <span class="event-date-block"><strong>${escapeHtml(formatEventDate(event.startsAt, { day: "2-digit" }))}</strong><small>${escapeHtml(formatEventDate(event.startsAt, { month: "short" }))}</small></span>
    <span class="event-card-copy"><small>${escapeHtml(meta.label)} · ${escapeHtml(formatTime(event.startsAt))}</small><strong>${escapeHtml(event.title)}</strong><span>⌖ ${escapeHtml(event.location)}</span></span>
    ${registration && registration.status !== "cancelled" ? `<span class="registration-dot ${registration.status}">${registration.status === "waitlisted" ? "En attente" : "Inscrit"}</span>` : '<b>›</b>'}
  </button>`;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek(value) {
  const date = startOfDay(value);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

function addDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function localDateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarRange() {
  const selected = startOfDay(state.calendarDate);
  if (state.calendarView === "day") return { start: selected, end: addDays(selected, 1) };
  if (state.calendarView === "week") {
    const start = startOfWeek(selected);
    return { start, end: addDays(start, 7) };
  }
  const start = new Date(selected.getFullYear(), selected.getMonth(), 1);
  return { start, end: new Date(selected.getFullYear(), selected.getMonth() + 1, 1) };
}

function calendarRangeLabel() {
  const { start, end } = calendarRange();
  if (state.calendarView === "day") return formatEventDate(start, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (state.calendarView === "week") {
    const lastDay = addDays(end, -1);
    return `Semaine du ${formatEventDate(start, { day: "numeric", month: "short" })} au ${formatEventDate(lastDay, { day: "numeric", month: "short" })}`;
  }
  return formatEventDate(start, { month: "long", year: "numeric" });
}

function renderMonthCalendar() {
  const selected = startOfDay(state.calendarDate);
  const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  const monthEnd = new Date(selected.getFullYear(), selected.getMonth() + 1, 1);
  const lastWeekEnd = addDays(startOfWeek(monthEnd), 7);
  const cellCount = Math.round((lastWeekEnd - gridStart) / 86400_000);
  const todayKey = localDateKey(new Date());
  const selectedKey = localDateKey(selected);
  const selectedRange = calendarRange();
  const eventCounts = new Map();
  for (const event of state.events) {
    const key = localDateKey(event.startsAt);
    eventCounts.set(key, (eventCounts.get(key) || 0) + 1);
  }
  const weekdays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
    .map((day) => `<span class="calendar-weekday">${day}</span>`).join("");
  const days = Array.from({ length: cellCount }, (_, index) => {
    const date = addDays(gridStart, index);
    const key = localDateKey(date);
    const count = eventCounts.get(key) || 0;
    const inRange = date >= selectedRange.start && date < selectedRange.end;
    const classes = [
      "calendar-day",
      date.getMonth() !== selected.getMonth() ? "outside" : "",
      key === todayKey ? "today" : "",
      key === selectedKey ? "selected" : "",
      state.calendarView !== "month" && inRange ? "in-range" : "",
      count ? "has-event" : "",
    ].filter(Boolean).join(" ");
    const eventLabel = count ? `, ${count} événement${count === 1 ? "" : "s"}` : "";
    return `<button class="${classes}" data-calendar-day="${key}" aria-label="${escapeHtml(formatEventDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}${eventLabel}" aria-pressed="${key === selectedKey}"><span>${date.getDate()}</span>${count ? `<small>${count}</small>` : ""}</button>`;
  }).join("");
  return `<div class="calendar-grid" aria-label="Calendrier de ${escapeHtml(formatEventDate(monthStart, { month: "long", year: "numeric" }))}">${weekdays}${days}</div>`;
}

function renderAgenda() {
  const { start, end } = calendarRange();
  const visible = state.events.filter((event) => {
    const eventStart = new Date(event.startsAt);
    const matchesPeriod = eventStart >= start && eventStart < end;
    const matchesRegistration = state.eventFilter !== "mine" || (event.registration && event.registration.status !== "cancelled");
    return matchesPeriod && matchesRegistration;
  });
  const grouped = new Map();
  for (const event of visible) {
    const key = localDateKey(event.startsAt);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(event);
  }
  const monthLabel = formatEventDate(state.calendarDate, { month: "long", year: "numeric" });
  return `<section class="page agenda-page">
    <div class="page-title"><div><p class="eyebrow">Cultiver ensemble</p><h1>Agenda</h1><p class="lede">Chantiers, ateliers et moments partagés au potager.</p></div>${isCoordinator() ? '<button class="round-add" id="create-event" aria-label="Créer un événement">+</button>' : ""}</div>
    <div class="calendar-card">
      <div class="calendar-toolbar"><button class="calendar-nav" data-calendar-nav="previous" aria-label="Mois précédent">‹</button><strong>${escapeHtml(monthLabel)}</strong><button class="calendar-nav" data-calendar-nav="next" aria-label="Mois suivant">›</button></div>
      <button class="calendar-today" id="calendar-today">Aujourd’hui</button>
      ${renderMonthCalendar()}
    </div>
    <div class="calendar-view-switch" aria-label="Période affichée">${[["day", "Jour"], ["week", "Semaine"], ["month", "Mois"]].map(([value, label]) => `<button data-calendar-view="${value}" class="${state.calendarView === value ? "active" : ""}" aria-pressed="${state.calendarView === value}">${label}</button>`).join("")}</div>
    <div class="agenda-selection"><div><p class="eyebrow">Événements affichés</p><h2>${escapeHtml(calendarRangeLabel())}</h2></div><span>${visible.length}</span></div>
    <div class="filter-row event-filters">${[["all", "Tous les événements"], ["mine", "Mes inscriptions"]].map(([value, label]) => `<button data-event-filter="${value}" class="${state.eventFilter === value ? "active" : ""}">${label}</button>`).join("")}</div>
    <div class="agenda-list" aria-live="polite">${grouped.size ? [...grouped.values()].map((events) => `<section class="event-day-group"><div class="event-day-heading"><strong>${escapeHtml(formatEventDate(events[0].startsAt, { weekday: "long", day: "numeric" }))}</strong><span>${escapeHtml(formatEventDate(events[0].startsAt, { month: "long" }))}</span></div>${events.map(eventCard).join("")}</section>`).join("") : '<div class="empty-state"><strong>Aucun rendez-vous pour cette période</strong><p>Choisissez un autre jour, une autre semaine ou un autre mois.</p></div>'}</div>
  </section>`;
}

function eventCard(event) {
  const meta = eventTypeMeta[event.type] || eventTypeMeta.work;
  const coverUrl = eventCoverUrl(event);
  const registration = event.registration;
  const capacity = event.capacity === null ? `${event.attendeeCount} inscrit${event.attendeeCount === 1 ? "" : "s"}` : `${event.attendeeCount}/${event.capacity} participants`;
  return `<button class="agenda-event-card type-${event.type} ${event.state === "cancelled" ? "cancelled" : ""}" data-event-id="${event.id}">
    ${coverUrl ? `<span class="event-card-thumb"><img src="${coverUrl}" alt="" loading="lazy"></span>` : `<span class="event-icon">${meta.icon}</span>`}<span class="event-card-copy"><small>${escapeHtml(formatTime(event.startsAt))}–${escapeHtml(formatTime(event.endsAt))} · ${escapeHtml(meta.label)}</small><strong>${escapeHtml(event.title)}</strong><span>⌖ ${escapeHtml(event.location)} · ${escapeHtml(capacity)}</span></span>
    <span class="event-card-tail">${event.state !== "published" ? `<em class="state-pill ${event.state}">${escapeHtml(eventStateLabels[event.state])}</em>` : registration && registration.status !== "cancelled" ? `<em class="registration-dot ${registration.status}">${registration.status === "waitlisted" ? "Attente" : "Inscrit"}</em>` : "›"}</span>
  </button>`;
}

function miniBed(bed) {
  return `<button class="mini-bed" data-bed-id="${bed.id}">${thumbnail(bed)}<span><small>${escapeHtml(bed.code)} · ${escapeHtml(bed.section)}</small><strong>${escapeHtml(bed.crop || "Planche disponible")}</strong></span><b>›</b></button>`;
}

function thumbnail(bed, large = false) {
  if (bed.photoUrl) return `<span class="bed-thumb ${large ? "large" : ""}"><img src="${escapeHtml(bed.photoUrl)}" alt="Photo de la planche ${escapeHtml(bed.number)}" loading="lazy"></span>`;
  return `<span class="bed-thumb placeholder ${large ? "large" : ""}"><b>${escapeHtml(String(bed.number).padStart(2, "0"))}</b><small>Photo à ajouter</small></span>`;
}

function filteredBeds() {
  const query = state.search.trim().toLocaleLowerCase("fr");
  return state.beds.filter((bed) => {
    const areaMatch = state.selectedAreaId === null || bed.areaId === state.selectedAreaId;
    const filterMatch = state.filter === "all" || (state.filter === "no-photo" ? !bed.photoUrl : bed.status === state.filter);
    const haystack = [bed.code, bed.number, bed.garden, bed.section, bed.locationHint, bed.crop, bed.variety].join(" ").toLocaleLowerCase("fr");
    return areaMatch && filterMatch && (!query || haystack.includes(query));
  });
}

function renderGarden() {
  const beds = filteredBeds();
  const area = state.areas.find((item) => item.id === state.selectedAreaId) || state.areas[0];
  const groups = [...new Set(beds.map((bed) => bed.section))];
  return `<section class="page garden-page">
    <div class="page-title"><div><p class="eyebrow">Se repérer sur place</p><h1>Les potagers</h1><p class="lede">Chaque lieu, ses accès et ses planches.</p></div>${isCoordinator() ? '<button class="round-add" id="manage-areas" aria-label="Gérer les lieux">⚙</button>' : ""}</div>
    <div class="area-switcher">${state.areas.map((item) => `<button data-area-id="${item.id}" class="${item.id === area?.id ? "active" : ""}"><span><strong>${escapeHtml(item.name)}</strong><small>${item.bedCount} planche${item.bedCount === 1 ? "" : "s"}</small></span>${!item.membersCanAccess ? '<em>Coordination</em>' : ""}</button>`).join("")}</div>
    ${area ? `<div class="area-intro"><div><p class="eyebrow">${area.membersCanAccess ? "Accessible aux membres" : "Accès coordinateurs"}</p><h2>${escapeHtml(area.name)}</h2><p>${escapeHtml(area.description || area.locationHint || "Lieu du potager partagé.")}</p></div>${isCoordinator() ? '<button class="button secondary" id="add-bed">+ Ajouter une planche</button>' : ""}</div>` : ""}
    <label class="search-box"><span>⌕</span><input id="bed-search" type="search" value="${escapeHtml(state.search)}" placeholder="Numéro, culture ou emplacement…" aria-label="Rechercher une planche"></label>
    <div class="filter-row">
      ${[["all", "Toutes"], ["harvest", "À récolter"], ["growing", "Ça pousse"], ["ready", "Disponibles"], ["clear", "À nettoyer"], ["no-photo", "Sans photo"]].map(([value, label]) => `<button data-filter="${value}" class="${state.filter === value ? "active" : ""}">${label}</button>`).join("")}
    </div>
    ${groups.length ? groups.map((group) => `<section class="bed-group"><div class="group-heading"><h2>${escapeHtml(group)}</h2><span>${beds.filter((bed) => bed.section === group).length}</span></div><div class="bed-card-list">${beds.filter((bed) => bed.section === group).map(bedCard).join("")}</div></section>`).join("") : `<div class="empty-state"><strong>Aucune planche trouvée</strong><p>${isCoordinator() ? "Ajoutez une première planche ou changez de filtre." : "Essayez un autre filtre ou terme de recherche."}</p></div>`}
  </section>`;
}

function bedCard(bed) {
  const status = statusMeta[bed.status] || statusMeta.unknown;
  return `<button class="bed-card" data-bed-id="${bed.id}">
    ${thumbnail(bed)}
    <span class="bed-card-body"><span class="bed-card-location"><b>${escapeHtml(bed.code)}</b>${escapeHtml(bed.garden)} · ${escapeHtml(bed.section)}</span><strong>${escapeHtml(bed.crop || "Planche disponible")}</strong><small>${escapeHtml(bed.variety || bed.locationHint || "Culture à préciser")}</small><span class="bed-updated">Mis à jour ${escapeHtml(relativeDate(bed.updatedAt).toLowerCase())}</span></span>
    <span class="status-badge ${status.tone}">${escapeHtml(status.label)}</span>
  </button>`;
}

function renderProfile() {
  const registrations = state.events.filter((event) => event.registration && event.registration.status !== "cancelled" && new Date(event.endsAt) >= new Date());
  return `<section class="page profile-page">
    <div class="profile-hero"><span class="profile-avatar">${escapeHtml(initials(state.member.displayName))}</span><h1>${escapeHtml(state.member.displayName)}</h1><p>${escapeHtml(roleLabels[state.member.role])} · @${escapeHtml(state.member.username)}</p></div>
    <section class="panel"><div class="section-heading compact"><div><p class="eyebrow">À venir</p><h2>Mes inscriptions</h2></div><span class="count-pill">${registrations.length}</span></div>${registrations.length ? `<div class="profile-event-list">${registrations.map(compactEventCard).join("")}</div>` : '<p class="muted">Vous n’êtes inscrit à aucun événement à venir.</p>'}</section>
    <section class="panel"><div class="section-heading compact"><div><p class="eyebrow">Mon compte</p><h2>Mon profil</h2></div></div>
      <form id="profile-form" class="form-stack compact-form">
        <label>Nom affiché<input name="displayName" value="${escapeHtml(state.member.displayName)}" required></label>
        <label>À propos<textarea name="bio" maxlength="400" placeholder="Votre rôle ou ce que vous aimez faire au potager…">${escapeHtml(state.member.bio)}</textarea></label>
        <label>Langue<select name="preferredLocale"><option value="fr" ${state.member.preferredLocale === "fr" ? "selected" : ""}>Français</option><option value="nl" ${state.member.preferredLocale === "nl" ? "selected" : ""}>Nederlands</option><option value="en" ${state.member.preferredLocale === "en" ? "selected" : ""}>English</option></select></label>
        <label>Mot de passe actuel <small>(requis pour le modifier)</small><input name="currentPassword" type="password" autocomplete="current-password"></label>
        <label>Nouveau mot de passe <small>(facultatif)</small><input name="newPassword" type="password" autocomplete="new-password" minlength="12"></label>
        <button class="button primary" type="submit">Enregistrer mon profil</button>
      </form>
    </section>
    ${isCoordinator() ? `<section class="panel coordinator-panel"><div class="section-heading compact"><div><p class="eyebrow">Coordination</p><h2>Inviter un membre</h2></div></div><p class="muted">Créez un lien valable 7 jours et partagez-le par votre canal habituel.</p><form id="invite-create-form" class="inline-form"><select name="role"><option value="member">Membre</option>${state.member.role === "admin" ? '<option value="coordinator">Coordinateur</option>' : ""}</select><button class="button secondary" type="submit">Créer une invitation</button></form><div id="invite-result"></div></section>
    <section class="panel member-panel"><div class="section-heading compact"><div><p class="eyebrow">Profils</p><h2>Les membres</h2></div><span class="count-pill">${state.members.length}</span></div><div class="member-list">${state.members.map((member) => `<div class="member-row"><span class="avatar-button">${escapeHtml(initials(member.displayName))}</span><span><strong>${escapeHtml(member.displayName)}</strong><small>${escapeHtml(roleLabels[member.role])} · @${escapeHtml(member.username)}</small></span>${member.id !== state.member.id && (member.role === "member" || state.member.role === "admin") ? `<button class="reset-link-button" data-reset-member="${member.id}">Nouvel accès</button>` : ""}</div>`).join("")}</div><div id="reset-result"></div></section>` : ""}
    <button class="button ghost logout-button" id="logout-button">Se déconnecter</button>
  </section>`;
}

function bindShell() {
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
    state.page = button.dataset.page;
    renderApp();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  document.querySelectorAll("[data-filter-link]").forEach((button) => button.addEventListener("click", () => {
    state.page = "garden";
    state.filter = button.dataset.filterLink;
    renderApp();
  }));
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    renderApp();
  }));
  document.querySelectorAll("[data-area-id]").forEach((button) => button.addEventListener("click", () => {
    state.selectedAreaId = Number(button.dataset.areaId);
    state.filter = "all";
    state.search = "";
    renderApp();
  }));
  document.querySelector("#bed-search")?.addEventListener("input", (event) => {
    const caret = event.target.selectionStart;
    state.search = event.target.value;
    renderApp();
    const next = document.querySelector("#bed-search");
    next.focus();
    next.setSelectionRange(caret, caret);
  });
  document.querySelectorAll("[data-bed-id]").forEach((button) => button.addEventListener("click", () => openBed(Number(button.dataset.bedId))));
  document.querySelector("#manage-areas")?.addEventListener("click", renderAreasManager);
  document.querySelector("#add-bed")?.addEventListener("click", renderCreateBedForm);
  document.querySelectorAll("[data-event-id]").forEach((button) => button.addEventListener("click", () => openEvent(Number(button.dataset.eventId))));
  document.querySelectorAll("[data-calendar-nav]").forEach((button) => button.addEventListener("click", () => {
    const next = new Date(state.calendarDate);
    next.setDate(1);
    next.setMonth(next.getMonth() + (button.dataset.calendarNav === "next" ? 1 : -1));
    state.calendarDate = next;
    renderApp();
  }));
  document.querySelectorAll("[data-calendar-day]").forEach((button) => button.addEventListener("click", () => {
    state.calendarDate = new Date(`${button.dataset.calendarDay}T12:00:00`);
    state.calendarView = "day";
    renderApp();
  }));
  document.querySelectorAll("[data-calendar-view]").forEach((button) => button.addEventListener("click", () => {
    state.calendarView = button.dataset.calendarView;
    renderApp();
  }));
  document.querySelector("#calendar-today")?.addEventListener("click", () => {
    state.calendarDate = new Date();
    state.calendarView = "day";
    renderApp();
  });
  document.querySelectorAll("[data-event-filter]").forEach((button) => button.addEventListener("click", () => {
    state.eventFilter = button.dataset.eventFilter;
    renderApp();
  }));
  document.querySelector("#create-event")?.addEventListener("click", () => renderEventForm());
  document.querySelector("#profile-form")?.addEventListener("submit", saveProfile);
  document.querySelector("#invite-create-form")?.addEventListener("submit", createInvite);
  document.querySelectorAll("[data-reset-member]").forEach((button) => button.addEventListener("click", () => createResetLink(Number(button.dataset.resetMember))));
  document.querySelector("#logout-button")?.addEventListener("click", logout);
}

async function loadAreas() {
  const result = await api("/api/areas");
  state.areas = result.areas;
  if (!state.areas.some((area) => area.id === state.selectedAreaId)) state.selectedAreaId = state.areas[0]?.id ?? null;
}

async function loadBeds() {
  const result = await api("/api/beds");
  state.beds = result.beds;
}

async function loadEvents() {
  const result = await api("/api/events");
  state.events = result.events;
}

async function loadMembers() {
  if (!isCoordinator()) return;
  const result = await api("/api/members");
  state.members = result.members;
}

function renderAreasManager() {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="areas-title"><div class="sheet-handle"></div><button class="sheet-close" data-close-modal aria-label="Fermer">×</button><div class="sheet-content form-sheet"><p class="eyebrow">Architecture du potager</p><h2 id="areas-title">Gérer les lieux</h2><p class="muted">Les lieux réservés restent entièrement invisibles aux membres, y compris leurs planches et leurs photos.</p>
    <div class="area-admin-list">${state.areas.map((area) => `<form class="area-admin-card" data-area-form="${area.id}"><div class="area-admin-heading"><span class="area-code">${escapeHtml(area.codePrefix)}</span><span><strong>${escapeHtml(area.name)}</strong><small>${area.bedCount} planche${area.bedCount === 1 ? "" : "s"}</small></span></div><div class="two-fields"><label>Nom<input name="name" value="${escapeHtml(area.name)}" required></label><label>Préfixe<input name="codePrefix" value="${escapeHtml(area.codePrefix)}" maxlength="6" required></label></div><label>Description<textarea name="description" maxlength="800">${escapeHtml(area.description)}</textarea></label><label>Repère sur place<input name="locationHint" value="${escapeHtml(area.locationHint)}"></label><label class="access-toggle"><input name="membersCanAccess" type="checkbox" ${area.membersCanAccess ? "checked" : ""}><span><strong>Accessible aux membres</strong><small>Si désactivé, seuls les coordinateurs voient ce lieu.</small></span></label><button class="button secondary" type="submit">Enregistrer ${escapeHtml(area.name)}</button></form>`).join("")}</div>
    <form id="area-create-form" class="form-stack new-area-form"><div><p class="eyebrow">Nouveau</p><h3>Ajouter un lieu</h3></div><div class="two-fields"><label>Nom<input name="name" required placeholder="Ex. Verger"></label><label>Préfixe<input name="codePrefix" required minlength="2" maxlength="6" placeholder="VG"></label></div><label>Description<textarea name="description" maxlength="800"></textarea></label><label>Repère sur place<input name="locationHint"></label><label class="access-toggle"><input name="membersCanAccess" type="checkbox" checked><span><strong>Accessible aux membres</strong><small>Vous pourrez modifier cet accès plus tard.</small></span></label><button class="button primary" type="submit">Ajouter le lieu</button></form>
  </div></section></div>`;
  bindModal();
  document.querySelectorAll("[data-area-form]").forEach((form) => form.addEventListener("submit", saveArea));
  document.querySelector("#area-create-form").addEventListener("submit", createArea);
}

async function saveArea(submitEvent) {
  submitEvent.preventDefault();
  const form = submitEvent.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.membersCanAccess = form.elements.membersCanAccess.checked;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await api(`/api/areas/${form.dataset.areaForm}`, { method: "PATCH", body: JSON.stringify(data) });
    await Promise.all([loadAreas(), loadBeds()]);
    renderAreasManager();
    showToast("Lieu mis à jour.");
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
}

async function createArea(submitEvent) {
  submitEvent.preventDefault();
  const form = submitEvent.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.membersCanAccess = form.elements.membersCanAccess.checked;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const result = await api("/api/areas", { method: "POST", body: JSON.stringify(data) });
    await Promise.all([loadAreas(), loadBeds()]);
    state.selectedAreaId = result.area.id;
    renderAreasManager();
    showToast("Nouveau lieu ajouté.");
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
}

function renderCreateBedForm() {
  const area = state.areas.find((item) => item.id === state.selectedAreaId);
  if (!area) return;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="new-bed-title"><div class="sheet-handle"></div><button class="sheet-close" data-close-modal aria-label="Fermer">×</button><div class="sheet-content form-sheet"><p class="eyebrow">${escapeHtml(area.name)}</p><h2 id="new-bed-title">Ajouter une planche</h2><p class="muted">Le prochain numéro et le code ${escapeHtml(area.codePrefix)} seront proposés automatiquement.</p><form id="bed-create-form" class="form-stack bed-edit-form"><div class="two-fields"><label>Numéro <small>(automatique si vide)</small><input name="number" type="number" min="1" max="999" placeholder="${area.bedCount + 1}"></label><label>Code <small>(facultatif)</small><input name="code" maxlength="16" placeholder="${escapeHtml(area.codePrefix)}-${String(area.bedCount + 1).padStart(2, "0")}"></label></div><label>Secteur<input name="section" value="${escapeHtml(area.name)}" required></label><div class="two-fields"><label>Culture<input name="crop" placeholder="Ex. Tomates"></label><label>Variété<input name="variety"></label></div><label>État<select name="status">${Object.entries(statusMeta).map(([value, meta]) => `<option value="${value}" ${value === "unknown" ? "selected" : ""}>${escapeHtml(meta.label)}</option>`).join("")}</select></label><label>Repère sur place<input name="locationHint" value="${escapeHtml(area.locationHint)}"></label><label>Note du potager<textarea name="note"></textarea></label><div class="button-row"><button type="button" class="button ghost" id="cancel-bed-create">Annuler</button><button class="button primary" type="submit">Ajouter la planche</button></div></form></div></section></div>`;
  bindModal();
  document.querySelector("#cancel-bed-create").addEventListener("click", dismissModal);
  document.querySelector("#bed-create-form").addEventListener("submit", createBed);
}

async function createBed(submitEvent) {
  submitEvent.preventDefault();
  const form = submitEvent.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const result = await api(`/api/areas/${state.selectedAreaId}/beds`, { method: "POST", body: JSON.stringify(data) });
    await Promise.all([loadAreas(), loadBeds()]);
    dismissModal();
    renderApp();
    showToast(`Planche ${result.bed.code} ajoutée.`);
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
}

async function openEvent(id) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="sheet loading-sheet"><div class="sheet-handle"></div><p>Ouverture de l’événement…</p></section></div>`;
  try {
    state.selectedEvent = await api(`/api/events/${id}`);
    renderEventSheet();
  } catch (error) {
    modalRoot.innerHTML = "";
    showToast(error.message);
  }
}

function renderEventSheet() {
  const { event, registrations = [] } = state.selectedEvent;
  const meta = eventTypeMeta[event.type] || eventTypeMeta.work;
  const coverUrl = eventCoverUrl(event);
  const registration = event.registration;
  const activeRegistration = registration && registration.status !== "cancelled";
  const capacity = event.capacity === null ? `${event.attendeeCount} participant${event.attendeeCount === 1 ? "" : "s"}` : `${event.attendeeCount} participant${event.attendeeCount === 1 ? "" : "s"} · ${event.spotsRemaining} place${event.spotsRemaining === 1 ? "" : "s"} libre${event.spotsRemaining === 1 ? "" : "s"}`;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="sheet event-sheet" role="dialog" aria-modal="true" aria-labelledby="event-title"><div class="sheet-handle"></div><button class="sheet-close" data-close-modal aria-label="Fermer">×</button>
    <div class="event-sheet-hero type-${event.type} ${coverUrl ? "permanence-cover" : ""}"><span class="event-hero-icon">${meta.icon}</span><div><span class="event-type-label">${escapeHtml(meta.label)}</span><h2 id="event-title">${escapeHtml(event.title)}</h2></div></div>
    <div class="sheet-content">
      ${event.state !== "published" ? `<div class="event-state-banner ${event.state}"><strong>${escapeHtml(eventStateLabels[event.state])}</strong><span>${event.state === "cancelled" ? "Ce rendez-vous n’aura pas lieu." : event.state === "draft" ? "Visible uniquement par l’équipe de coordination." : "Ce rendez-vous est terminé."}</span></div>` : ""}
      <div class="event-facts"><div><span>□</span><p><small>Date et heure</small><strong>${escapeHtml(formatEventDate(event.startsAt))}</strong><b>${escapeHtml(formatTime(event.startsAt))}–${escapeHtml(formatTime(event.endsAt))}</b></p></div><div><span>⌖</span><p><small>Lieu</small><strong>${escapeHtml(event.location)}</strong><b>${escapeHtml(capacity)}</b></p></div></div>
      ${event.description ? `<div class="detail-section"><h3>Au programme</h3><p>${escapeHtml(event.description)}</p></div>` : ""}
      ${event.preparationNote ? `<div class="event-note"><small>À prévoir</small><p>${escapeHtml(event.preparationNote)}</p></div>` : ""}
      ${event.accessibilityNote ? `<div class="event-note accessibility"><small>Accessibilité</small><p>${escapeHtml(event.accessibilityNote)}</p></div>` : ""}
      ${event.state === "published" ? `<div class="event-registration-actions">${activeRegistration ? `<button class="button secondary" id="edit-registration">${registration.status === "waitlisted" ? "Modifier ma demande" : `Inscrit · ${registration.partySize} personne${registration.partySize === 1 ? "" : "s"}`}</button><button class="button ghost" id="cancel-registration">Me désinscrire</button>` : '<button class="button primary" id="join-event">Je participe</button>'}<a class="button ghost" href="/api/events/${event.id}/calendar.ics" download>Ajouter au calendrier</a></div>` : ""}
      <button class="button ghost share-event-button" id="share-event">Partager le rendez-vous</button>
      ${isCoordinator() ? `<div class="coordinator-event-tools"><button class="button secondary" id="edit-event">Modifier l’événement</button></div><div class="detail-section attendee-list"><h3>Inscriptions (${registrations.length})</h3>${registrations.length ? registrations.map((entry) => `<div class="attendee-row"><span class="avatar-button">${escapeHtml(initials(entry.memberName))}</span><span><strong>${escapeHtml(entry.memberName)}</strong><small>${entry.partySize} personne${entry.partySize === 1 ? "" : "s"} · ${entry.status === "waitlisted" ? "liste d’attente" : "inscrit"}</small></span></div>`).join("") : '<p class="muted">Aucune inscription pour le moment.</p>'}</div>` : ""}
    </div></section></div>`;
  bindModal();
  document.querySelector("#join-event")?.addEventListener("click", joinEventQuick);
  document.querySelector("#edit-registration")?.addEventListener("click", renderRegistrationForm);
  document.querySelector("#cancel-registration")?.addEventListener("click", cancelEventRegistration);
  document.querySelector("#edit-event")?.addEventListener("click", () => renderEventForm(event));
  document.querySelector("#share-event")?.addEventListener("click", shareEvent);
}

async function joinEventQuick() {
  const button = document.querySelector("#join-event");
  button.disabled = true;
  try {
    const result = await api(`/api/events/${state.selectedEvent.event.id}/registration`, { method: "POST", body: JSON.stringify({ adults: 1 }) });
    await loadEvents();
    state.selectedEvent = await api(`/api/events/${result.event.id}`);
    renderEventSheet();
    showToast(result.event.registration.status === "waitlisted" ? "Vous êtes sur la liste d’attente." : "Votre participation est confirmée.");
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
}

function renderRegistrationForm() {
  const event = state.selectedEvent.event;
  const registration = event.registration || { adults: 1, teenagers: 0, children: 0, youngChildren: 0 };
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="registration-title"><div class="sheet-handle"></div><button class="sheet-close" data-close-modal aria-label="Fermer">×</button><div class="sheet-content form-sheet"><p class="eyebrow">${escapeHtml(event.title)}</p><h2 id="registration-title">Qui vient avec vous ?</h2><p class="muted">Nous comptons uniquement les groupes d’âge, sans demander le nom des enfants.</p><form id="registration-form" class="form-stack event-form"><div class="registration-counts">${[["adults", "Adultes", "18 ans et +"], ["teenagers", "Ados", "13–17 ans"], ["children", "Enfants", "6–12 ans"], ["youngChildren", "Petits", "0–5 ans"]].map(([name, label, hint]) => `<label><span>${label}<small>${hint}</small></span><input name="${name}" type="number" min="0" max="20" value="${registration[name]}"></label>`).join("")}</div><div class="button-row"><button type="button" class="button ghost" id="back-to-event">Retour</button><button class="button primary" type="submit">Confirmer</button></div></form></div></section></div>`;
  bindModal();
  document.querySelector("#back-to-event").addEventListener("click", renderEventSheet);
  document.querySelector("#registration-form").addEventListener("submit", saveEventRegistration);
}

async function saveEventRegistration(submitEvent) {
  submitEvent.preventDefault();
  const form = submitEvent.currentTarget;
  const data = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, Number(value)]));
  form.querySelector("button[type=submit]").disabled = true;
  try {
    const result = await api(`/api/events/${state.selectedEvent.event.id}/registration`, { method: "POST", body: JSON.stringify(data) });
    await loadEvents();
    state.selectedEvent = await api(`/api/events/${result.event.id}`);
    renderEventSheet();
    showToast(result.event.registration.status === "waitlisted" ? "Inscription placée sur liste d’attente." : "Inscription mise à jour.");
  } catch (error) {
    form.querySelector("button[type=submit]").disabled = false;
    showToast(error.message);
  }
}

async function cancelEventRegistration() {
  try {
    const eventId = state.selectedEvent.event.id;
    await api(`/api/events/${eventId}/registration`, { method: "DELETE" });
    await loadEvents();
    state.selectedEvent = await api(`/api/events/${eventId}`);
    renderEventSheet();
    showToast("Votre inscription est annulée.");
  } catch (error) {
    showToast(error.message);
  }
}

async function shareEvent() {
  const event = state.selectedEvent.event;
  const url = `${location.origin}/?event=${event.id}`;
  const text = `${event.title} — ${formatEventDate(event.startsAt)} à ${formatTime(event.startsAt)}, ${event.location}`;
  try {
    if (navigator.share) await navigator.share({ title: event.title, text, url });
    else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      showToast("Lien de l’événement copié.");
    }
  } catch (error) {
    if (error.name !== "AbortError") showToast("Impossible de partager cet événement.");
  }
}

function renderEventForm(event = null) {
  const start = event ? new Date(event.startsAt) : new Date(Date.now() + 7 * 86400_000);
  if (!event) start.setHours(10, 0, 0, 0);
  const end = event ? new Date(event.endsAt) : new Date(start.getTime() + 2 * 3600_000);
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="event-form-title"><div class="sheet-handle"></div><button class="sheet-close" data-close-modal aria-label="Fermer">×</button><div class="sheet-content form-sheet"><p class="eyebrow">Coordination</p><h2 id="event-form-title">${event ? "Modifier l’événement" : "Nouveau rendez-vous"}</h2><form id="event-form" class="form-stack event-form">
    <label>Titre<input name="title" maxlength="140" required value="${escapeHtml(event?.title || "")}" placeholder="Ex. Désherbage collectif"></label>
    <div class="two-fields"><label>Début<input name="startsAt" type="datetime-local" required value="${datetimeLocalValue(start)}"></label><label>Fin<input name="endsAt" type="datetime-local" required value="${datetimeLocalValue(end)}"></label></div>
    <div class="two-fields"><label>Type<select name="type">${Object.entries(eventTypeMeta).map(([value, meta]) => `<option value="${value}" ${event?.type === value ? "selected" : ""}>${escapeHtml(meta.label)}</option>`).join("")}</select></label><label>Capacité <small>(vide = illimitée)</small><input name="capacity" type="number" min="1" max="1000" value="${escapeHtml(event?.capacity ?? "")}"></label></div>
    <label>Lieu<input name="location" maxlength="180" required value="${escapeHtml(event?.location || "Grand Potager")}"></label>
    <label>Description<textarea name="description" maxlength="3000" placeholder="Que va-t-on faire ?">${escapeHtml(event?.description || "")}</textarea></label>
    <label>À prévoir<textarea name="preparationNote" maxlength="1000" placeholder="Gants, vêtements, matériel…">${escapeHtml(event?.preparationNote || "")}</textarea></label>
    <label>Accessibilité<textarea name="accessibilityNote" maxlength="1000" placeholder="Accès, besoins particuliers…">${escapeHtml(event?.accessibilityNote || "")}</textarea></label>
    <div class="two-fields"><label>Visibilité<select name="audience"><option value="members" ${event?.audience !== "coordinators" ? "selected" : ""}>Tous les membres</option><option value="coordinators" ${event?.audience === "coordinators" ? "selected" : ""}>Coordinateurs</option></select></label><label>État<select name="state">${Object.entries(eventStateLabels).map(([value, label]) => `<option value="${value}" ${(event?.state || "published") === value ? "selected" : ""}>${label}</option>`).join("")}</select></label></div>
    <div class="button-row"><button type="button" class="button ghost" id="cancel-event-form">Annuler</button><button class="button primary" type="submit">${event ? "Enregistrer" : "Publier"}</button></div>
  </form></div></section></div>`;
  bindModal();
  document.querySelector("#cancel-event-form").addEventListener("click", () => event ? renderEventSheet() : dismissModal());
  document.querySelector("#event-form").addEventListener("submit", (submitEvent) => saveEvent(submitEvent, event));
}

async function saveEvent(submitEvent, existing) {
  submitEvent.preventDefault();
  const form = submitEvent.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.startsAt = new Date(data.startsAt).toISOString();
  data.endsAt = new Date(data.endsAt).toISOString();
  data.capacity = data.capacity ? Number(data.capacity) : null;
  form.querySelector("button[type=submit]").disabled = true;
  try {
    const path = existing ? `/api/events/${existing.id}` : "/api/events";
    const result = await api(path, { method: existing ? "PATCH" : "POST", body: JSON.stringify(data) });
    await loadEvents();
    state.selectedEvent = await api(`/api/events/${result.event.id}`);
    renderEventSheet();
    showToast(existing ? "Événement mis à jour." : "Événement publié dans l’agenda.");
  } catch (error) {
    form.querySelector("button[type=submit]").disabled = false;
    showToast(error.message);
  }
}

async function openBed(id) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="sheet loading-sheet"><div class="sheet-handle"></div><p>Ouverture de la planche…</p></section></div>`;
  try {
    const result = await api(`/api/beds/${id}`);
    state.selectedBed = result;
    renderBedSheet();
  } catch (error) {
    modalRoot.innerHTML = "";
    showToast(error.message);
  }
}

function renderBedSheet(editing = false) {
  const { bed, activities } = state.selectedBed;
  const status = statusMeta[bed.status] || statusMeta.unknown;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="bed-title"><div class="sheet-handle"></div><button class="sheet-close" data-close-modal aria-label="Fermer">×</button>
    <div class="bed-sheet-photo">${thumbnail(bed, true)}<span class="large-number">${escapeHtml(String(bed.number).padStart(2, "0"))}</span></div>
    <div class="sheet-content">
      <div class="detail-location"><span>${escapeHtml(bed.code)}</span>${escapeHtml(bed.garden)} · ${escapeHtml(bed.section)}</div>
      <div class="detail-title"><div><h2 id="bed-title">${escapeHtml(bed.crop || "Planche disponible")}</h2><p>${escapeHtml(bed.variety || "Aucune culture renseignée")}</p></div><span class="status-badge ${status.tone}">${escapeHtml(status.label)}</span></div>
      <div class="location-card"><span>⌖</span><div><small>Pour la trouver</small><strong>${escapeHtml(bed.locationHint || "Emplacement à préciser")}</strong></div></div>
      ${editing ? bedEditForm(bed) : `<div class="detail-section"><h3>Note du potager</h3><p>${escapeHtml(bed.note || "Aucune note pour le moment.")}</p></div>${bed.harvestNote ? `<div class="harvest-note"><small>Consigne de récolte</small><p>${escapeHtml(bed.harvestNote)}</p></div>` : ""}`}
      ${isCoordinator() && !editing ? `<div class="coordinator-actions"><button class="button primary" id="edit-bed-button">Modifier la planche</button><label class="button secondary file-button">Ajouter une photo<input id="bed-photo-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label></div>` : ""}
      ${!editing ? `<div class="detail-section history"><h3>Journal de la planche</h3>${activities.length ? activities.map((activity) => `<div class="activity"><i></i><span><strong>${escapeHtml(activity.note || "Mise à jour")}</strong><small>${escapeHtml(activity.memberName || "Membre")} · ${escapeHtml(relativeDate(activity.createdAt))}</small></span></div>`).join("") : '<p class="muted">Aucune activité enregistrée.</p>'}</div>` : ""}
    </div>
  </section></div>`;
  bindModal();
  document.querySelector("#edit-bed-button")?.addEventListener("click", () => renderBedSheet(true));
  document.querySelector("#cancel-edit")?.addEventListener("click", () => renderBedSheet(false));
  document.querySelector("#bed-edit-form")?.addEventListener("submit", saveBed);
  document.querySelector("#bed-photo-input")?.addEventListener("change", uploadBedPhoto);
}

function bedEditForm(bed) {
  return `<form id="bed-edit-form" class="form-stack bed-edit-form">
    <div class="two-fields"><label>Culture<input name="crop" value="${escapeHtml(bed.crop || "")}" placeholder="Ex. Tomates"></label><label>Variété<input name="variety" value="${escapeHtml(bed.variety || "")}"></label></div>
    <label>État<select name="status">${Object.entries(statusMeta).map(([value, meta]) => `<option value="${value}" ${bed.status === value ? "selected" : ""}>${escapeHtml(meta.label)}</option>`).join("")}</select></label>
    <div class="two-fields"><label>Secteur<input name="section" value="${escapeHtml(bed.section)}" required></label><label>Repère sur place<input name="locationHint" value="${escapeHtml(bed.locationHint || "")}"></label></div>
    <label>Note du potager<textarea name="note">${escapeHtml(bed.note || "")}</textarea></label>
    <label>Consigne de récolte<textarea name="harvestNote">${escapeHtml(bed.harvestNote || "")}</textarea></label>
    <label>Note pour le journal<input name="activityNote" placeholder="Ex. Désherbage terminé"></label>
    <div class="button-row"><button type="button" class="button ghost" id="cancel-edit">Annuler</button><button class="button primary" type="submit">Enregistrer</button></div>
  </form>`;
}

function bindModal() {
  document.querySelectorAll("[data-close-modal]").forEach((element) => element.addEventListener("click", (event) => {
    if (event.currentTarget === event.target || event.currentTarget.classList.contains("sheet-close")) {
      dismissModal();
    }
  }));
  document.removeEventListener("keydown", closeOnEscape);
  document.addEventListener("keydown", closeOnEscape);
}

function dismissModal() {
  modalRoot.innerHTML = "";
  state.selectedBed = null;
  state.selectedEvent = null;
  document.removeEventListener("keydown", closeOnEscape);
}

function closeOnEscape(event) {
  if (event.key === "Escape") dismissModal();
}

async function saveBed(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await api(`/api/beds/${state.selectedBed.bed.id}`, { method: "PATCH", body: JSON.stringify(data) });
    await loadBeds();
    const refreshed = await api(`/api/beds/${state.selectedBed.bed.id}`);
    state.selectedBed = refreshed;
    renderBedSheet(false);
    showToast("Planche mise à jour.");
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
}

async function compressPhoto(file) {
  if (file.size > 15 * 1024 * 1024) throw new Error("La photo d’origine est trop volumineuse.");
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

async function uploadBedPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const label = event.target.closest("label");
  label.classList.add("working");
  try {
    const dataUrl = await compressPhoto(file);
    await api(`/api/beds/${state.selectedBed.bed.id}/photos`, { method: "POST", body: JSON.stringify({ dataUrl }) });
    await loadBeds();
    state.selectedBed = await api(`/api/beds/${state.selectedBed.bed.id}`);
    renderBedSheet(false);
    showToast("Photo ajoutée.");
  } catch (error) {
    label.classList.remove("working");
    showToast(error.message);
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    const result = await api("/api/profile", { method: "PATCH", body: JSON.stringify(data) });
    state.member = result.member;
    renderApp();
    showToast("Profil enregistré.");
  } catch (error) {
    showToast(error.message);
  }
}

async function createInvite(event) {
  event.preventDefault();
  const role = new FormData(event.currentTarget).get("role");
  const resultBox = document.querySelector("#invite-result");
  try {
    const result = await api("/api/invites", { method: "POST", body: JSON.stringify({ role }) });
    resultBox.innerHTML = `<div class="invite-result"><small>Lien valable jusqu’au ${escapeHtml(formatDate(result.expiresAt, { day: "numeric", month: "long" }))}</small><input value="${escapeHtml(result.inviteUrl)}" readonly><button type="button" class="button primary" id="copy-invite">Copier le lien</button></div>`;
    document.querySelector("#copy-invite").addEventListener("click", async () => {
      await navigator.clipboard.writeText(result.inviteUrl);
      showToast("Lien d’invitation copié.");
    });
  } catch (error) {
    showToast(error.message);
  }
}

async function createResetLink(memberId) {
  const resultBox = document.querySelector("#reset-result");
  try {
    const result = await api(`/api/members/${memberId}/reset-link`, { method: "POST", body: "{}" });
    resultBox.innerHTML = `<div class="invite-result"><small>Lien de récupération valable 24 heures</small><input value="${escapeHtml(result.resetUrl)}" readonly><button type="button" class="button primary" id="copy-reset">Copier le lien</button></div>`;
    document.querySelector("#copy-reset").addEventListener("click", async () => {
      await navigator.clipboard.writeText(result.resetUrl);
      showToast("Lien de récupération copié.");
    });
  } catch (error) {
    showToast(error.message);
  }
}

async function logout() {
  try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch { /* The local session is cleared either way. */ }
  state.member = null;
  state.csrfToken = null;
  state.beds = [];
  state.areas = [];
  state.events = [];
  if ("caches" in window) {
    for (const key of await caches.keys()) await caches.delete(key);
  }
  renderLogin();
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const invitation = params.get("invite");
  if (invitation) return renderInvite(invitation);
  const reset = params.get("reset");
  if (reset) return renderReset(reset);
  try {
    const result = await api("/api/me");
    state.member = result.member;
    state.csrfToken = result.csrfToken;
    state.setupRequired = result.setupRequired;
    state.parcName = result.parcName;
    if (state.setupRequired) return renderSetup();
    await Promise.all([loadAreas(), loadBeds(), loadEvents(), loadMembers()]);
    renderApp();
    const eventId = Number(params.get("event"));
    if (eventId) openEvent(eventId);
  } catch {
    if (!state.member) renderLogin();
  }
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

boot();
