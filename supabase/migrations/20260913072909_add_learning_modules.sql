-- Existing rows stay in Words, with their IDs, owners and examples preserved.
alter table public.words
    add column module text not null default 'words',
    add column expression_type text,
    add column structure text,
    add column usage_context text,
    add column register_level text;

alter table public.words drop constraint words_word_check;
alter table public.words
    add constraint words_module_check check (module in ('chunks', 'words', 'phrases')),
    add constraint words_word_check check (
        char_length(btrim(word)) between 1 and case when module = 'words' then 120 else 500 end
    ),
    add constraint words_expression_type_check check (
        expression_type is null
        or (module = 'chunks' and expression_type in ('Collocation', 'Sentence starter', 'Sentence frame', 'Fixed expression'))
        or (module = 'phrases' and expression_type in ('Idiom', 'Phrasal verb', 'Everyday expression', 'Saying / proverb'))
    ),
    add constraint words_structure_check check (structure is null or (module = 'chunks' and char_length(structure) <= 500)),
    add constraint words_usage_context_check check (usage_context is null or module in ('chunks', 'phrases')),
    add constraint words_register_level_check check (
        register_level is null or (module = 'phrases' and register_level in ('Neutral', 'Formal', 'Informal'))
    );

-- The same expression may be studied in different modules, once per module/owner.
drop index public.words_user_word_unique;
create unique index words_user_module_word_unique on public.words (user_id, module, lower(word));

comment on table public.words is 'Learning entries for Chunks, Words and Phrases. Legacy table name retained to preserve existing IDs and example relationships.';

create or replace function public.save_entry(p_module text, p_entry_id bigint, p_entry jsonb, p_examples jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    saved_id bigint;
    caller_id uuid := auth.uid();
    entry_type text;
    entry_structure text;
    entry_context text;
    entry_register text;
begin
    if caller_id is null then
        raise exception 'Please log in again.' using errcode = '42501';
    end if;
    if p_module is null or p_module not in ('chunks', 'words', 'phrases')
       or jsonb_typeof(p_entry) is distinct from 'object'
       or jsonb_typeof(p_examples) is distinct from 'array' then
        raise exception 'Invalid module, entry or examples.' using errcode = '22023';
    end if;

    entry_type := case when p_module <> 'words' then nullif(btrim(p_entry->>'expression_type'), '') end;
    entry_structure := case when p_module = 'chunks' then nullif(btrim(p_entry->>'structure'), '') end;
    entry_context := case when p_module <> 'words' then nullif(btrim(p_entry->>'usage_context'), '') end;
    entry_register := case when p_module = 'phrases' then nullif(btrim(p_entry->>'register_level'), '') end;

    if p_entry_id is null then
        insert into public.words (
            user_id, module, word, part_of_speech, pronunciation, meaning_en, meaning_id,
            notes, favorite, mastery_level, expression_type, structure, usage_context, register_level
        ) values (
            caller_id, p_module, btrim(p_entry->>'word'),
            case when p_module = 'words' then nullif(btrim(p_entry->>'part_of_speech'), '') end,
            nullif(btrim(p_entry->>'pronunciation'), ''), btrim(p_entry->>'meaning_en'),
            nullif(btrim(p_entry->>'meaning_id'), ''), nullif(btrim(p_entry->>'notes'), ''),
            coalesce((p_entry->>'favorite')::boolean, false), coalesce(p_entry->>'mastery_level', 'New'),
            entry_type, entry_structure, entry_context, entry_register
        ) returning id into saved_id;
    else
        update public.words set
            word = btrim(p_entry->>'word'),
            part_of_speech = case when p_module = 'words' then nullif(btrim(p_entry->>'part_of_speech'), '') end,
            pronunciation = nullif(btrim(p_entry->>'pronunciation'), ''),
            meaning_en = btrim(p_entry->>'meaning_en'),
            meaning_id = nullif(btrim(p_entry->>'meaning_id'), ''),
            notes = nullif(btrim(p_entry->>'notes'), ''),
            favorite = coalesce((p_entry->>'favorite')::boolean, false),
            mastery_level = coalesce(p_entry->>'mastery_level', 'New'),
            expression_type = entry_type,
            structure = entry_structure,
            usage_context = entry_context,
            register_level = entry_register
        where id = p_entry_id and user_id = caller_id and module = p_module
        returning id into saved_id;
        if saved_id is null then
            raise exception 'Entry not found in this module or access denied.' using errcode = '42501';
        end if;
        delete from public.word_examples where word_id = saved_id;
    end if;

    insert into public.word_examples (word_id, sentence, translation, notes)
    select saved_id, btrim(example->>'sentence'), nullif(btrim(example->>'translation'), ''),
           nullif(btrim(example->>'notes'), '')
    from jsonb_array_elements(p_examples) with ordinality as entry(example, position)
    order by position;

    return (
        select to_jsonb(w) || jsonb_build_object('word_examples', coalesce((
            select jsonb_agg(to_jsonb(e) order by e.id)
            from public.word_examples e where e.word_id = saved_id
        ), '[]'::jsonb))
        from public.words w where w.id = saved_id
    );
end;
$$;

revoke execute on function public.save_entry(text, bigint, jsonb, jsonb) from public, anon;
grant execute on function public.save_entry(text, bigint, jsonb, jsonb) to authenticated;

-- Retain the original Words RPC for existing clients, scoped strictly to Words.
create or replace function public.save_word(p_word_id bigint, p_word jsonb, p_examples jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
begin
    return (public.save_entry('words', p_word_id, p_word, p_examples)->>'id')::bigint;
end;
$$;
revoke execute on function public.save_word(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.save_word(bigint, jsonb, jsonb) to authenticated;
