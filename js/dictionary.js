(function () {
    "use strict";

    const modules = {
        chunks: {
            title: "Chunks", singular: "chunk", maxLength: 500, placeholder: "e.g. Would you mind…?",
            typeLabel: "Chunk type", types: ["Collocation", "Sentence starter", "Sentence frame", "Fixed expression"],
            contextPlaceholder: "e.g. Making a polite request", icon: "…"
        },
        words: {
            title: "Words", singular: "word", maxLength: 120, placeholder: "e.g. cumbersome", icon: "Aa"
        },
        phrases: {
            title: "Phrases", singular: "phrase", maxLength: 500, placeholder: "e.g. on the same page",
            typeLabel: "Phrase type", types: ["Idiom", "Phrasal verb", "Everyday expression", "Saying / proverb"],
            contextPlaceholder: "e.g. Checking that everyone has the same understanding", icon: "“ ”"
        }
    };
    const state = {
        entries: [], module: "words", selectedId: null, activeFilter: "all", searchText: "",
        editingId: null, user: null, loaded: false, loading: false, saving: false, pendingIds: new Set()
    };
    const elements = {};
    const sameId = (a, b) => String(a) === String(b);
    const currentModule = () => modules[state.module];
    const moduleEntries = () => state.entries.filter((entry) => entry.module === state.module);

    document.addEventListener("DOMContentLoaded", initialize);

    async function initialize() {
        cacheElements();
        bindEvents();
        setModule(moduleFromHash());
        const auth = await window.DictionaryAuth.requireAuth();
        if (!auth) return;
        state.user = auth.user;
        elements.userEmail.textContent = auth.user.email;
        elements.userEmail.title = auth.user.email;
        await loadEntries();
    }

    function cacheElements() {
        [
            "entryList", "entryDetail", "searchInput", "mobileFilterSelect", "listTitle", "resultCount",
            "countAll", "countFavorite", "countNew", "countLearning", "countMastered", "countFamiliar",
            "userEmail", "dictionaryLayout", "addEntryButton", "addEntryLabel", "entryDialog", "entryForm",
            "entryFields", "dialogTitle", "closeDialogButton", "cancelDialogButton", "saveEntryButton",
            "formMessage", "entryInput", "entryInputLabel", "partOfSpeechInput", "partOfSpeechField",
            "pronunciationInput", "meaningEnInput", "meaningIdInput", "masteryInput", "favoriteInput",
            "notesInput", "examplesEditor", "addExampleButton", "logoutButton", "mobileLogoutButton", "toast",
            "moduleTitle", "allFilterLabel", "allFilterOption", "searchLabel", "expressionTypeField",
            "expressionTypeLabel", "expressionTypeInput", "structureField", "structureInput",
            "usageContextField", "usageContextInput", "registerField", "registerInput"
        ].forEach((id) => { elements[id] = document.getElementById(id); });
    }

    function bindEvents() {
        window.addEventListener("hashchange", () => {
            if (state.saving || (elements.entryDialog.open && !window.confirm("Discard unsaved changes?"))) {
                window.history.replaceState(null, "", `#${state.module}`);
                return;
            }
            if (elements.entryDialog.open) closeEntryDialog();
            setModule(moduleFromHash());
        });
        elements.searchInput.addEventListener("input", (event) => {
            state.searchText = event.target.value.trim().toLowerCase();
            refreshSelection();
            elements.dictionaryLayout.classList.remove("show-detail");
            render();
        });
        document.querySelectorAll("[data-filter]").forEach((button) => {
            button.addEventListener("click", () => setFilter(button.dataset.filter));
        });
        elements.mobileFilterSelect.addEventListener("change", (event) => setFilter(event.target.value));
        elements.addEntryButton.addEventListener("click", () => openEntryDialog());
        elements.closeDialogButton.addEventListener("click", closeEntryDialog);
        elements.cancelDialogButton.addEventListener("click", closeEntryDialog);
        elements.addExampleButton.addEventListener("click", () => addExampleEditor());
        elements.entryForm.addEventListener("submit", saveEntry);
        elements.logoutButton.addEventListener("click", window.DictionaryAuth.signOut);
        elements.mobileLogoutButton.addEventListener("click", window.DictionaryAuth.signOut);
        elements.entryDialog.addEventListener("cancel", (event) => {
            if (state.saving) event.preventDefault();
        });
        elements.entryDialog.addEventListener("close", () => { state.editingId = null; });
        elements.entryDialog.addEventListener("click", (event) => {
            if (event.target === elements.entryDialog) closeEntryDialog();
        });
    }

    function moduleFromHash() {
        const name = window.location.hash.slice(1);
        return Object.hasOwn(modules, name) ? name : "words";
    }

    function setModule(name) {
        state.module = name;
        state.activeFilter = "all";
        state.searchText = "";
        state.selectedId = null;
        elements.searchInput.value = "";
        elements.dictionaryLayout.classList.remove("show-detail");
        const config = currentModule();
        elements.moduleTitle.textContent = config.title;
        document.title = `${config.title} | My Dictionary`;
        elements.addEntryLabel.textContent = `Add ${config.singular}`;
        elements.allFilterLabel.textContent = `All ${name}`;
        elements.allFilterOption.textContent = `All ${name}`;
        elements.searchLabel.textContent = `Search ${name}`;
        elements.searchInput.placeholder = `Search ${name} or meanings`;
        document.querySelectorAll("[data-module]").forEach((link) => {
            const active = link.dataset.module === name;
            link.classList.toggle("active", active);
            if (active) link.setAttribute("aria-current", "page");
            else link.removeAttribute("aria-current");
        });
        refreshSelection();
        render();
    }

    async function loadEntries() {
        if (state.loading) return;
        state.loading = true;
        state.loaded = false;
        render();
        try {
            const entries = [];
            const pageSize = 500;
            for (let offset = 0; ; offset += pageSize) {
                const { data, error } = await window.DictionaryAuth.client
                    .from("words")
                    .select("*, word_examples(id, sentence, translation, notes, created_at)")
                    .eq("user_id", state.user.id)
                    .order("id", { ascending: true })
                    .range(offset, offset + pageSize - 1);
                if (error) throw error;
                entries.push(...(data || []));
                if (!data || data.length < pageSize) break;
            }
            state.entries = entries.map(normalizeEntry);
            sortEntries();
            state.loaded = true;
            refreshSelection();
        } catch (error) {
            showToast(error.message || "Unable to load your entries.", true);
        } finally {
            state.loading = false;
            render();
        }
    }

    function normalizeEntry(entry) {
        return {
            ...entry,
            module: entry.module || "words",
            word_examples: [...(entry.word_examples || [])].sort((a, b) => a.id - b.id)
        };
    }

    function sortEntries() {
        state.entries.sort((a, b) => a.word.localeCompare(b.word, "en", { sensitivity: "base" }) || a.id - b.id);
    }

    function setFilter(filter) {
        state.activeFilter = filter;
        refreshSelection();
        elements.dictionaryLayout.classList.remove("show-detail");
        render();
    }

    function visibleEntries() {
        return moduleEntries().filter((entry) => {
            const matchesFilter = state.activeFilter === "all"
                || (state.activeFilter === "favorite" && entry.favorite)
                || entry.mastery_level === state.activeFilter;
            const searchable = [entry.word, entry.meaning_en, entry.meaning_id, entry.notes,
                entry.part_of_speech, entry.expression_type, entry.structure, entry.usage_context,
                entry.register_level, ...entry.word_examples.flatMap((example) => [example.sentence, example.translation])]
                .filter(Boolean).join(" ").toLowerCase();
            return matchesFilter && (!state.searchText || searchable.includes(state.searchText));
        });
    }

    function refreshSelection() {
        const entries = visibleEntries();
        if (!entries.some((entry) => sameId(entry.id, state.selectedId))) state.selectedId = entries[0]?.id ?? null;
    }

    function render() {
        elements.addEntryButton.disabled = !state.loaded;
        elements.dictionaryLayout.setAttribute("aria-busy", String(state.loading));
        elements.mobileFilterSelect.value = state.activeFilter;
        document.querySelectorAll("[data-filter]").forEach((button) => {
            button.classList.toggle("active", button.dataset.filter === state.activeFilter);
        });
        renderCounts();
        renderList();
        renderDetail();
    }

    function renderCounts() {
        const entries = moduleEntries();
        elements.countAll.textContent = entries.length;
        elements.countFavorite.textContent = entries.filter((entry) => entry.favorite).length;
        ["New", "Learning", "Familiar", "Mastered"].forEach((status) => {
            elements[`count${status}`].textContent = entries.filter((entry) => entry.mastery_level === status).length;
        });
        document.querySelectorAll("[data-module-count]").forEach((count) => {
            count.textContent = state.entries.filter((entry) => entry.module === count.dataset.moduleCount).length;
        });
    }

    function renderList() {
        const entries = visibleEntries();
        const config = currentModule();
        elements.listTitle.textContent = state.activeFilter === "all" ? `All ${state.module}`
            : state.activeFilter === "favorite" ? "Favorites" : state.activeFilter;
        elements.resultCount.textContent = `${entries.length} ${entries.length === 1 ? config.singular : state.module}`;
        if (state.loading || !state.user) {
            elements.entryList.innerHTML = '<div class="loading-state">Loading…</div>';
            return;
        }
        if (!state.loaded) {
            elements.entryList.innerHTML = '<div class="empty-list"><h3>Unable to load your entries</h3><button class="secondary-button" id="retryButton" type="button">Try again</button></div>';
            document.getElementById("retryButton").addEventListener("click", loadEntries);
            return;
        }
        if (!entries.length) {
            const hasEntries = moduleEntries().length > 0;
            elements.entryList.innerHTML = `<div class="empty-list"><span>${config.icon}</span>
                <h3>${hasEntries ? "No matches" : `No ${state.module} yet`}</h3>
                <p>${hasEntries ? "Try another search or filter." : `Add your first ${config.singular}.`}</p></div>`;
            return;
        }
        elements.entryList.innerHTML = entries.map((entry) => `
            <button class="entry-card ${sameId(entry.id, state.selectedId) ? "selected" : ""}" type="button" data-entry-id="${escapeHtml(entry.id)}" aria-pressed="${sameId(entry.id, state.selectedId)}">
                <span class="entry-card-top"><span class="entry-title">${escapeHtml(entry.word)}</span>
                    ${entry.favorite ? '<span class="favorite-star" aria-label="Favorite">★</span>' : ""}</span>
                <span class="entry-meta">
                    ${entry.part_of_speech || entry.expression_type ? `<span>${escapeHtml(entry.part_of_speech || entry.expression_type)}</span>` : ""}
                    <span class="status-badge status-${slug(entry.mastery_level)}">${escapeHtml(entry.mastery_level || "New")}</span>
                </span>
                <span class="entry-meaning">${escapeHtml(entry.meaning_id || entry.meaning_en)}</span>
            </button>`).join("");
        elements.entryList.querySelectorAll("[data-entry-id]").forEach((button) => {
            button.addEventListener("click", () => {
                state.selectedId = button.dataset.entryId;
                render();
                elements.dictionaryLayout.classList.add("show-detail");
            });
        });
    }

    function textSection(label, value, className = "note-card") {
        return value ? `<section class="${className}"><p class="detail-label">${label}</p><p>${escapeHtml(value)}</p></section>` : "";
    }

    function renderDetail() {
        const entry = state.loaded && visibleEntries().find((item) => sameId(item.id, state.selectedId));
        if (!entry) {
            elements.entryDetail.innerHTML = `<div class="empty-state"><span class="empty-icon">${currentModule().icon}</span><h2>Select a ${currentModule().singular}</h2></div>`;
            return;
        }
        const disabled = state.pendingIds.has(String(entry.id)) ? "disabled" : "";
        const tags = [entry.part_of_speech, entry.expression_type, entry.register_level].filter(Boolean);
        elements.entryDetail.innerHTML = `
            <article class="detail-content">
                <div class="detail-actions">
                    <button class="text-button mobile-back" id="backToEntriesButton" type="button">← ${currentModule().title}</button>
                    <button class="icon-button favorite-action ${entry.favorite ? "active" : ""}" id="favoriteButton" type="button" aria-label="Favorite" aria-pressed="${entry.favorite}" ${disabled}>★</button>
                    <button class="secondary-button small" id="editButton" type="button" ${disabled}>Edit</button>
                    <button class="danger-button small" id="deleteButton" type="button" ${disabled}>Delete</button>
                </div>
                <header class="detail-header">
                    <div class="detail-title-row"><h2>${escapeHtml(entry.word)}</h2>
                        <span class="status-badge status-${slug(entry.mastery_level)}">${escapeHtml(entry.mastery_level || "New")}</span></div>
                    ${entry.pronunciation ? `<p class="pronunciation">${escapeHtml(entry.pronunciation)}</p>` : ""}
                    ${tags.length ? `<div class="detail-tags">${tags.map((tag) => `<span class="part-label">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
                </header>
                ${textSection("English meaning", entry.meaning_en, "meaning-block")}
                ${textSection("Bahasa Indonesia", entry.meaning_id, "meaning-block translated")}
                ${textSection("Pattern", entry.structure, "pattern-card")}
                ${textSection("When to use", entry.usage_context)}
                ${entry.word_examples.length ? `<section><p class="detail-label">Examples</p>
                    ${entry.word_examples.map((example) => `<blockquote class="example-card"><p>${escapeHtml(example.sentence)}</p>
                        ${example.translation ? `<footer>${escapeHtml(example.translation)}</footer>` : ""}</blockquote>`).join("")}</section>` : ""}
                ${textSection("Notes", entry.notes)}
            </article>`;
        document.getElementById("backToEntriesButton").addEventListener("click", () => {
            elements.dictionaryLayout.classList.remove("show-detail");
            elements.entryList.querySelector(".entry-card.selected")?.focus();
        });
        document.getElementById("editButton").addEventListener("click", () => openEntryDialog(entry));
        document.getElementById("deleteButton").addEventListener("click", () => deleteEntry(entry));
        document.getElementById("favoriteButton").addEventListener("click", () => toggleFavorite(entry));
    }

    function openEntryDialog(entry = null) {
        if (!state.loaded) return;
        const config = currentModule();
        state.editingId = entry?.id ?? null;
        elements.entryForm.reset();
        elements.entryFields.disabled = false;
        elements.examplesEditor.innerHTML = "";
        elements.formMessage.textContent = "";
        elements.dialogTitle.textContent = `${entry ? "Edit" : "Add"} ${config.singular}`;
        elements.saveEntryButton.textContent = entry ? "Save changes" : `Save ${config.singular}`;
        elements.entryInputLabel.textContent = `${config.singular[0].toUpperCase() + config.singular.slice(1)} *`;
        elements.entryInput.maxLength = config.maxLength;
        elements.entryInput.placeholder = config.placeholder;
        elements.pronunciationInput.placeholder = state.module === "words" ? "e.g. /ˈkʌmbəsəm/" : "";
        elements.expressionTypeLabel.textContent = config.typeLabel || "Type";
        elements.expressionTypeInput.innerHTML = '<option value="">Select...</option>'
            + (config.types || []).map((type) => `<option>${escapeHtml(type)}</option>`).join("");
        elements.usageContextInput.placeholder = config.contextPlaceholder || "";
        [
            ["partOfSpeech", state.module === "words"], ["expressionType", state.module !== "words"],
            ["structure", state.module === "chunks"], ["usageContext", state.module !== "words"],
            ["register", state.module === "phrases"]
        ].forEach(([name, visible]) => {
            elements[`${name}Field`].hidden = !visible;
            elements[`${name}Input`].disabled = !visible;
        });
        if (entry) {
            elements.entryInput.value = entry.word || "";
            if (entry.part_of_speech && ![...elements.partOfSpeechInput.options].some((option) => option.value === entry.part_of_speech)) {
                const option = document.createElement("option");
                option.textContent = entry.part_of_speech;
                elements.partOfSpeechInput.appendChild(option);
            }
            const fields = { partOfSpeech: "part_of_speech", pronunciation: "pronunciation", meaningEn: "meaning_en",
                meaningId: "meaning_id", notes: "notes", expressionType: "expression_type", structure: "structure",
                usageContext: "usage_context", register: "register_level" };
            Object.entries(fields).forEach(([input, key]) => { elements[`${input}Input`].value = entry[key] || ""; });
            elements.masteryInput.value = entry.mastery_level || "New";
            elements.favoriteInput.checked = Boolean(entry.favorite);
            entry.word_examples.forEach(addExampleEditor);
        }
        if (!elements.examplesEditor.children.length) addExampleEditor();
        elements.entryDialog.showModal();
        elements.entryInput.focus();
    }

    function closeEntryDialog() {
        if (state.saving) return;
        elements.entryDialog.close();
        state.editingId = null;
    }

    function addExampleEditor(example = {}) {
        const row = document.createElement("div");
        row.className = "example-editor";
        if (example.notes) row.dataset.notes = example.notes;
        row.innerHTML = `
            <label class="field"><span>Example sentence</span><textarea class="example-sentence" rows="2">${escapeHtml(example.sentence || "")}</textarea></label>
            <label class="field"><span>Indonesian translation</span><textarea class="example-translation" rows="2">${escapeHtml(example.translation || "")}</textarea></label>
            <button class="icon-button remove-example" type="button" aria-label="Remove this example">&times;</button>`;
        row.querySelector(".remove-example").addEventListener("click", () => row.remove());
        elements.examplesEditor.appendChild(row);
    }

    async function saveEntry(event) {
        event.preventDefault();
        if (state.saving) return;
        const wasEditing = state.editingId !== null;
        const config = currentModule();
        const value = (name) => elements[`${name}Input`].value.trim() || null;
        const record = {
            word: value("entry"), part_of_speech: state.module === "words" ? value("partOfSpeech") : null,
            pronunciation: value("pronunciation"), meaning_en: value("meaningEn"), meaning_id: value("meaningId"),
            mastery_level: value("mastery"), favorite: elements.favoriteInput.checked, notes: value("notes"),
            expression_type: state.module !== "words" ? value("expressionType") : null,
            structure: state.module === "chunks" ? value("structure") : null,
            usage_context: state.module !== "words" ? value("usageContext") : null,
            register_level: state.module === "phrases" ? value("register") : null
        };
        const examples = [...elements.examplesEditor.querySelectorAll(".example-editor")].map((row) => ({
            sentence: row.querySelector(".example-sentence").value.trim(),
            translation: row.querySelector(".example-translation").value.trim() || null,
            notes: row.dataset.notes || null
        })).filter((example) => example.sentence);
        elements.formMessage.textContent = "";
        state.saving = true;
        setFormBusy(true);
        let saved = false;
        try {
            if (!record.word || !record.meaning_en) throw new Error(`Please enter a ${config.singular} and its English meaning.`);
            const { data, error } = await window.DictionaryAuth.client.rpc("save_entry", {
                p_module: state.module, p_entry_id: state.editingId, p_entry: record, p_examples: examples
            });
            if (error) throw error;
            const entry = normalizeEntry(data);
            state.entries = state.entries.filter((item) => !sameId(item.id, entry.id));
            state.entries.push(entry);
            sortEntries();
            state.selectedId = entry.id;
            state.activeFilter = "all";
            state.searchText = "";
            elements.searchInput.value = "";
            saved = true;
        } catch (error) {
            elements.formMessage.textContent = error.code === "23505"
                ? `This ${config.singular} already exists in ${config.title}. Edit the existing entry.`
                : error.message || "Unable to save. Please try again.";
        } finally {
            state.saving = false;
            setFormBusy(false);
        }
        if (saved) {
            closeEntryDialog();
            render();
            elements.dictionaryLayout.classList.add("show-detail");
            showToast(`${config.singular[0].toUpperCase() + config.singular.slice(1)} ${wasEditing ? "updated" : "saved"}.`);
        }
    }

    function setFormBusy(busy) {
        elements.entryFields.disabled = busy;
        elements.saveEntryButton.disabled = busy;
        elements.closeDialogButton.disabled = busy;
        elements.cancelDialogButton.disabled = busy;
        elements.saveEntryButton.textContent = busy ? "Saving…" : state.editingId !== null ? "Save changes" : `Save ${currentModule().singular}`;
    }

    async function toggleFavorite(entry) {
        const id = String(entry.id);
        if (state.pendingIds.has(id)) return;
        state.pendingIds.add(id);
        renderDetail();
        try {
            const { data, error } = await window.DictionaryAuth.client.from("words")
                .update({ favorite: !entry.favorite }).eq("id", entry.id)
                .eq("user_id", state.user.id).eq("module", entry.module).select("id, favorite").single();
            if (error) throw error;
            entry.favorite = data.favorite;
            refreshSelection();
        } catch (error) {
            showToast(error.message || "Unable to update favorite.", true);
        } finally {
            state.pendingIds.delete(id);
            render();
        }
    }

    async function deleteEntry(entry) {
        const id = String(entry.id);
        if (state.pendingIds.has(id) || !window.confirm(`Delete “${entry.word}”? This cannot be undone.`)) return;
        state.pendingIds.add(id);
        renderDetail();
        try {
            const { error } = await window.DictionaryAuth.client.from("words").delete()
                .eq("id", entry.id).eq("user_id", state.user.id).eq("module", entry.module).select("id").single();
            if (error) throw error;
            state.entries = state.entries.filter((item) => !sameId(item.id, entry.id));
            if (sameId(state.selectedId, entry.id)) elements.dictionaryLayout.classList.remove("show-detail");
            refreshSelection();
            showToast(`${modules[entry.module].singular[0].toUpperCase() + modules[entry.module].singular.slice(1)} deleted.`);
        } catch (error) {
            showToast(error.message || "Unable to delete this entry.", true);
        } finally {
            state.pendingIds.delete(id);
            render();
        }
    }

    function showToast(message, isError = false) {
        elements.toast.textContent = message;
        elements.toast.classList.toggle("error", isError);
        elements.toast.classList.add("visible");
        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(() => elements.toast.classList.remove("visible"), 3500);
    }

    function slug(value) {
        return String(value || "new").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    }

    function escapeHtml(value) {
        return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }
}());
