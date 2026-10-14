# PaintPilot — six user-specified release art prompts (RQP-2026-10-13-02)

**Status:** the authoritative *new* six-scene prompt set, as supplied by the user on 2026-10-13. Supersedes `RQP-2026-10-13-01` (pagoda / cabin / Mykonos / musician / landscape / bookstall), which is retained as historical evidence but **must not** be used for the current qualification.

**Execution:** COS Plugins → PaintPilot MCP Guard → Photoshop UXP. **Never ImageGen**, external generated images, imported finished paintings, or traced substitutes. The prompts below reproduce the user's text without editing, compressing, or silently altering style. Every trial starts as a new layered Photoshop document; every pass and rejection is retained. An unfinished trial remains a failure, not a completed scene.

**Trial provenance:** the first S01 Photoshop attempt preceded creation of this consolidated manifest. It is an *exploratory failed attempt*, not a clean preregistered six-scene acceptance result. See [S01 incident / exact continuation](RELEASE-S01-TIGER-INCIDENT-20261013.md). Independent evaluation, baseline comparison, and final scores are **PENDING**.

## S01 — Siberian tiger and full moon

**Test canvas:** 1200 × 1800 RGB (vertical; matches live document 3508). The user's prompt specifies vertical composition, not an exact aspect ratio.

> Realistic romantic oil painting, powerful adult Siberian tiger standing on a moss-covered rocky mountain ledge, roaring upwards towards a glowing full moon in a dark misty night sky, dramatic moody low-key lighting, deep indigo night tones contrasted with warm orange fur highlights, towering forested misty mountain peaks in the background, detailed fur texture, atmospheric cloud layers, classic 19th century landscape painting aesthetic, cinematic vertical composition

**Status:** exploratory attempt blocked, PSD saved; **NOT ACCEPTED**.

## S02 — Historic European canal bistro

**Test canvas:** 1600 × 1200 RGB (4:3 evaluation setting; user specified no exact ratio).

> Cozy upscale riverside bistro interior next to a historic European canal, drawn in iconic Moebius (Jean Giraud) illustration style, maximalist intricate design, every corner packed with rich fine details. Foreground features abundant beautifully arranged regional gourmet dishes, neatly displayed on the service counter, happy diners chatting and laughing at wooden dining tables, warm glowing pendant lamp lighting creating a cozy bustling welcoming atmosphere. Outside the large window view: old stone arch bridge, historic waterfront town buildings, passing canal tour boats, soft sunny afternoon lighting, ultra sharp 32K hyper-detailed texture, warm earthy color palette, cinematic illustration style.

**Status:** not started.

## S03 — Train and mirrored water

**Test canvas:** 1080 × 1920 RGB (9:16, explicitly requested).

> Vibrant cinematic anime aesthetic, vintage blue and white commuter train with warm glowing yellow headlights, running on rural railway tracks lined with small patches of green grass. The train sits in the lower left third of the frame, moving forward gently. Below the tracks, perfectly still mirror-like water creates a flawless 1:1 symmetrical reflection of the train and bright blue sky, fluffy cumulus clouds, thin overhead power lines stretching into the far distance. Clear bright sunny day, deep saturated cobalt blue sky with wispy streaky cloud textures, soft warm daylight, dreamy serene hopeful atmosphere, romantic feeling of freedom and wanderlust, clean sharp details, balanced symmetrical composition, photorealistic rendering, 9:16 vertical aspect ratio

**Status:** not started.

## S04 — Cyberpunk metropolis

**Test canvas:** 1400 × 1800 RGB (evaluation setting; user specified no exact ratio).

> Cyberpunk futuristic neon-lit metropolitan city street at night, towering dark glass skyscrapers covered in glowing holographic advertisement screens and bright neon billboards, iconic central observation tower glowing with soft pink neon light standing between the skyscrapers, sleek futuristic sports cars parked on wet reflective asphalt street, wet road surface reflects electric blue and magenta neon light, overall color palette of electric cyan, hot pink, deep purple and dark night tones, sharp cinematic sci-fi aesthetic, all signage and advertisement text is in stylized futuristic English, no Chinese characters, atmospheric misty night sky, dense immersive cyberpunk city atmosphere, hyper-detailed, photorealistic, gritty futuristic street scene

**Status:** not started.

## S05 — Red folk-art rubber stamp

**Test canvas:** 1200 × 1200 RGB (square, explicitly requested as square stamp).

> Vintage hand-carved square rubber stamp print, minimalist bold red line art of a cozy traditional cottage courtyard with small outbuildings, bare winter trees, and low gate wall, stamped on soft textured off-white cotton art paper, rustic folk art aesthetic, weathered uneven stamp edges, warm antique handcrafted feel, clean composition centered on the stamp

**Status:** not started.

## S06 — Watercolor ceremonial elephant

**Test canvas:** 1400 × 1750 RGB (evaluation setting; user specified no exact ratio).

> Ethereal soft watercolor illustration, majestic ornate white ceremonial elephant decorated with delicate pearl necklaces, inlaid semi-precious gemstones, intricate filigree metal carvings, tiny hanging brass bell chains, and handwoven decorative tapestry saddle. Small swallow birds flying and perching on the elephant, soft pastel exotic flowering plants scattered around its feet. Muted pale powder blue wash background, balanced minimalist composition, dreamlike surreal fairytale atmosphere, subtle Byzantine and soft rococo decorative influences, organic painterly texture, gentle depth of field, calm serene whimsical mood, clean watercolor bleed edge details

**Status:** not started.

## Release acceptance

All six are judged against their individual **original prompts**, image-first, with the quantitative/safety criteria in [RELEASE-HARDENING.md](RELEASE-HARDENING.md). Do not add theme-specific Guard exceptions. Do not attribute Photoshop acceptance to an ImageGen output, prompt-only mock, tool success, or a source-only test. Preserve PSD, exact frames, layer bindings, latency and rejections per attempt. Register the frozen candidate commit and loaded MCP/UXP fingerprints for each run.

**Candidate at exploratory S01:** `e345698b3736dff5b0f7bdb07c170762f593c644`, with verified live MCP/UXP identity before painting. Recording this new prompt manifest does not retrospectively turn the exploratory S01 into a preregistered pass.
