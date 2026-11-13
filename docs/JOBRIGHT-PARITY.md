# JobRight feature parity (honest map)

Goal: match **user-visible job-apply capabilities** JobRight offers, while keeping **local AI + privacy**.  
We do **not** clone JobRight’s cloud product, analytics, or proprietary code.

| Capability | JobRight | This extension | Status |
|---|---|---|---|
| Autofill core ATS (GH / Lever / Ashby) | ✅ | ✅ | Parity |
| Workday / LinkedIn Easy Apply | ✅ | ✅ basic (you press Next) | Strong |
| Workable / BambooHR / Taleo / JazzHR / SmartRecruiters / Rippling / iCIMS / Eightfold / SF / Oracle HCM | ✅ deep | ✅ dedicated adapters | **Upgraded** |
| Long-tail ATS (BrassRing, Comeet, UKG, …) | ✅ | ✅ detect + generic fill | Partial |
| Resume match keywords | ✅ cloud | ✅ local | Parity (local) |
| Resume tailor | ✅ cloud | ✅ local + fact-check | Parity (local) |
| Cover letters | ✅ | ✅ | Parity |
| Application tracker | ✅ cloud account | ✅ local tracker + success modal | Parity (local) |
| Answer memory | ✅ | ✅ answer bank | Parity |
| Guided Detect→Fill→Review→Submit UI | ✅ polished | ✅ Quiet Chrome flow | Close |
| Field discovery (ARIA / modern ATS) | ✅ AI snapshot | ✅ improved local collectors | Close |
| Cloud job recommendations feed | ✅ | ❌ by design | Skip (privacy) |
| Account / sync / password helpers | ✅ | ❌ by design | Skip (privacy/security) |
| In-app purchases / attribution | ✅ | ❌ | Skip |

## What “all features” means here

**Included:** fill coverage, discovery quality, tracker UX, resume/cover AI — locally.  
**Excluded:** anything that requires JobRight’s servers or handling passwords.

## Next increments (if you want more)

1. Live QA on real Taleo / Workable / BambooHR apply pages  
2. Deeper multi-step adapters for SuccessFactors / Oracle  
3. Promote long-tail detect-only sites to full adapters one-by-one  
