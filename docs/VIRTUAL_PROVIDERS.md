# Virtual LLM Providers Guide

Virtual providers enable advanced LLM orchestration patterns by routing requests through specialized decision-making or optimization models before (or instead of) calling your target LLM. OpenForge supports three types.

## Overview

When you create a virtual provider, it becomes available as a provider choice in Settings > AI Providers. When you select it for a workspace or chat, all requests are automatically routed through the configured logic.

---

## 1. Router (Complexity-Based Routing)

**Use case:** Route different types of requests to different models based on their complexity.

### How it Works

1. A **routing model** analyzes the user's prompt and scores its complexity (0-1 scale)
2. The complexity score determines which **tier** the request belongs to:
   - Simple (0.00-0.25): Fast, efficient models
   - Moderate (0.25-0.50): Balanced models
   - Complex (0.50-0.75): Capable models
   - Expert (0.75-1.00): Most capable models
3. The request is forwarded to the model configured for that tier
4. The response is streamed back to the user

### Configuration

Settings > AI Providers > Add Router

1. **Routing Model Provider** — The LLM that will score prompt complexity
   - Recommend: gpt-4o-mini, claude-opus-4-20250805, or similar

2. **Routing Model** — The specific model variant (e.g., `gpt-4o-mini`, `claude-opus-4`)

3. **Tiers** — For each complexity tier, assign:
   - **Provider** — Which LLM service to use
   - **Model** — The specific model (e.g., `gpt-3.5-turbo`, `claude-haiku`)

### Example Configuration

```
Routing Model: GPT-4o-mini (scores complexity)

Tiers:
  Simple (0.00-0.25)   → OpenAI gpt-3.5-turbo      [fast, cheap]
  Moderate (0.25-0.50) → Anthropic claude-haiku    [balanced]
  Complex (0.50-0.75)  → Anthropic claude-sonnet-4 [capable]
  Expert (0.75-1.00)   → OpenAI gpt-4o             [most capable]
```

### Benefits

- **Cost optimization** — Simple requests don't need expensive models
- **Speed** — Fast models handle easy questions instantly
- **Quality** — Hard questions get the most capable models
- **Automatic** — No user intervention required

---

## 2. Council (Multi-Model Deliberation)

**Use case:** Get multiple perspectives on a question and have an LLM choose the best response.

### How it Works

1. User sends a request
2. The request is sent to **all council member models** in parallel
3. All responses are collected
4. The **chairperson model** reads all responses and selects the best one, explaining why
5. The chairperson's selection is returned to the user

### Configuration

Settings > AI Providers > Add Council

1. **Chairperson Provider** — The LLM that judges responses
2. **Chairperson Model** — The specific model (e.g., `gpt-4o`)
3. **Council Members** — Add one or more models that will respond to the prompt
   - For each member: Provider, Model, and optional Display Label
4. **Parallel Execution** — Toggle to run all members simultaneously (default: on)
   - On = Faster but uses more API quota
   - Off = Sequential execution, slower but cheaper
5. **Custom Judging Prompt** (optional) — Override the chairperson's instructions

### Example Configuration

```
Chairperson: OpenAI gpt-4o (judges responses)

Members:
  1. Anthropic claude-sonnet-4
  2. OpenAI gpt-4o-mini
  3. Google gemini-2.0-flash

Parallel: Yes (all respond simultaneously)
```

### Benefits

- **Better answers** — Multiple LLMs often catch different aspects
- **Transparency** — Chairperson explains which response is best and why
- **Redundancy** — If one model fails, others still provide responses
- **Quality assurance** — Chairperson selection ensures high-quality output

### When to Use

- Research questions where you want multiple perspectives
- When you want the most comprehensive answer
- For questions where reasoning quality matters more than speed

---

## 3. Optimizer (Prompt Enhancement)

**Use case:** Automatically improve user prompts before sending to the target LLM.

### How it Works

1. User sends a prompt (e.g., "tell me about react hooks")
2. The **optimizer model** receives the prompt and improves it
   - Adds specificity where vague
   - Structures multi-part questions clearly
   - Preserves original intent
   - **Does NOT answer** the question — just rewrites it
3. The **optimized prompt** replaces the user's original prompt
4. The optimized prompt is sent to the **target model**
5. The target model responds to the improved prompt

### Configuration

Settings > AI Providers > Add Optimizer

1. **Optimizer Provider** — The LLM that improves prompts
   - Recommend: gpt-4o-mini (fast, good prompt rewriting)
2. **Optimizer Model** — The specific model (e.g., `gpt-4o-mini`)
3. **Target Provider** — The LLM that answers the optimized prompt
4. **Target Model** — The specific model you want to use
5. **Optimization Prompt** (optional) — Custom instructions for the optimizer
6. **Additional Context** (optional) — Extra context to provide with every prompt

### Example Configuration

```
Optimizer: GPT-4o-mini (improves prompts)
Target: Anthropic Claude Sonnet (answers questions)

Optimization Prompt:
  "Rewrite this prompt to be more specific and better structured.
   Preserve intent. Return ONLY the improved prompt."

Additional Context:
  "You are helping a software engineer. Assume technical background."
```

### Benefits

- **Better responses** — Well-structured prompts produce better answers
- **More specific** — Optimizer adds detail where user is vague
- **Clearer questions** — Multi-part questions are better organized
- **Consistent quality** — Optimizer standardizes prompt quality

### Example Improvements

```
User prompt:
  "tell me about react hooks"

Optimized prompt:
  "Explain React Hooks (useState, useEffect, useCallback, useMemo, useReducer)
   with practical examples. Show when to use each, common pitfalls,
   performance implications, and how they replaced class lifecycle methods."
```

---

## Composing Virtual Providers

Virtual providers can be **nested** — you can chain them together:

- **Optimizer → Router** — Optimize the prompt, then route by complexity
- **Optimizer → Council** — Optimize the prompt, then get multiple perspectives
- **Council → Router** — Get council selections, route to appropriate tier

### Example: Optimizer + Router

```
Settings > AI Providers > Add Router

Then in Router configuration:
  Routing Model: GPT-4o-mini

  Create a different virtual optimizer for each tier:
    Simple tier     → Optimizer1 (uses fast optimizer)
    Moderate tier   → Optimizer2 (uses medium optimizer)
    Complex tier    → Optimizer3 (uses capable optimizer)

Result: Prompts are optimized, complexity-routed, then answered.
```

---

## Best Practices

### Router
- Use a **fast, cheap model** as the router (gpt-4o-mini, claude-haiku)
- Configure tiers to match your LLM lineup
- Start simple: 2-3 tiers is often enough

### Council
- Use **3-5 different models** for best deliberation
- Pick models with **different strengths** (e.g., code, writing, reasoning)
- Use a **capable model** as chairperson (gpt-4o, claude-opus)
- Keep parallel execution **on** unless cost is critical

### Optimizer
- Use a **fast, cheap optimizer** (gpt-4o-mini recommended)
- Keep optimization prompts **simple and clear**
- Test that optimized prompts are actually better
- Use additional context to guide the optimizer

### Cost Optimization
1. **Router + cheap tiers** — Route simple queries to cheap models
2. **Use cache** — Optimize once, cache results, serve multiple users
3. **Sequential council** — If cost > speed, disable parallel execution
4. **Monitor routing** — Check provider logs to see how requests are routed

---

## Troubleshooting

### Router not routing correctly
- Verify routing model is configured and working
- Check model complexity scores in logs
- Ensure all tiers have both provider and model set

### Council responses too slow
- Disable parallel execution if some members are slow
- Use faster models as council members
- Reduce number of members

### Optimizer making prompts worse
- Review optimized prompts in chat history
- Adjust optimization prompt instructions
- Try a different optimizer model

---

## API Reference

Virtual providers are configured via these REST endpoints:

### Router Config
```
GET  /api/v1/llm/virtual/{provider_id}/router-config
POST /api/v1/llm/virtual/{provider_id}/router-config
PUT  /api/v1/llm/virtual/{provider_id}/router-config
```

### Council Config
```
GET  /api/v1/llm/virtual/{provider_id}/council-config
POST /api/v1/llm/virtual/{provider_id}/council-config
PUT  /api/v1/llm/virtual/{provider_id}/council-config
```

### Optimizer Config
```
GET  /api/v1/llm/virtual/{provider_id}/optimizer-config
POST /api/v1/llm/virtual/{provider_id}/optimizer-config
PUT  /api/v1/llm/virtual/{provider_id}/optimizer-config
```

---

## What's Next?

- Try creating a **simple router** with 2 models
- Experiment with **council** for research questions
- Use **optimizer** for vague user queries
- Combine them for advanced workflows

All virtual provider decisions are **logged and transparent** — see the "LLM" badge in chat history to expand and view internal routing decisions.
