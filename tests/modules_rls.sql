-- Run as postgres. Fixtures, users and every mutation are rolled back.
begin;
do $$
declare
    user_a uuid := gen_random_uuid();
    user_b uuid := gen_random_uuid();
    module_name text;
    saved jsonb;
    entry_id bigint;
    ids bigint[] := '{}';
    payload jsonb;
    affected integer;
    index_no integer := 0;
begin
    insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (user_a, 'authenticated', 'authenticated', user_a::text || '@example.invalid', now(), now()),
           (user_b, 'authenticated', 'authenticated', user_b::text || '@example.invalid', now(), now());
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', user_a::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', user_a, 'role', 'authenticated')::text, true);

    foreach module_name in array array['chunks', 'words', 'phrases'] loop
        payload := jsonb_build_object('word', 'Same expression', 'meaning_en', 'Original meaning', 'meaning_id', 'Arti awal',
            'part_of_speech', 'Noun', 'favorite', true, 'mastery_level', 'Learning')
            || case module_name
                when 'chunks' then '{"expression_type":"Sentence frame","structure":"Would you mind + verb-ing?","usage_context":"Polite request"}'::jsonb
                when 'phrases' then '{"expression_type":"Idiom","register_level":"Informal","usage_context":"Everyday conversation"}'::jsonb
                else '{}'::jsonb end;
        saved := public.save_entry(module_name, null, payload, '[{"sentence":"Original example","translation":"Contoh awal","notes":"Keep this note"}]');
        entry_id := (saved->>'id')::bigint;
        ids := array_append(ids, entry_id);
        if saved->>'module' <> module_name or saved->>'user_id' <> user_a::text
           or jsonb_array_length(saved->'word_examples') <> 1
           or saved->'word_examples'->0->>'sentence' <> 'Original example' then
            raise exception 'FAIL: create/response in %', module_name;
        end if;
        if module_name = 'chunks' and (saved->>'structure' <> 'Would you mind + verb-ing?' or saved->>'expression_type' <> 'Sentence frame') then
            raise exception 'FAIL: chunk fields';
        end if;
        if module_name = 'phrases' and (saved->>'register_level' <> 'Informal' or saved->>'expression_type' <> 'Idiom') then
            raise exception 'FAIL: phrase fields';
        end if;
        if module_name <> 'words' and saved->>'part_of_speech' is not null then
            raise exception 'FAIL: word-only metadata leaked into %', module_name;
        end if;

        begin
            perform public.save_entry(module_name, null, payload || '{"word":"SAME EXPRESSION"}', '[]');
            raise exception 'FAIL: duplicate within %', module_name;
        exception when unique_violation then null;
        end;
        begin
            perform public.save_entry(module_name, entry_id, payload || '{"word":"Should roll back"}', '[{"sentence":" "}]');
            raise exception 'FAIL: empty example accepted';
        exception when check_violation then null;
        end;
        if not exists (select 1 from public.words where id = entry_id and word = 'Same expression')
           or not exists (select 1 from public.word_examples where word_id = entry_id and sentence = 'Original example') then
            raise exception 'FAIL: atomic rollback in %', module_name;
        end if;
        begin
            perform public.save_entry(case when module_name = 'words' then 'chunks' else 'words' end,
                entry_id, '{"word":"Wrong module","meaning_en":"Denied"}', '[]');
            raise exception 'FAIL: RPC updated an entry from another module';
        exception when insufficient_privilege then null;
        end;
        saved := public.save_entry(module_name, entry_id, payload || '{"meaning_en":"Updated meaning","mastery_level":"Mastered"}',
            '[{"sentence":"Example one"},{"sentence":"Example two","translation":"Contoh dua"}]');
        if (saved->>'id')::bigint <> entry_id or saved->>'meaning_en' <> 'Updated meaning'
           or saved->>'mastery_level' <> 'Mastered' or jsonb_array_length(saved->'word_examples') <> 2 then
            raise exception 'FAIL: edit response in %', module_name;
        end if;
        update public.words set favorite = false where id = entry_id;
        if exists (select 1 from public.words where id = entry_id and favorite) then
            raise exception 'FAIL: favorite update in %', module_name;
        end if;
    end loop;
    if (select count(*) from public.words where id = any(ids)) <> 3 then
        raise exception 'FAIL: same text must be allowed in different modules';
    end if;

    begin
        perform public.save_entry('other', null, '{"word":"Invalid","meaning_en":"Invalid"}', '[]');
        raise exception 'FAIL: invalid module';
    exception when invalid_parameter_value then null;
    end;
    begin
        perform public.save_entry('chunks', null, '{"word":"Invalid type","meaning_en":"Invalid","expression_type":"Idiom"}', '[]');
        raise exception 'FAIL: invalid module-specific category';
    exception when check_violation then null;
    end;
    begin
        perform public.save_entry('words', null, jsonb_build_object('word', repeat('x',121), 'meaning_en','Too long'), '[]');
        raise exception 'FAIL: word length';
    exception when check_violation then null;
    end;
    saved := public.save_entry('chunks', null, jsonb_build_object('word', repeat('x',300), 'meaning_en','Long chunk'), '[]');
    if char_length(saved->>'word') <> 300 then raise exception 'FAIL: long chunk'; end if;
    saved := public.save_entry('phrases', null, jsonb_build_object('word', repeat('x',300), 'meaning_en','Long phrase'), '[]');
    if char_length(saved->>'word') <> 300 then raise exception 'FAIL: long phrase'; end if;

    perform set_config('request.jwt.claim.sub', user_b::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', user_b, 'role', 'authenticated')::text, true);
    foreach module_name in array array['chunks', 'words', 'phrases'] loop
        index_no := index_no + 1;
        entry_id := ids[index_no];
        if exists (select 1 from public.words where id = entry_id)
           or exists (select 1 from public.word_examples where word_id = entry_id) then
            raise exception 'FAIL: cross-user read in %', module_name;
        end if;
        begin
            perform public.save_entry(module_name, entry_id, '{"word":"Hijacked","meaning_en":"Denied"}', '[]');
            raise exception 'FAIL: cross-user RPC in %', module_name;
        exception when insufficient_privilege then null;
        end;
        update public.words set meaning_en = 'Hijacked' where id = entry_id;
        get diagnostics affected = row_count;
        if affected <> 0 then raise exception 'FAIL: cross-user update'; end if;
        delete from public.words where id = entry_id;
        get diagnostics affected = row_count;
        if affected <> 0 then raise exception 'FAIL: cross-user delete'; end if;
        begin
            insert into public.word_examples(word_id,sentence) values(entry_id,'Hijacked');
            raise exception 'FAIL: cross-user example insertion';
        exception when insufficient_privilege then null;
        end;
        saved := public.save_entry(module_name, null, '{"word":"Same expression","meaning_en":"User B copy"}', '[{"sentence":"B example"}]');
        begin
            update public.words set user_id = user_a where id = (saved->>'id')::bigint;
            raise exception 'FAIL: ownership reassignment';
        exception when insufficient_privilege then null;
        end;
        begin
            update public.word_examples set word_id = entry_id where word_id = (saved->>'id')::bigint;
            raise exception 'FAIL: example reassignment';
        exception when insufficient_privilege then null;
        end;
        delete from public.words where id = (saved->>'id')::bigint;
        if exists(select 1 from public.word_examples where word_id = (saved->>'id')::bigint) then
            raise exception 'FAIL: delete cascade in %', module_name;
        end if;
    end loop;
    reset role;
    set local role anon;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    begin
        perform public.save_entry('chunks', null, '{"word":"Anonymous","meaning_en":"Denied"}', '[]');
        raise exception 'FAIL: anonymous RPC';
    exception when insufficient_privilege then null;
    end;
    reset role;
end;
$$;
select 'PASS: three-module CRUD, per-module duplicates, module fields, atomic rollback, module guards, ownership, cascade and anonymous denial' as verification;
rollback;
