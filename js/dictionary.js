(function () {
    "use strict";

    const state = {
        words: [],
        selectedId: null,
        activeFilter: "all",
        searchText: "",
        editingId: null,
        user: null
    };

    const elements = {};

    document.addEventListener("DOMContentLoaded", initialize);

    async function initialize() {
        cacheElements();
        bindEvents();

        const auth = await window.DictionaryAuth.requireAuth();
        if (!auth) return;

        state.user = auth.user;
        elements.userEmail.textContent = auth.user.email;
        elements.userEmail.title = auth.user.email;
        await loadWords();
        elements.addWordButton.disabled = false;

        state.selectedId = state.words[0]?.id ?? null;
        render();
    }

    function cacheElements() {
        [
            "wordList", "wordDetail", "searchInput", "mobileFilterSelect", "listTitle",
            "resultCount", "countAll", "countFavorite", "countNew", "countLearning",
            "countMastered", "countFamiliar", "userEmail", "dictionaryLayout", "addWordButton", "wordDialog",
            "wordForm", "dialogTitle", "closeDialogButton", "cancelDialogButton", "saveWordButton",
            "formMessage", "wordInput", "partOfSpeechInput", "pronunciationInput", "meaningEnInput",
            "meaningIdInput", "masteryInput", "favoriteInput", "notesInput", "examplesEditor",
            "addExampleButton", "logoutButton", "mobileLogoutButton", "toast"
        ].forEach((id) => { elements[id] = document.getElementById(id); });
    }

    function bindEvents() {
        elements.searchInput.addEventListener("input", (event) => {
            state.searchText = event.target.value.trim().toLowerCase();
            const visibleWords = getVisibleWords();
            if (!visibleWords.some((word) => String(word.id) === String(state.selectedId))) {
                state.selectedId = visibleWords[0]?.id ?? null;
            }
            elements.dictionaryLayout.classList.remove("show-detail");
            render();
        });

        document.querySelectorAll("[data-filter]").forEach((button) => {
            button.addEventListener("click", () => setFilter(button.dataset.filter));
        });

        elements.mobileFilterSelect.addEventListener("change", (event) => setFilter(event.target.value));
        elements.addWordButton.addEventListener("click", () => openWordDialog());
        elements.closeDialogButton.addEventListener("click", closeWordDialog);
        elements.cancelDialogButton.addEventListener("click", closeWordDialog);
        elements.addExampleButton.addEventListener("click", () => addExampleEditor());
        elements.wordForm.addEventListener("submit", saveWord);
        elements.logoutButton.addEventListener("click", window.DictionaryAuth.signOut);
        elements.mobileLogoutButton.addEventListener("click", window.DictionaryAuth.signOut);

        elements.wordDialog.addEventListener("click", (event) => {
            if (event.target === elements.wordDialog) closeWordDialog();
        });
    }

    async function loadWords() {
        setListLoading();
        const { data, error } = await window.DictionaryAuth.client
            .from("words")
            .select("*, word_examples(id, sentence, translation, notes, created_at)")
            .eq("user_id", state.user.id)
            .order("word", { ascending: true });

        if (error) {
            showToast(error.message, true);
            state.words = [];
            return;
        }

        state.words = (data || []).map((word) => ({
            ...word,
            word_examples: (word.word_examples || []).sort((a, b) => a.id - b.id)
        }));
    }

    function setListLoading() {
        elements.wordList.innerHTML = '<div class="loading-state">Loading your words...</div>';
    }

    function setFilter(filter) {
        state.activeFilter = filter;
        elements.dictionaryLayout.classList.remove("show-detail");
        elements.mobileFilterSelect.value = filter;
        document.querySelectorAll("[data-filter]").forEach((button) => {
            button.classList.toggle("active", button.dataset.filter === filter);
        });
        const visibleWords = getVisibleWords();
        if (!visibleWords.some((word) => String(word.id) === String(state.selectedId))) {
            state.selectedId = visibleWords[0]?.id ?? null;
        }
        render();
    }

    function getVisibleWords() {
        return state.words.filter((item) => {
            const matchesFilter = state.activeFilter === "all"
                || (state.activeFilter === "favorite" && item.favorite)
                || item.mastery_level === state.activeFilter;
            const searchable = [item.word, item.meaning_en, item.meaning_id, item.notes, item.part_of_speech]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return matchesFilter && (!state.searchText || searchable.includes(state.searchText));
        });
    }

    function render() {
        renderCounts();
        renderList();
        renderDetail();
    }

    function renderCounts() {
        elements.countAll.textContent = state.words.length;
        elements.countFavorite.textContent = state.words.filter((item) => item.favorite).length;
        elements.countNew.textContent = state.words.filter((item) => item.mastery_level === "New").length;
        elements.countLearning.textContent = state.words.filter((item) => item.mastery_level === "Learning").length;
        elements.countFamiliar.textContent = state.words.filter((item) => item.mastery_level === "Familiar").length;
        elements.countMastered.textContent = state.words.filter((item) => item.mastery_level === "Mastered").length;
    }

    function renderList() {
        const visibleWords = getVisibleWords();
        const labels = { all: "All words", favorite: "Favorites", New: "New", Learning: "Learning", Familiar: "Familiar", Mastered: "Mastered" };
        elements.listTitle.textContent = labels[state.activeFilter] || state.activeFilter;
        elements.resultCount.textContent = `${visibleWords.length} ${visibleWords.length === 1 ? "word" : "words"}`;

        if (!visibleWords.length) {
            elements.wordList.innerHTML = `
                <div class="empty-list">
                    <span>Aa</span>
                    <h3>${state.words.length ? "No matches" : "No words yet"}</h3>
                    <p>${state.words.length ? "Try another search or filter." : "Add your first word."}</p>
                </div>`;
            return;
        }

        elements.wordList.innerHTML = visibleWords.map((item) => `
            <button class="word-card ${item.id === state.selectedId ? "selected" : ""}" type="button" data-word-id="${escapeHtml(item.id)}" aria-pressed="${item.id === state.selectedId}">
                <span class="word-card-top">
                    <span class="word-title">${escapeHtml(item.word)}</span>
                    ${item.favorite ? '<span class="favorite-star" aria-label="Favorite">★</span>' : ""}
                </span>
                <span class="word-meta">
                    ${item.part_of_speech ? `<span>${escapeHtml(item.part_of_speech)}</span>` : ""}
                    <span class="status-badge status-${slug(item.mastery_level)}">${escapeHtml(item.mastery_level || "New")}</span>
                </span>
                <span class="word-meaning">${escapeHtml(item.meaning_id || item.meaning_en)}</span>
            </button>`).join("");

        elements.wordList.querySelectorAll("[data-word-id]").forEach((button) => {
            button.addEventListener("click", () => {
                state.selectedId = Number(button.dataset.wordId);
                render();
                elements.dictionaryLayout.classList.add("show-detail");
            });
        });
    }

    function renderDetail() {
        const item = state.words.find((word) => String(word.id) === String(state.selectedId));
        if (!item) {
            elements.wordDetail.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">Aa</span>
                    <h2>Select a word</h2>
                </div>`;
            return;
        }

        const examples = item.word_examples || [];
        elements.wordDetail.innerHTML = `
            <article class="detail-content">
                <div class="detail-actions">
                    <button class="text-button mobile-back" id="backToWordsButton" type="button">← Words</button>
                    <button class="icon-button favorite-action ${item.favorite ? "active" : ""}" id="favoriteButton" type="button" aria-label="Favorite" aria-pressed="${item.favorite}">★</button>
                    <button class="secondary-button small" id="editButton" type="button">Edit</button>
                    <button class="danger-button small" id="deleteButton" type="button">Delete</button>
                </div>
                <header class="detail-header">
                    <div class="detail-title-row">
                        <h2>${escapeHtml(item.word)}</h2>
                        <span class="status-badge status-${slug(item.mastery_level)}">${escapeHtml(item.mastery_level || "New")}</span>
                    </div>
                    ${item.pronunciation ? `<p class="pronunciation">${escapeHtml(item.pronunciation)}</p>` : ""}
                    ${item.part_of_speech ? `<span class="part-label">${escapeHtml(item.part_of_speech)}</span>` : ""}
                </header>
                <section class="meaning-block">
                    <p class="detail-label">English meaning</p>
                    <p>${escapeHtml(item.meaning_en)}</p>
                </section>
                ${item.meaning_id ? `
                    <section class="meaning-block translated">
                        <p class="detail-label">Bahasa Indonesia</p>
                        <p>${escapeHtml(item.meaning_id)}</p>
                    </section>` : ""}
                ${examples.length ? `
                    <section>
                        <p class="detail-label">Examples</p>
                        ${examples.map((example) => `
                        <blockquote class="example-card">
                            <p>${escapeHtml(example.sentence)}</p>
                            ${example.translation ? `<footer>${escapeHtml(example.translation)}</footer>` : ""}
                        </blockquote>`).join("")}
                    </section>` : ""}
                ${item.notes ? `
                    <section class="note-card">
                        <p class="detail-label">Notes</p>
                        <p>${escapeHtml(item.notes)}</p>
                    </section>` : ""}
            </article>`;

        document.getElementById("backToWordsButton").addEventListener("click", () => {
            elements.dictionaryLayout.classList.remove("show-detail");
            elements.wordList.querySelector(".word-card.selected")?.focus();
        });
        document.getElementById("editButton").addEventListener("click", () => openWordDialog(item));
        document.getElementById("deleteButton").addEventListener("click", () => deleteWord(item));
        document.getElementById("favoriteButton").addEventListener("click", () => toggleFavorite(item));
    }

    function openWordDialog(item = null) {
        state.editingId = item?.id ?? null;
        elements.wordForm.reset();
        elements.examplesEditor.innerHTML = "";
        elements.formMessage.textContent = "";
        elements.dialogTitle.textContent = item ? "Edit word" : "Add word";
        elements.saveWordButton.textContent = item ? "Save changes" : "Save word";

        if (item) {
            elements.wordInput.value = item.word || "";
            elements.partOfSpeechInput.value = item.part_of_speech || "";
            elements.pronunciationInput.value = item.pronunciation || "";
            elements.meaningEnInput.value = item.meaning_en || "";
            elements.meaningIdInput.value = item.meaning_id || "";
            elements.masteryInput.value = item.mastery_level || "New";
            elements.favoriteInput.checked = Boolean(item.favorite);
            elements.notesInput.value = item.notes || "";
            (item.word_examples || []).forEach(addExampleEditor);
        }

        if (!elements.examplesEditor.children.length) addExampleEditor();
        elements.wordDialog.showModal();
        elements.wordInput.focus();
    }

    function closeWordDialog() {
        elements.wordDialog.close();
        state.editingId = null;
    }

    function addExampleEditor(example = {}) {
        const row = document.createElement("div");
        row.className = "example-editor";
        row.innerHTML = `
            <label class="field">
                <span>Example sentence</span>
                <textarea class="example-sentence" rows="2">${escapeHtml(example.sentence || "")}</textarea>
            </label>
            <label class="field">
                <span>Indonesian translation</span>
                <textarea class="example-translation" rows="2">${escapeHtml(example.translation || "")}</textarea>
            </label>
            <button class="icon-button remove-example" type="button" aria-label="Remove this example">&times;</button>`;
        row.querySelector(".remove-example").addEventListener("click", () => row.remove());
        elements.examplesEditor.appendChild(row);
    }

    async function saveWord(event) {
        event.preventDefault();
        const wasEditing = Boolean(state.editingId);
        elements.formMessage.textContent = "";
        elements.saveWordButton.disabled = true;
        elements.saveWordButton.textContent = "Saving...";

        const wordRecord = {
            word: elements.wordInput.value.trim(),
            part_of_speech: elements.partOfSpeechInput.value || null,
            pronunciation: elements.pronunciationInput.value.trim() || null,
            meaning_en: elements.meaningEnInput.value.trim(),
            meaning_id: elements.meaningIdInput.value.trim() || null,
            mastery_level: elements.masteryInput.value,
            favorite: elements.favoriteInput.checked,
            notes: elements.notesInput.value.trim() || null
        };
        const examples = [...elements.examplesEditor.querySelectorAll(".example-editor")]
            .map((row) => ({
                sentence: row.querySelector(".example-sentence").value.trim(),
                translation: row.querySelector(".example-translation").value.trim() || null
            }))
            .filter((example) => example.sentence);

        try {
            if (!wordRecord.word || !wordRecord.meaning_en) {
                throw new Error("Please enter a word and its English meaning.");
            }
            await saveDatabaseWord(wordRecord, examples);
            await loadWords();
            closeWordDialog();
            render();
            elements.dictionaryLayout.classList.add("show-detail");
            showToast(wasEditing ? "Word updated." : "Word saved.");
        } catch (error) {
            elements.formMessage.textContent = error.code === "23505"
                ? "This word is already in your dictionary. Edit the existing entry."
                : error.message || "The word could not be saved.";
        } finally {
            elements.saveWordButton.disabled = false;
            elements.saveWordButton.textContent = state.editingId ? "Save changes" : "Save word";
        }
    }

    async function saveDatabaseWord(record, examples) {
        const { data, error } = await window.DictionaryAuth.client.rpc("save_word", {
            p_word_id: state.editingId,
            p_word: record,
            p_examples: examples
        });
        if (error) throw error;
        state.selectedId = data;
    }

    async function toggleFavorite(item) {
        const newValue = !item.favorite;
        const { error } = await window.DictionaryAuth.client
            .from("words")
            .update({ favorite: newValue })
            .eq("id", item.id);
        if (error) {
            showToast(error.message, true);
            return;
        }
        item.favorite = newValue;
        render();
    }

    async function deleteWord(item) {
        if (!window.confirm(`Delete “${item.word}”? This cannot be undone.`)) return;

        const { error } = await window.DictionaryAuth.client.from("words").delete().eq("id", item.id);
        if (error) {
            showToast(error.message, true);
            return;
        }

        elements.dictionaryLayout.classList.remove("show-detail");
        state.words = state.words.filter((word) => String(word.id) !== String(item.id));
        state.selectedId = getVisibleWords()[0]?.id ?? state.words[0]?.id ?? null;
        render();
        showToast("Word deleted.");
    }

    function showToast(message, isError = false) {
        elements.toast.textContent = message;
        elements.toast.classList.toggle("error", isError);
        elements.toast.classList.add("visible");
        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(() => elements.toast.classList.remove("visible"), 3000);
    }

    function slug(value) {
        return String(value || "new").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }
}());
