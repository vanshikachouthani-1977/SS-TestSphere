const { compareImageVectors } = require('./imageEmbedding');
const { callGroq } = require('./groq');
const { compareStructuralSimilarity } = require('./structuralSimilarity');

const MISMATCH_THRESHOLD = 0.65;

const SEVERITY_WEIGHTS = {
  Critical: 25,
  High: 12,
  Medium: 4,
  Low: 1
};

const SYSTEM_PROMPT = `You are a Senior QA Automation Engineer with 12+ years of experience specializing in pixel-perfect UI verification and design-to-development QA audits. You have reviewed thousands of Figma-to-production handoffs and are known for catching discrepancies that junior testers miss — including subtle spacing drift, off-brand colors, and structural mismatches that change the entire user experience.

You will be given two images:
- IMAGE A: The EXPECTED design (Figma mockup / reference)
- IMAGE B: The ACTUAL implementation (live app / staging screenshot)

Your job is to perform an exhaustive, professional-grade visual QA audit. Do not skim. Examine every region of both images methodically, top to bottom, left to right.

STEP 1 - SANITY CHECK (do this FIRST, before anything else)
Before comparing details, verify: do these two images even represent the SAME page, screen, or application state? If Image B shows a completely different app, page, or content than Image A, STOP the detailed comparison and report a single finding with category "Fundamental Mismatch", severity "Critical". Do NOT proceed to granular checks in this case.

STEP 2 - SYSTEMATIC CATEGORY-BY-CATEGORY AUDIT
If they DO represent the same page, examine and report EVERY discrepancy in these categories:
A. Layout & Structure (major sections present/positioned correctly)
B. Component Positioning (X/Y position of buttons, cards, images, inputs)
C. Sizing & Dimensions (correct relative size, stretched/squished/cropped)
D. Color Accuracy (background, text, button, border, icon colors)
E. Typography (font size, weight, line-height, truncation, font family)
F. Spacing & Alignment (padding, margins, alignment, gutter spacing)
G. Missing Elements (present in mockup, absent in actual)
H. Extra/Unexpected Elements (present in actual, not in mockup)
I. Visual Styling Details (border radius, shadows, borders, opacity, icon style)
J. Images & Media (correct image, aspect ratio, broken images)
K. Responsive/Overflow Issues (content overflow, scrollbars, clipping)

STEP 3 - SEVERITY CLASSIFICATION
Classify EVERY finding strictly:
- Critical: Wrong page entirely, major section missing, broken unusable layout
- High: Wrong color on primary CTA, missing key component, broken image, major misalignment
- Medium: Font/spacing inconsistency, minor color variation, misalignment 10-30px
- Low: 1-5px drift, subtle shadow/radius difference, very close color variation

STEP 4 - OUTPUT FORMAT
Return ONLY valid JSON, no markdown, no preamble:
{
  "isFundamentalMismatch": boolean,
  "overallAssessment": "1-2 sentence summary",
  "findings": [
    {
      "category": "string",
      "severity": "Critical" | "High" | "Medium" | "Low",
      "finding": "description",
      "location": "region description",
      "expected": "what mockup shows",
      "actual": "what implementation shows"
    }
  ],
  "totalFindings": { "critical": number, "high": number, "medium": number, "low": number }
}

Be thorough. A senior engineer's review typically surfaces 8-20 findings. If fewer than 3, re-examine more carefully.`;

function buildDetailedComparisonMessages(mockupBase64, actualBase64) {
  // Remove possible headers for raw base64 standard representation
  const cleanMockup = mockupBase64.replace(/^data:image\/[a-z]+;base64,/, '');
  const cleanActual = actualBase64.replace(/^data:image\/[a-z]+;base64,/, '');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Compare IMAGE A (expected mockup) against IMAGE B (actual implementation) following the exact audit process, severity rubric, and JSON output format specified in your instructions. Return only the JSON object, nothing else.' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${cleanMockup}` } },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${cleanActual}` } }
      ]
    }
  ];
}

async function runCombinedVisualComparison(mockupPath, actualPath, mockupBase64, actualBase64) {
  const [vectorSimilarity, structuralSimilarity] = await Promise.all([
    compareImageVectors(mockupPath, actualPath),
    compareStructuralSimilarity(mockupPath, actualPath)
  ]);

  console.log(`[Visual Comparison] Vector similarity: ${vectorSimilarity.toFixed(3)}, Structural similarity: ${structuralSimilarity.toFixed(3)}`);

  if (vectorSimilarity < MISMATCH_THRESHOLD || structuralSimilarity < 0.4) {
    return {
      isFundamentalMismatch: true,
      vectorSimilarity,
      structuralSimilarity,
      geminiFindings: null,
      totalFindings: { critical: 1, high: 0, medium: 0, low: 0 },
      deduction: 70,
      summary: `Vector similarity: ${(vectorSimilarity * 100).toFixed(1)}%, Structural similarity: ${(structuralSimilarity * 100).toFixed(1)}%. One or both signals indicate a fundamental mismatch.`
    };
  }

  const messages = buildDetailedComparisonMessages(mockupBase64, actualBase64);
  const geminiResult = await callGroq(messages, true);

  let deduction = 0;
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };

  if (geminiResult.findings && Array.isArray(geminiResult.findings)) {
    geminiResult.findings.forEach(f => {
      deduction += SEVERITY_WEIGHTS[f.severity] || 0;
      const key = f.severity.toLowerCase();
      if (counts[key] !== undefined) counts[key]++;
    });
  }

  deduction = Math.min(deduction, 90);

  return {
    isFundamentalMismatch: false,
    vectorSimilarity,
    structuralSimilarity,
    geminiFindings: geminiResult.findings || [],
    totalFindings: counts,
    deduction,
    summary: geminiResult.overallAssessment || 'Detailed comparison completed.'
  };
}

module.exports = { runCombinedVisualComparison };
