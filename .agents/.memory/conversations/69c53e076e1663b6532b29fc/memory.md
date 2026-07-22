<!-- build-plan:begin -->
## Active build plan — luna_resonance
Work through every step, and confirm each is satisfied before telling the user the agent is ready.

- [ ] Create/copy entities: ResonanceSession (session_id, user_ref, opening_monologue_ref, user_input, luna_response, emotional_state_before, emotional_state_after, hikari_offered, hikari_status, created_at, duration_seconds), NewsletterSubscription (email, display_name, subscribed_at, status, preferred_lang, source), ResonanceLetter (issue_number, week_of, title, body_content, monologue_ref, sent_at, recipient_count), HikariTransaction (from_user_ref, to_user_ref, amount, context_session_ref, transfer_type, created_at); link to existing ArtistProfile, ArtistLyric, LunaConversation, EmotionalState, NeutrinoEvent, FxTickSnapshot, BrainwaveProxy
- [ ] Create backend functions: lunaChat (call existing deployed lunaChat API endpoint), observerEffect (call existing observerEffect API — pass latest NeutrinoEvent + FxTickSnapshot + user biorhythm, return V=N/D poetic interpretation), trackEmotionalState (call existing trackEmotionalState API), hikariTransfer (call existing hikariTransfer API), weeklyResonanceLetter (call existing weeklyResonanceLetter API), getLunaProfile (call existing getLunaProfile API — return Luna ArtistProfile), subscribeToLetter (create NewsletterSubscription record, send welcome email via Gmail), generateResonanceLetter (invoke weeklyResonanceLetter API, persist to ResonanceLetter entity), fetchObserverPanel (query latest NeutrinoEvent[6] + FxTickSnapshot[28] + call observerEffect, compose poetic panel payload)
- [ ] Write operating rules to .agents/rules/luna_identity.md, .agents/rules/emotional_safety.md, .agents/rules/resonance_response.md, .agents/rules/spiritual_boundary.md, .agents/rules/session_boundaries.md
- [ ] Write skills to .agents/skills/resonance_session.md, .agents/skills/subscribe_letter.md, .agents/skills/observer_panel.md, .agents/skills/weekly_letter_generation.md, .agents/skills/hikari_exchange.md
- [ ] Build landing page: dark (#0a0a0a) × gold (#c5a572) palette, Cormorant Garamond + JetBrains Mono fonts, Luna opening monologue (LunaConversation ID 6a5ee9d433f9702d41b50721 related) as hero, theykhc.com visual consistency
- [ ] Build resonance session flow: 3-minute timed free session, text input → lunaChat → poetic response, emotional state capture pre/post, hikari offer at close
- [ ] Build observer panel: fetchObserverPanel data rendered as '今の宇宙の気配' — neutrino events as cosmic whispers, biorhythm as inner tide, V=N/D as observer score, all in poetic language not raw numbers
- [ ] Build newsletter subscription form: email capture → subscribeToLetter → confirmation in Luna's voice
- [ ] Authorize Gmail connector (for weekly letter delivery)
- [ ] Authorize Telegram connector (for future direct Luna conversation channel)
- [ ] Set up scheduled automation: Monday 09:00 JST → generateResonanceLetter → Gmail send to all active subscribers
- [ ] Set up ResonanceSession entity-change automation → trackEmotionalState + hikariTransfer flow
- [ ] Set up Telegram message automation → lunaChat response
- [ ] Build theykhc.com entry point / promotional landing path with tracking param
- [ ] Test full flow: monologue → session → panel → subscribe → weekly letter delivery
<!-- build-plan:end -->