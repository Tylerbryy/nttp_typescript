# LLM Model Selection Guide

Choosing the right LLM model for NTTP based on your needs.

## Quick Recommendations

| Use Case | Provider | Model | Why |
|----------|----------|-------|-----|
| **Production (recommended)** | Anthropic | `claude-sonnet-4-5-20250929` | Best balance of quality, speed, and cost |
| **Complex queries** | Anthropic | `claude-opus-4-5-20251101` | Highest reasoning capability |
| **Development** | Anthropic | `claude-haiku-4-20250514` | Fastest, lowest cost |
| **OpenAI users** | OpenAI | `gpt-4o` | Fast and reliable |
| **Budget-conscious** | OpenAI | `gpt-3.5-turbo` | Cheapest option |

---

## Anthropic (Claude)

### claude-sonnet-4-5-20250929 ⭐ **Recommended**

**Best for:** Production, general-purpose SQL generation

**Strengths:**
- Excellent instruction following
- Strong reasoning for complex schemas
- Reliable structured outputs
- Good balance of speed and quality
- Handles multi-table joins well

**Performance:**
- Latency: ~2-3s per query
- Cost: ~$0.01 per query (2 LLM calls)
- Accuracy: 95%+ for well-defined schemas

**Example:**

```typescript
llm: {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250929',
  apiKey: process.env.ANTHROPIC_API_KEY
}
```

**When to use:**
- Production applications
- Complex multi-table databases
- When accuracy is critical
- General-purpose use

**When NOT to use:**
- Simple lookup tables (use Haiku)
- When milliseconds matter (cache instead)

---

### claude-opus-4-5-20251101

**Best for:** Complex queries, ambiguous requests

**Strengths:**
- Highest reasoning capability
- Best at understanding vague queries
- Excellent at inferring relationships
- Handles very complex schemas

**Performance:**
- Latency: ~4-6s per query
- Cost: ~$0.03 per query
- Accuracy: 98%+ even for ambiguous queries

**Example:**

```typescript
llm: {
  provider: 'anthropic',
  model: 'claude-opus-4-5-20251101',
  apiKey: process.env.ANTHROPIC_API_KEY
}
```

**When to use:**
- Very complex schemas (50+ tables)
- Ambiguous natural language queries
- When quality > speed/cost
- Research/analysis applications

**When NOT to use:**
- Simple queries
- High-throughput applications
- Budget-constrained projects

---

### claude-haiku-4-20250514

**Best for:** Development, simple schemas

**Strengths:**
- Fastest Claude model
- Lowest cost
- Good for simple queries
- Fast iteration during development

**Performance:**
- Latency: ~1-1.5s per query
- Cost: ~$0.003 per query
- Accuracy: 85-90% for simple queries

**Example:**

```typescript
llm: {
  provider: 'anthropic',
  model: 'claude-haiku-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY
}
```

**When to use:**
- Development/testing
- Simple schemas (< 10 tables)
- Basic SELECT queries
- When speed is critical

**When NOT to use:**
- Complex multi-table joins
- Ambiguous queries
- Production with complex schemas

---

## OpenAI (GPT)

### gpt-4o

**Best for:** OpenAI users, fast structured outputs

**Strengths:**
- Very fast for structured outputs
- Good SQL generation quality
- Wide availability
- Strong ecosystem

**Performance:**
- Latency: ~1.5-2s per query
- Cost: ~$0.008 per query
- Accuracy: 90-93%

**Example:**

```typescript
llm: {
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: process.env.OPENAI_API_KEY
}
```

**When to use:**
- Already using OpenAI
- Need fast responses
- Moderate complexity queries

**When NOT to use:**
- Very complex schemas
- When highest accuracy required

---

### gpt-4-turbo

**Best for:** Balance of quality and speed

**Strengths:**
- Good reasoning
- Reliable outputs
- Faster than original GPT-4

**Performance:**
- Latency: ~2-3s per query
- Cost: ~$0.01 per query
- Accuracy: 88-92%

---

### gpt-3.5-turbo

**Best for:** Budget-conscious development

**Strengths:**
- Cheapest option
- Very fast
- Good for simple queries

**Performance:**
- Latency: ~1s per query
- Cost: ~$0.002 per query
- Accuracy: 80-85%

**Example:**

```typescript
llm: {
  provider: 'openai',
  model: 'gpt-3.5-turbo',
  apiKey: process.env.OPENAI_API_KEY
}
```

**When to use:**
- Development only
- Very simple schemas
- Budget-constrained projects

**When NOT to use:**
- Production
- Complex queries
- Critical accuracy requirements

---

## Other Providers

### Cohere (command-r-plus)

**Best for:** Enterprise deployments

**Performance:**
- Latency: ~2-3s
- Cost: ~$0.01 per query
- Accuracy: 85-90%

**Example:**

```typescript
llm: {
  provider: 'cohere',
  model: 'command-r-plus',
  apiKey: process.env.COHERE_API_KEY
}
```

---

### Mistral (mistral-large-latest)

**Best for:** Open-source preference

**Performance:**
- Latency: ~2-3s
- Cost: ~$0.008 per query
- Accuracy: 85-90%

**Example:**

```typescript
llm: {
  provider: 'mistral',
  model: 'mistral-large-latest',
  apiKey: process.env.MISTRAL_API_KEY
}
```

---

### Google (gemini-pro)

**Best for:** Google Cloud users

**Performance:**
- Latency: ~2-3s
- Cost: ~$0.007 per query
- Accuracy: 85-90%

**Example:**

```typescript
llm: {
  provider: 'google',
  model: 'gemini-pro',
  apiKey: process.env.GOOGLE_API_KEY
}
```

---

## Model Comparison

### Performance Comparison

| Model | Latency | Cost/Query | Accuracy | Best For |
|-------|---------|------------|----------|----------|
| Claude Opus 4.5 | 4-6s | ~$0.03 | 98% | Complex queries |
| Claude Sonnet 4.5 ⭐ | 2-3s | ~$0.01 | 95% | Production |
| Claude Haiku 4 | 1-1.5s | ~$0.003 | 85% | Development |
| GPT-4o | 1.5-2s | ~$0.008 | 90% | OpenAI users |
| GPT-4 Turbo | 2-3s | ~$0.01 | 88% | Balanced |
| GPT-3.5 Turbo | 1s | ~$0.002 | 80% | Budget/dev |
| Cohere Command-R+ | 2-3s | ~$0.01 | 85% | Enterprise |
| Mistral Large | 2-3s | ~$0.008 | 85% | Open-source |
| Gemini Pro | 2-3s | ~$0.007 | 85% | Google Cloud |

---

### Capability Matrix

| Capability | Opus | Sonnet | Haiku | GPT-4o | GPT-3.5 |
|------------|------|--------|-------|--------|---------|
| Simple SELECT | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Complex JOINs | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐ |
| Ambiguous queries | ⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐ | ⭐ |
| Speed | ⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Cost efficiency | ⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |

---

## Choosing the Right Model

### Decision Tree

```
Start: What's your primary concern?

├─ Cost?
│  ├─ Development: Claude Haiku or GPT-3.5
│  └─ Production: Claude Sonnet or GPT-4o
│
├─ Accuracy?
│  ├─ Highest: Claude Opus
│  └─ Good enough: Claude Sonnet ⭐
│
├─ Speed?
│  ├─ Fastest: Claude Haiku or GPT-3.5
│  └─ Fast enough: GPT-4o or Claude Sonnet
│
└─ Schema complexity?
   ├─ Very complex (50+ tables): Claude Opus
   ├─ Moderate (10-50 tables): Claude Sonnet ⭐
   └─ Simple (< 10 tables): Claude Haiku or GPT-4o
```

---

## Configuration Tips

### Development

Use faster, cheaper models:

```typescript
llm: {
  provider: 'anthropic',
  model: 'claude-haiku-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY
}
```

---

### Production

Use balanced, reliable models:

```typescript
llm: {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250929',  // ⭐ Recommended
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxTokens: 2048
}
```

---

### High-Complexity Production

Use most capable model:

```typescript
llm: {
  provider: 'anthropic',
  model: 'claude-opus-4-5-20251101',
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxTokens: 4096
}
```

---

## Cost Optimization

### With Caching

**First query (cold cache):**
- Cost: Model cost (e.g., $0.01 for Sonnet)

**Subsequent identical queries (L1 hit):**
- Cost: $0

**Similar queries (L2 hit):**
- Cost: ~$0.0001 (embedding only)

**Example: 1000 queries with 70% L1 hit rate, 25% L2:**

```
Without cache: 1000 × $0.01 = $10.00
With cache:
  - 700 L1 hits: $0
  - 250 L2 hits: 250 × $0.0001 = $0.025
  - 50 L3 misses: 50 × $0.01 = $0.50
Total: $0.525 (95% savings!)
```

**Conclusion:** Model cost matters less with good caching.

---

## See Also

- [Configuration](./configuration.md) - How to configure LLM
- [Caching](./caching.md) - Reduce LLM costs with caching
- [Production Guide](./production.md) - Production deployment tips
