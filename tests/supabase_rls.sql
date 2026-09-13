-- Run the entire script as postgres in Supabase SQL Editor.
-- All test users and records are rolled back; no emails or passwords are used.
begin;

do $$
declare
    user_a uuid := gen_random_uuid();
    user_b uuid := gen_random_uuid();
    word_a bigint;
    word_b bigint;
    affected integer;
begin
    insert into auth.users (id, aud, role, email, created_at, updated_at)
    values
        (user_a, 'authenticated', 'authenticated', user_a::text || '@example.invalid', now(), now()),
        (user_b, 'authenticated', 'authenticated', user_b::text || '@example.invalid', now(), now());

    set local role authenticated;
    perform set_config('request.jwt.claim.sub', user_a::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', user_a, 'role', 'authenticated')::text, true);

    word_a := public.save_word(null,
        '{"word":"Test vocabulary","meaning_en":"Original meaning","meaning_id":"Arti awal"}',
        '[{"sentence":"Original example","translation":"Contoh awal"}]');
    if not exists (select 1 from public.words where id = word_a and user_id = user_a)
       or (select count(*) from public.word_examples where word_id = word_a) <> 1 then
        raise exception 'FAIL: owner create/read';
    end if;

    begin
        perform public.save_word(null,
            '{"word":"TEST VOCABULARY","meaning_en":"Duplicate"}', '[]');
        raise exception 'FAIL: duplicate word was allowed';
    exception when unique_violation then null;
    end;

    begin
        perform public.save_word(word_a,
            '{"word":"Changed word","meaning_en":"Changed meaning"}',
            '[{"sentence":" "}]');
        raise exception 'FAIL: empty example was accepted';
    exception when check_violation then null;
    end;
    if not exists (select 1 from public.words where id = word_a and word = 'Test vocabulary')
       or not exists (select 1 from public.word_examples where word_id = word_a and sentence = 'Original example') then
        raise exception 'FAIL: a failed save changed the original word or examples';
    end if;

    perform public.save_word(word_a,
        '{"word":"Test vocabulary","meaning_en":"Updated meaning","mastery_level":"Learning"}',
        '[{"sentence":"First updated example"},{"sentence":"Second updated example"}]');
    update public.words set favorite = true where id = word_a;
    if not exists (select 1 from public.words where id = word_a and favorite and mastery_level = 'Learning')
       or (select count(*) from public.word_examples where word_id = word_a) <> 2 then
        raise exception 'FAIL: owner update/favorite';
    end if;

    perform set_config('request.jwt.claim.sub', user_b::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', user_b, 'role', 'authenticated')::text, true);
    if exists (select 1 from public.words where id = word_a)
       or exists (select 1 from public.word_examples where word_id = word_a) then
        raise exception 'FAIL: another user can read the word or examples';
    end if;
    begin
        perform public.save_word(word_a, '{"word":"Hijacked","meaning_en":"Hijacked"}', '[]');
        raise exception 'FAIL: another user can save the word';
    exception when insufficient_privilege then null;
    end;
    update public.words set meaning_en = 'Hijacked' where id = word_a;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'FAIL: another user can update the word'; end if;
    delete from public.words where id = word_a;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'FAIL: another user can delete the word'; end if;
    begin
        insert into public.word_examples (word_id, sentence) values (word_a, 'Hijacked example');
        raise exception 'FAIL: another user can insert an example';
    exception when insufficient_privilege then null;
    end;
    begin
        insert into public.words (user_id, word, meaning_en) values (user_a, 'Forged owner', 'Denied');
        raise exception 'FAIL: user can insert under another owner';
    exception when insufficient_privilege then null;
    end;

    word_b := public.save_word(null,
        '{"word":"Test vocabulary","meaning_en":"A different user may save the same word"}',
        '[{"sentence":"User B example"}]');
    begin
        update public.words set user_id = user_a where id = word_b;
        raise exception 'FAIL: user can reassign word ownership';
    exception when insufficient_privilege then null;
    end;
    begin
        update public.word_examples set word_id = word_a where word_id = word_b;
        raise exception 'FAIL: user can move examples to another owner';
    exception when insufficient_privilege then null;
    end;

    delete from public.words where id = word_b;
    if exists (select 1 from public.word_examples where word_id = word_b) then
        raise exception 'FAIL: example deletion did not cascade';
    end if;

    reset role;
    set local role anon;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    begin
        perform 1 from public.words limit 1;
        raise exception 'FAIL: unauthenticated table access was allowed';
    exception when insufficient_privilege then null;
    end;
    begin
        perform public.save_word(null, '{"word":"Anonymous","meaning_en":"Denied"}', '[]');
        raise exception 'FAIL: unauthenticated RPC access was allowed';
    exception when insufficient_privilege then null;
    end;
    reset role;
end;
$$;

select 'PASS: owner CRUD, duplicate prevention, transactional rollback, cross-user isolation, ownership checks, cascade deletion, and unauthenticated denial' as verification;
rollback;
