# Episode format

What an episode of the channel is: its structure, length and way of writing. For what happens on screen under the words,
see [visual-grammar.md](visual-grammar.md).

## Length

**12-14 minutes, about 1,900-2,200 words** at about 160 words per minute. The Chatterbox voice measured 162 wpm on the pilot
(182 words in 67.6 s). Check the real duration after the voice stage, as pauses add time. A test mini-episode keeps the same
structure at 3-4 minutes, about 480-640 words, with 1-2 acts.

## Structure

| Part | Length | What it does |
|---|---|---|
| **Cold open** | Up to 30 s | The central question, stated with something on the map that makes it strange. No greeting and no channel name |
| **Geography setup** | 1-2 min | The land the answer depends on: relief, rivers, coasts. Everything later refers back to it |
| **3-5 acts** | 2-3 min each | One map-driven idea per act. An act can be told by what happens on one map |
| **Twist or counter-argument** | 1-2 min | What the explanation so far misses. A real objection, not a rhetorical one |
| **Recap** | Up to 1 min | The answer, by recalling what was already shown. No new facts |
| **Outro** | Up to 30 s | One closing thought. The end card needs the final 20 s, [end-screen.md](end-screen.md) |

The word budget for a 13-minute episode, as a starting point: cold open 70, setup 240, acts 1,400, twist 200, recap 120, outro 50.

## Writing

**Spoken English, short sentences.** Read it aloud. One idea per sentence, most under 20 words. No long subordinate
clauses: the listener cannot go back.

**Map-first.** Every paragraph has a mappable subject: a place, a river, a route, a border, a date on a map. Before keeping a
paragraph, say what the map does during it, by the table in [visual-grammar.md](visual-grammar.md). If the answer is "nothing", rewrite it.

| Instead of | Write |
|---|---|
| Trade was central to the region's prosperity. | Silk came down this valley, to this one port. |
| The empire faced significant logistical challenges. | From here to the border is two months on foot. |
| Many historians believe that geography mattered. | Look where the mountains stop. That is where the empire stops. |

**Say what you can show, and name it once clearly.** Spell out numbers as they should be heard when it matters ("five eighty-nine");
see [voice.md](voice.md) for how numbers, years and names are read.

**Numbers in the voice.**

- **At most 2 numbers per paragraph.** Percentages, quantities and years all count.
- **Rounded.** "About four percent", "around fifteen hundred", not "1,492". Keep the precision the point needs and no more.
- **A dispute between sources is one phrase:** "sources differ on the exact shares". Who says what, the other figures and their dates go in `facts.md`. Naming a source aloud is for when
  its authority is the point, not as a habit.

A claim must still be honest at that level of detail: if the rounded figure or the short phrase would mislead, rewrite the sentence, or leave the claim out.

**Honest claims.** Every factual sentence has a line in `facts.md` with a source. Interpretation is worded as interpretation:
"gave rulers reasons to", not "made inevitable". Contested points say that they are contested.

## Markup

```markdown
# Episode title

<!-- Notes are not spoken. Record the approval here: who, when. -->

## The Heartland

First paragraph of narration. A blank line starts a new paragraph.

[pause 1.0]

A beat, then the next idea.
```

| Markup | Effect |
|---|---|
| `# Title` | Not spoken |
| `## Section` | Not spoken. Marks a section boundary (a 1.00 s pause). Each section opens with a `SectionTag` of that name in the storyboard, and will become a YouTube chapter (step 6.4) |
| Blank line | New paragraph (0.60 s pause) |
| `[pause s]` | Exactly that many seconds, from 0 to 30, instead of the automatic gap |
| `<!-- comment -->` | Not spoken |

YouTube needs at least 3 chapters of at least 10 s each, so give an episode at least 3 sections. Section names are short, with no
trailing punctuation.

## Before asking for approval

- [ ] 1,900-2,200 words (or the mini-episode's budget), within the part lengths above.
- [ ] The central question is in the first 30 s, and the recap answers it.
- [ ] Every paragraph has a subject you can point at on a map.
- [ ] Every factual sentence is in `facts.md`.
- [ ] No paragraph has over 2 numbers, numbers are rounded, and each dispute is one phrase.
- [ ] Each act's map can be built from an allowed source. Name any gap now, not at the storyboard.
- [ ] Read aloud once: no sentence runs out of breath.
