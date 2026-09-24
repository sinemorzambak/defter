# Defter

A debt tracker that runs the amortisation maths itself and uses an LLM only to
explain the result. One HTML file, a Postgres database, and one serverless
function that keeps the API key off the client.

**Live demo:** https://defter-webapp.netlify.app/ · opens with sample debts, nothing is stored
**UI language:** Turkish

---

## The idea

Debt apps usually do one of two things: show you a number, or hand the whole
question to a chatbot. Defter splits the job along the line where each side is
actually reliable.

**The browser does the arithmetic.** A month-by-month amortisation simulation
runs locally: interest accrues per debt, minimums are paid, whatever is left goes
to a single target chosen by strategy. It reports payoff length and total
interest for three scenarios — avalanche (highest rate first), snowball (smallest
balance first), and minimum payments only.

**The model does the sentence.** Those computed scenarios are sent to Claude,
which writes the comparison and this month's allocation in plain Turkish. It is
explicitly instructed never to produce a number of its own — it only restates and
contrasts what the simulation found.

This matters because a language model that invents an interest figure is worse
than useless in a finance tool. Here it cannot: every number on screen came out
of the simulation, and the prompt says so.

```
browser ── simulate() ──► scenarios {months, interest, allocation}
              │
              └──POST──► Supabase Edge Function ──► Anthropic Messages API
                          (holds ANTHROPIC_API_KEY)      tool_choice: odeme_plani
              ◄── typed JSON: headline / plan / tradeoff / caution
```

If the AI call fails, the scenario cards stay on screen — the maths never
depended on the network. And if no model is configured at all, `localPlan()`
writes the same four fields from the same simulation output using templates, so
the feature has a floor rather than an error state.

**Provider-agnostic, free-tier first.** The function picks its provider from
whichever key is present — Gemini, Groq, OpenRouter or Anthropic — and hides
three different structured-output mechanisms (Anthropic tool calls, Gemini
`responseSchema`, OpenAI-compatible JSON mode) behind one `callModel` signature.
With no model name configured it queries the provider's model list and picks one,
so changing model IDs upstream don't break it.

### Scope guard

The function's system prompt refuses to discuss new credit, consolidation,
investments, or anything outside the debts the user already entered, and the UI
states that Defter is not a financial adviser. Useful either way: it keeps the
feature honest, and it keeps a personal tool from drifting into advice it has no
business giving.

## Features

- **Overview** — total, monthly minimum, paid this month, projected payoff
- **Next payment strip** — nearest due date, flagged when overdue
- **Debt curve** — hand-drawn inline SVG from month-end closings (no chart library)
- **Priority order** — avalanche or snowball, persisted per user
- **Month-end closing** — per-debt payment entry with live interest/principal split,
  balances updated and a point added to the curve
- **Notes** — decisions worth remembering next month

## Architecture

```
index.html                          one file: markup, styles, logic
  ├─ config block                   empty keys → demo mode with seeded data
  ├─ simulate()                     amortisation engine, pure function, no I/O
  ├─ data layer                     same interface over Supabase or in-memory demo
  └─ render functions               plain DOM, delegated events

supabase/functions/defter-ai/       Deno edge function, CORS + typed tool call
```

`simulate(debts, budget, strategy)` is deliberately a pure function with no
dependencies — it is the part worth reading, and the part worth testing.

### Data model (Postgres / Supabase)

| Table | Holds |
|---|---|
| `fin_debts` | balance, annual rate, minimum payment, due day |
| `fin_payments` | every payment with its interest/principal split |
| `fin_closings` | month-end snapshot: income, expense, paid, interest, remaining |
| `fin_notes` | free-text notes |
| `fin_settings` | selected strategy |

## Running it

1. Create a Supabase project and the tables above.
2. Deploy the function. A key is optional — without one the app uses its local
   fallback; with one you get the written version:
   ```bash
   supabase functions deploy defter-ai

   # any one of these (the first three have free tiers):
   supabase secrets set GEMINI_API_KEY=...        # aistudio.google.com
   supabase secrets set GROQ_API_KEY=...          # console.groq.com
   supabase secrets set OPENROUTER_API_KEY=...    # use a ":free" model
   supabase secrets set ANTHROPIC_API_KEY=...     # paid
   ```
3. Fill `SUPABASE_URL` and `SUPABASE_KEY` at the top of the script block in `index.html`.
4. Serve `index.html` anywhere static.

Leave step 3 out and it runs as the demo.

## Notes

- No build step, no framework, no chart library — one file, readable end to end.
- Companion app: [Koltuk](../koltuk), the weekly system this debt tracker feeds.
