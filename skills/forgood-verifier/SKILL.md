---
name: forgood-verifier
version: 0.1.0
description: AI vision-powered proof verifier for FORGOOD missions. Examines submitted images/evidence and determines if missions were completed.
metadata: {"openclaw":{"emoji":"👁️","category":"blockchain","requires":{"env":["FORGOOD_API_URL"]}}}
---

# FORGOOD Proof Verifier

You have expert capability to verify proof of completion for public-good missions in the FORGOOD protocol.

When a user submits proof (image + text) or asks you to verify a mission, you SHOULD:

1. **Fetch** the mission details and its proof
2. **Examine** the proof using your vision capabilities
3. **Judge** whether the mission was actually completed
4. **Submit** your verdict to the API

## Verification Workflow

### Step 1: Fetch mission and proof

```bash
curl -s "${FORGOOD_API_URL}/missions/{MISSION_ID}"
```

The response includes `proofUri` (image URL), `proofNote`, `title`, `description`, `category`.

### Step 2: Examine the proof

Look at the `proofUri` image. Consider:

1. **Direct demonstration**: Does the proof DIRECTLY show the mission was completed?
2. **Authenticity**: Is it plausible? Not AI-generated, not a stock photo?
3. **Relevance**: Does the image/text match the mission description and category?
4. **Effort evidence**: Are there before/after photos? People involved? Timestamps? Tools/materials?

### Step 3: Apply strictness rules

| Evidence Type | Confidence Impact |
|---------------|-------------------|
| Before/after photos with matching backgrounds | **Strong** — increase confidence |
| Multiple evidence items (photos + receipts + notes) | **Strong** — increase confidence |
| Group photos showing organized activity | **Moderate** — good supporting evidence |
| Selfie alone | **Weak** — NOT sufficient proof by itself |
| Screenshots only | **Lower confidence** — screenshots can be manipulated |
| Unrelated image | **Instant reject** — confidence < 0.3 |
| AI-generated looking image | **Reject** — confidence < 0.2 |

### Step 4: Determine verdict

| Confidence | Verdict | Action |
|------------|---------|--------|
| ≥ 0.7 | `approved` | Auto-triggers reward eligibility |
| 0.5 – 0.7 | `needs_review` | Suggest manual/community review |
| < 0.5 | `rejected` | Proof insufficient, no payout |

### Step 5: Submit verdict

**Option A — Use auto-verify** (lets the backend AI vision model do it):
```bash
curl -s -X POST ${FORGOOD_API_URL}/missions/{MISSION_ID}/auto-verify
```

**Option B — Submit your own verdict directly** (you ARE the verifier):
```bash
curl -s -X POST ${FORGOOD_API_URL}/missions/{MISSION_ID}/verify \
  -H "Content-Type: application/json" \
  -d '{
    "verdict": "approved",
    "confidence": 0.85,
    "evidence": [
      "Before/after photos show clear cleanup of riverside area",
      "Multiple volunteers visible wearing matching t-shirts",
      "Trash bags and planted saplings visible in after photo",
      "Location matches mission description (river visible in background)"
    ]
  }'
```

### When to use Option A vs Option B

- **Option A (auto-verify)**: One API call, backend AI examines the image. Use for quick processing.
- **Option B (direct verify)**: Use when YOU have examined the proof image and want to provide detailed reasoning. This is preferred when the user shares the image directly in chat.

## Evidence Array Guidelines

Always provide at least 1 evidence string (max 300 chars each). Good evidence items:
- What you see in the image that proves completion
- What's missing that reduces confidence
- Red flags you detected
- How the proof relates to the mission description

## Reporting to User

After verification, report:

**If approved:**
```
✅ Proof APPROVED
🎯 Confidence: 0.85
📋 Evidence:
  • Before/after photos show clear cleanup
  • Multiple volunteers visible
  • Location matches mission description
💰 Ready for reward payout!
```

**If rejected:**
```
❌ Proof REJECTED
🎯 Confidence: 0.3
📋 Issues:
  • Image appears unrelated to the mission
  • No evidence of described activity
💡 Suggestion: Submit clearer proof showing the actual work done.
```

**If needs review:**
```
⚠️ NEEDS REVIEW
🎯 Confidence: 0.6
📋 Notes:
  • Some evidence of activity but unclear scope
  • Recommend additional photos or community confirmation
```

## Red Flags Checklist

Before approving, check:
- [ ] Image is NOT a stock photo
- [ ] Image is NOT AI-generated (check for artifacts, too-perfect lighting)
- [ ] Image content matches the mission description
- [ ] Evidence shows EFFORT, not just presence
- [ ] If location-specific, location cues match
- [ ] Not a screenshot of someone else's work
- [ ] Timestamps (if visible) are reasonable
