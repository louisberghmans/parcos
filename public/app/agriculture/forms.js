export function agricultureForms(t, escapeHtml) {
  const h = escapeHtml;
  function field(name, label, value = "", options = {}) {
    return '<label class="ag-field"><span>' + h(label) + '</span>' +
      '<input name="' + h(name) + '" type="' + (options.type ?? "text") + '" value="' + h(value ?? "") +
      '"' + (options.required ? " required" : "") + (options.type === "number" ? ' step="' + (options.step ?? "any") + '"' : "") + "></label>";
  }
  function select(name, label, value, entries, required = false) {
    return '<label class="ag-field"><span>' + h(label) + '</span><select name="' + h(name) + '"' + (required ? " required" : "") +
      '><option value="">' + h(t("Non renseigné", "Unknown", "Onbekend")) + '</option>' +
      entries.map(([id, text]) => '<option value="' + h(id) + '"' + (String(value ?? "") === String(id) ? " selected" : "") +
        ">" + h(text) + "</option>").join("") + "</select></label>";
  }
  function area(name, label, value, options = {}) {
    return '<label class="ag-field"><span>' + h(label) + '</span><textarea name="' + h(name) + '" rows="' +
      (options.rows ?? 2) + '">' + h(value ?? "") + "</textarea></label>";
  }
  function actions(label = t("Enregistrer", "Save", "Opslaan")) {
    return '<div class="ag-actions"><button class="button primary" type="submit">' + h(label) +
      '</button><span role="status" data-ag-feedback></span></div>';
  }
  function errorLabel(error) {
    const messages = {
      conflict: t("Les données ont changé ou cet identifiant est déjà utilisé.", "The data changed or this identifier is already in use.", "De gegevens zijn gewijzigd of deze identificatiecode is al in gebruik."),
      duplicate: t("Cette entrée existe déjà.", "This entry already exists.", "Dit item bestaat al."),
      invalid: t("Vérifiez le champ indiqué.", "Check the indicated field.", "Controleer het aangeduide veld."),
      missing: t("Entrée introuvable.", "Record not found.", "Item niet gevonden."),
      overlap: t("Cette occupation chevauche une autre culture.", "This allocation overlaps another crop.", "Deze toewijzing overlapt een ander gewas."),
      capacity: t("Le nombre de plants dépasse le nombre disponible.", "The plant count exceeds the number available.", "Het aantal planten overschrijdt het beschikbare aantal."),
    };
    if (error.status === 403) return t("Accès refusé.", "Access denied.", "Toegang geweigerd.");
    return (messages[error.code] ?? t("Impossible de terminer cette action.", "Could not complete this action.", "Deze actie kon niet worden voltooid.")) +
      (error.field ? " (" + error.field + ")" : "");
  }
  async function submit(form, work) {
    const feedback = form.querySelector("[data-ag-feedback]");
    const buttons = form.querySelectorAll("button[type=submit]");
    buttons.forEach((button) => { button.disabled = true; });
    feedback.textContent = "";
    try {
      await work(Object.fromEntries(new FormData(form)));
      feedback.textContent = t("Enregistré.", "Saved.", "Opgeslagen.");
    } catch (error) {
      feedback.textContent = errorLabel(error);
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }
  return { field, select, area, actions, errorLabel, submit };
}

export const splitList = (value) => value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
export const optionalNumber = (value) => value == null || value === "" ? null : Number(value);

