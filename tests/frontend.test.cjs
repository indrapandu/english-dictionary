const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const script = readFileSync(require.resolve('../js/dictionary.js'), 'utf8');
const copy = (value) => JSON.parse(JSON.stringify(value));
const fixtures = [
    { id: 1, module: 'words', word: 'cumbersome', part_of_speech: 'Adjective', meaning_en: 'Difficult to manage', meaning_id: 'Merepotkan', favorite: false, mastery_level: 'New' },
    { id: 2, module: 'chunks', word: 'make a decision', expression_type: 'Collocation', structure: 'make + a decision', usage_context: 'Choosing an option', meaning_en: 'Choose what to do', favorite: true, mastery_level: 'Learning' },
    { id: 3, module: 'phrases', word: 'on the same page', expression_type: 'Idiom', register_level: 'Neutral', usage_context: 'Checking understanding', meaning_en: 'Have the same understanding', favorite: false, mastery_level: 'Familiar' }
].map((entry) => ({ ...entry, user_id: 'owner', word_examples: [{ id: entry.id * 10, sentence: `Example for ${entry.module}`, translation: 'Contoh', notes: 'Preserve example notes' }] }));

async function until(check) {
    for (let i = 0; i < 150; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.fail('Timed out waiting for UI state');
}

async function setup(t, rows = fixtures, hash = 'words', signedIn = true) {
    const dom = new JSDOM(html, { url: `https://dictionary.test/index.html#${hash}`, runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const { window } = dom;
    const { document } = window;
    if (document.readyState === 'loading') await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
    window.confirm = () => true;
    const db = { rows: copy(rows), calls: [], rpcError: null, queryError: null, sequence: 1000 };
    const client = {
        from(table) {
            const query = { table, operation: 'select', filters: [], range: null };
            const chain = {
                select(columns) { query.columns = columns; return chain; },
                update(values) { query.operation = 'update'; query.values = values; return chain; },
                delete() { query.operation = 'delete'; return chain; },
                eq(column, value) { query.filters.push([column, value]); return chain; },
                order() { return chain; },
                range(start, end) { query.range = [start, end]; return chain; },
                single() { query.single = true; return chain; },
                then(resolve, reject) {
                    db.calls.push(copy(query));
                    if (db.queryError) return Promise.resolve({ data: null, error: db.queryError }).then(resolve, reject);
                    let data = db.rows.filter((row) => query.filters.every(([key, value]) => String(row[key]) === String(value)));
                    if (query.range) data = data.slice(query.range[0], query.range[1] + 1);
                    if (query.operation === 'update') data.forEach((row) => Object.assign(row, query.values));
                    if (query.operation === 'delete') db.rows = db.rows.filter((row) => !data.includes(row));
                    const error = query.single && data.length !== 1 ? { message: 'Entry not found' } : null;
                    return Promise.resolve({ data: copy(query.single ? data[0] || null : data), error }).then(resolve, reject);
                }
            };
            return chain;
        },
        async rpc(name, params) {
            db.calls.push({ operation: 'rpc', name, params: copy(params) });
            if (db.rpcError) return { data: null, error: db.rpcError };
            const existing = db.rows.find((entry) => String(entry.id) === String(params.p_entry_id));
            const entry = { ...existing, ...params.p_entry, module: params.p_module,
                user_id: 'owner', id: params.p_entry_id || ++db.sequence,
                word_examples: params.p_examples.map((example, index) => ({ ...example, id: 5000 + index })) };
            db.rows = db.rows.filter((item) => item.id !== entry.id);
            db.rows.push(entry);
            return { data: copy(entry), error: null };
        }
    };
    window.DictionaryAuth = { client, requireAuth: async () => signedIn ? { user: { id: 'owner', email: 'owner@example.invalid' } } : null, signOut() {} };
    window.eval(script);
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    if (signedIn) await until(() => !document.getElementById('addEntryButton').disabled);
    const el = (id) => document.getElementById(id);
    const switchModule = async (name) => {
        window.location.hash = name;
        await until(() => el('moduleTitle').textContent.toLowerCase() === name);
    };
    const submit = () => el('entryForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    return { window, document, db, el, switchModule, submit };
}

test('modules scope lists, counts, filters, search and mobile detail navigation', async (t) => {
    const { document, el, switchModule } = await setup(t);
    assert.equal(el('resultCount').textContent, '1 word');
    assert.equal(el('countFavorite').textContent, '0');
    assert.match(el('entryList').textContent, /cumbersome/);
    assert.doesNotMatch(el('entryList').textContent, /decision|same page/);
    await switchModule('chunks');
    assert.equal(el('countFavorite').textContent, '1');
    assert.equal(el('resultCount').textContent, '1 chunk');
    document.querySelector('.entry-card').click();
    assert(el('dictionaryLayout').classList.contains('show-detail'));
    assert.equal(el('backToEntriesButton').textContent, '← Chunks');
    el('backToEntriesButton').click();
    assert(!el('dictionaryLayout').classList.contains('show-detail'));
    document.querySelector('[data-filter="Mastered"]').click();
    assert.match(el('entryList').textContent, /No matches/);
    assert.doesNotMatch(el('entryDetail').textContent, /make a decision/);
    await switchModule('phrases');
    assert.equal(el('mobileFilterSelect').value, 'all');
    assert.equal(el('searchInput').value, '');
    assert.match(el('entryDetail').textContent, /Checking understanding/);
    assert.equal(document.querySelector('[data-module-count="words"]').textContent, '1');
});

for (const moduleName of ['chunks', 'words', 'phrases']) {
    test(`${moduleName}: tailored form and create/edit/delete preserve the module`, async (t) => {
        const { window, document, db, el, submit } = await setup(t, fixtures, moduleName);
        el('addEntryButton').click();
        assert.equal(el('partOfSpeechField').hidden, moduleName !== 'words');
        assert.equal(el('expressionTypeField').hidden, moduleName === 'words');
        assert.equal(el('structureField').hidden, moduleName !== 'chunks');
        assert.equal(el('registerField').hidden, moduleName !== 'phrases');
        assert.equal(el('entryInput').maxLength, moduleName === 'words' ? 120 : 500);
        el('entryInput').value = `New ${moduleName}`;
        el('meaningEnInput').value = 'An original meaning';
        el('meaningIdInput').value = 'Arti baru';
        el('partOfSpeechInput').value = 'Verb';
        el('structureInput').value = 'verb + object';
        el('usageContextInput').value = 'At work';
        el('registerInput').value = 'Formal';
        if (moduleName === 'chunks') el('expressionTypeInput').value = 'Sentence frame';
        if (moduleName === 'phrases') el('expressionTypeInput').value = 'Idiom';
        document.querySelector('.example-sentence').value = 'A new example';
        submit();
        await until(() => !el('entryDialog').open);
        const created = db.calls.find((call) => call.operation === 'rpc');
        assert.equal(created.name, 'save_entry');
        assert.equal(created.params.p_module, moduleName);
        assert.equal(created.params.p_entry_id, null);
        assert.equal(created.params.p_entry.structure, moduleName === 'chunks' ? 'verb + object' : null);
        assert.equal(created.params.p_entry.register_level, moduleName === 'phrases' ? 'Formal' : null);
        assert.equal(created.params.p_entry.part_of_speech, moduleName === 'words' ? 'Verb' : null);
        assert.match(el('entryDetail').textContent, /A new example/);
        assert.equal(db.calls.filter((call) => call.operation === 'select').length, 1, 'save uses the confirmed RPC response');
        el('editButton').click();
        assert.equal(el('meaningEnInput').value, 'An original meaning');
        el('meaningEnInput').value = 'Edited meaning';
        el('addExampleButton').click();
        document.querySelectorAll('.example-sentence')[1].value = 'Second example';
        submit();
        await until(() => !el('entryDialog').open);
        assert.match(el('entryDetail').textContent, /Edited meaning/);
        assert.equal(document.querySelectorAll('.example-card').length, 2);
        el('favoriteButton').click();
        await until(() => el('favoriteButton').getAttribute('aria-pressed') === 'true' && !el('favoriteButton').disabled);
        window.confirm = () => false;
        el('deleteButton').click();
        assert.equal(db.calls.filter((call) => call.operation === 'delete').length, 0);
        window.confirm = () => true;
        el('deleteButton').click();
        await until(() => el('toast').textContent.endsWith('deleted.'));
        assert(!db.rows.some((entry) => entry.word === `New ${moduleName}`));
        const deletion = db.calls.find((call) => call.operation === 'delete');
        assert(deletion.filters.some(([key, value]) => key === 'module' && value === moduleName));
        assert(deletion.filters.some(([key, value]) => key === 'user_id' && value === 'owner'));
        assert.equal(db.rows.length, fixtures.length);
    });
}

test('failed saves retain input and report duplicate errors without changing the list', async (t) => {
    const { db, el, submit } = await setup(t, fixtures, 'phrases');
    el('addEntryButton').click();
    el('entryInput').value = 'on the same page';
    el('meaningEnInput').value = 'Keep my input';
    db.rpcError = { code: '23505', message: 'Duplicate' };
    submit();
    await until(() => !!el('formMessage').textContent);
    assert(el('entryDialog').open);
    assert.equal(el('meaningEnInput').value, 'Keep my input');
    assert.match(el('formMessage').textContent, /already exists in Phrases/);
    assert.equal(db.rows.length, 3);
    assert(!el('saveEntryButton').disabled);
    db.rpcError = null;
    el('entryInput').value = '   ';
    submit();
    await until(() => el('formMessage').textContent.includes('Please enter'));
    assert.equal(db.calls.filter((call) => call.operation === 'rpc').length, 1);
});

test('search includes module-specific fields and examples; rendered input is escaped', async (t) => {
    const rows = copy(fixtures);
    rows[1].word = '<img src=x onerror=alert(1)>';
    rows[1].usage_context = '<script>bad()</script>';
    const { window, document, el, switchModule } = await setup(t, rows, 'chunks');
    assert.match(el('entryDetail').textContent, /<script>bad\(\)<\/script>/);
    assert.equal(el('entryDetail').querySelectorAll('script,img').length, 0);
    el('searchInput').value = 'Example for chunks';
    el('searchInput').dispatchEvent(new window.Event('input'));
    assert.equal(document.querySelectorAll('.entry-card').length, 1);
    el('editButton').click();
    assert.equal(document.querySelector('.example-sentence').value, 'Example for chunks');
    assert.equal(document.querySelector('.example-editor').dataset.notes, 'Preserve example notes');
    el('cancelDialogButton').click();
    await switchModule('words');
    el('addEntryButton').click();
    assert.equal(el('usageContextInput').value, '');
    assert(el('usageContextInput').disabled);
});

test('pagination reads entries beyond the first 500 rows', async (t) => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ ...copy(fixtures[0]), id: i + 1, word: `word ${i}` }));
    const { db, el } = await setup(t, rows);
    assert.equal(el('countAll').textContent, '501');
    assert.deepEqual(db.calls.map((call) => call.range), [[0, 499], [500, 999]]);
});

test('signed-out state never requests vocabulary or enables adding', async (t) => {
    const { db, el } = await setup(t, fixtures, 'words', false);
    assert.equal(db.calls.length, 0);
    assert(el('addEntryButton').disabled);
});
