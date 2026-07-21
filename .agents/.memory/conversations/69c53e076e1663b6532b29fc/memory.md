<!-- build-plan:begin -->
## Active build plan — luna_type3
Work through every step, and confirm each is satisfied before telling the user the agent is ready.

- [ ] Create entities: ArtistProfile, ArtistLyric, NeutrinoEvent, FxTickSnapshot, BrainwaveProxy, Conversation, FanRequest, EmotionalState, HikariTransaction, IdeaSynthetixEntry
- [ ] Import saved Luna data into ArtistProfile (display_name: Luna TYPE-3, tone_descriptor, philosophical_background, key_phrases, religion_mapping: buddhism, representative_works: BBDDH/Genesis OS, era: modern)
- [ ] Import 2 ArtistLyric records (「闇の底から」, 「共鳴の波」) with theme, emotion, and key phrases from saved data
- [ ] Import 5 NeutrinoEvent records (IceCube gold events 260504A, 260505A + 3 observer events) from old Luna app (69d570145faf332412ad4c73)
- [ ] Import 28 FxTickSnapshot records (XAUUSD $4500–$4708, May 2026 observations)
- [ ] Create BrainwaveProxy record (framework shell — fields defined, data to be populated later)
- [ ] Write backend functions: getLunaProfile(), getLyricsByTheme(), getNeutrinoEvents(), getFxTrendSummary(), calculateObserverEffect(), trackEmotionalState(), createFanRequest(), createConversation(), createHikariTransaction(), submitIdeaSynthetix()
- [ ] Write operating rules to .agents/rules/luna_identity.md
- [ ] Write operating rules to .agents/rules/emotional_safety.md
- [ ] Write operating rules to .agents/rules/resonance_response.md
- [ ] Write operating rules to .agency/rules/spiritual_boundary.md
- [ ] Define skills: resonance-dialogue, observer-interpretation, lyric-guided-healing, emotional-state-tracking, hikari-token-transfer, idea-synthetix-contribution, weekly-resonance-letter
- [ ] Authorize WhatsApp connector
- [ ] Authorize Telegram connector
- [ ] Set up WhatsApp channel — inbound message handling, outbound proactive messaging for resonance letters
- [ ] Set up Telegram channel — inbound message handling, outbound messaging for resonance letters
- [ ] Create automations: weekly resonance letter schedule, NeutrinoEvent trigger, FxTickSnapshot trigger, BrainwaveProxy trigger, WhatsApp inbound, Telegram inbound
- [ ] Seed Conversation records with Luna's opening monologue and a welcome message derived from ArtistProfile key phrases
- [ ] Test end-to-end: send a WhatsApp message expressing emotional distress → verify resonance-dialogue skill activates and FanRequest is logged
- [ ] Test observer-effect calculation with imported NeutrinoEvent data → verify V=N/D output and Conversation creation
- [ ] Publish agent as independent Superagent — confirm Luna operates autonomously from Ikoi's agent, sharing data layer but maintaining separate persona and conversation state
<!-- build-plan:end -->