import { NextResponse } from 'next/server';

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Call Scoring Methodology — BondScanner</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc; color: #1e293b; padding: 48px 32px; }
  .page { max-width: 860px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
  .header { background: #0f172a; color: #f1f5f9; padding: 32px 40px; }
  .header h1 { font-size: 24px; font-weight: 700; margin-bottom: 6px; }
  .header p  { font-size: 13px; color: #7e95b8; }
  .body { padding: 40px; }
  h2 { font-size: 16px; font-weight: 700; color: #0f172a; margin: 32px 0 14px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px; }
  h2:first-of-type { margin-top: 0; }
  p  { font-size: 14px; line-height: 1.7; color: #334155; margin-bottom: 12px; }
  .gate-box { background: #fef9ec; border: 1px solid #fcd34d; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; }
  .gate-box h3 { font-size: 13px; font-weight: 700; color: #92400e; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.4px; }
  .gate-box p  { font-size: 13px; color: #78350f; margin: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
  thead tr { background: #0f172a; color: #f1f5f9; }
  thead th { padding: 10px 14px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody td { padding: 10px 14px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .pts { font-weight: 700; color: #2563eb; white-space: nowrap; }
  .score-band { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
  .band { flex: 1; min-width: 140px; border-radius: 8px; padding: 12px 16px; text-align: center; }
  .band .range { font-size: 18px; font-weight: 700; }
  .band .label { font-size: 12px; margin-top: 3px; }
  .band-low  { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }
  .band-mid  { background: #fffbeb; border: 1px solid #fde68a; color: #d97706; }
  .band-good { background: #f0fdf4; border: 1px solid #bbf7d0; color: #16a34a; }
  .band-exc  { background: #eff6ff; border: 1px solid #bfdbfe; color: #2563eb; }
  .flow { display: flex; flex-direction: column; gap: 4px; margin-bottom: 20px; }
  .flow-step { display: flex; align-items: flex-start; gap: 12px; padding: 10px 14px; border-radius: 8px; font-size: 13px; }
  .flow-step.pass { background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; }
  .flow-step.fail { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }
  .flow-step.neutral { background: #f8fafc; border: 1px solid #e2e8f0; color: #334155; }
  .flow-step .icon { font-size: 16px; flex-shrink: 0; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
  @media print { body { padding: 0; background: #fff; } .page { box-shadow: none; border-radius: 0; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>Call Scoring Methodology</h1>
    <p>BondScanner · Signup Call Analysis · Version 1.0 · ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
  </div>

  <div class="body">

    <h2>Overview</h2>
    <p>Every call processed through the system is automatically scored on two dimensions: <strong>Call Quality</strong> and <strong>Agent Performance</strong>. Scoring uses a structured rubric and applies gate conditions to ensure meaningless calls (too short, silent, or low-quality) do not pollute the RM's average score.</p>

    <h2>Gate Conditions</h2>

    <div class="gate-box">
      <h3>Gate 1 — Duration &amp; Content Check</h3>
      <p>If call duration is <strong>less than 60 seconds</strong>, OR the transcript shows no real conversation (silent recording, wrong number, single-word exchange) → <strong>Call Quality = N/A, Agent Performance = N/A</strong>. Call is excluded from all averages.</p>
    </div>

    <div class="gate-box">
      <h3>Gate 2 — Quality Threshold</h3>
      <p>After scoring Call Quality, if the score is <strong>below 4/10</strong> → <strong>Agent Performance = N/A</strong>. There is not enough substance in the call to fairly evaluate what the agent did. Only calls with Call Quality ≥ 4/10 receive an Agent Performance score.</p>
    </div>

    <div class="flow">
      <div class="flow-step neutral"><span class="icon">▶</span><span><strong>Call arrives</strong> — transcribed &amp; duration measured</span></div>
      <div class="flow-step fail"><span class="icon">✗</span><span><strong>Duration &lt; 60s or no real content</strong> → Call Quality = N/A, Agent Performance = N/A (Gate 1)</span></div>
      <div class="flow-step pass"><span class="icon">✓</span><span><strong>Duration ≥ 60s &amp; real conversation</strong> → Score Call Quality using rubric below</span></div>
      <div class="flow-step fail"><span class="icon">✗</span><span><strong>Call Quality &lt; 4/10</strong> → Agent Performance = N/A (Gate 2)</span></div>
      <div class="flow-step pass"><span class="icon">✓</span><span><strong>Call Quality ≥ 4/10</strong> → Score Agent Performance using rubric below</span></div>
    </div>

    <h2>Call Quality Rubric (out of 10)</h2>
    <p>Measures the <em>quality of the conversation itself</em> — independent of how the agent performed.</p>
    <table>
      <thead><tr><th>Criterion</th><th>Points</th><th>What is evaluated</th></tr></thead>
      <tbody>
        <tr><td>Conversation depth</td><td class="pts">0 – 3</td><td>Was there genuine back-and-forth, or just a monologue / silence?</td></tr>
        <tr><td>Customer engagement</td><td class="pts">0 – 3</td><td>Did the customer respond, ask questions, or show interest?</td></tr>
        <tr><td>Resolution</td><td class="pts">0 – 2</td><td>Was the customer's query or need actually addressed?</td></tr>
        <tr><td>Structure</td><td class="pts">0 – 2</td><td>Was there a clear intro → discussion → close?</td></tr>
        <tr style="background:#eff6ff"><td><strong>Total</strong></td><td class="pts"><strong>10</strong></td><td></td></tr>
      </tbody>
    </table>

    <h2>Agent Performance Rubric (out of 10)</h2>
    <p>Measures <em>what the RM did</em> on the call. Only scored when Call Quality ≥ 4/10.</p>
    <table>
      <thead><tr><th>Criterion</th><th>Points</th><th>What is evaluated</th></tr></thead>
      <tbody>
        <tr><td>Opening &amp; rapport</td><td class="pts">0 – 2</td><td>Professional greeting; built comfort and trust with the customer</td></tr>
        <tr><td>Needs discovery</td><td class="pts">0 – 2</td><td>Agent asked what the customer is looking for before pitching</td></tr>
        <tr><td>Product pitch quality</td><td class="pts">0 – 3</td><td>Bond/investment options explained clearly with yields and returns</td></tr>
        <tr><td>Objection handling</td><td class="pts">0 – 2</td><td>Customer hesitations or concerns were acknowledged and addressed</td></tr>
        <tr><td>Clear next step</td><td class="pts">0 – 1</td><td>A follow-up action or callback was defined before ending the call</td></tr>
        <tr style="background:#eff6ff"><td><strong>Total</strong></td><td class="pts"><strong>10</strong></td><td></td></tr>
      </tbody>
    </table>

    <h2>Score Bands</h2>
    <div class="score-band">
      <div class="band band-low"><div class="range">0 – 3</div><div class="label">Poor</div></div>
      <div class="band band-mid"><div class="range">4 – 5</div><div class="label">Below Average</div></div>
      <div class="band band-good"><div class="range">6 – 7</div><div class="label">Good</div></div>
      <div class="band band-exc"><div class="range">8 – 10</div><div class="label">Excellent</div></div>
    </div>

    <h2>RM-Level Average Score</h2>
    <p>The <strong>Avg Score</strong> shown in the RM Report is the mean of all non-null <em>Agent Performance</em> scores for that session. Calls excluded by Gate 1 or Gate 2 are <strong>not counted</strong> in the denominator, so the average reflects only real, scoreable interactions.</p>
    <p>Example: 41 calls → 5 excluded by Gate 1 (too short), 8 excluded by Gate 2 (quality &lt; 4) → avg is computed over the remaining 28 calls.</p>

    <div class="footer">
      <span>BondScanner · Call Analysis Platform</span>
      <span>Generated ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
    </div>

  </div>
</div>
</body>
</html>`;

export async function GET() {
  return new NextResponse(HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'attachment; filename="BondScanner-Scoring-Methodology.html"',
    },
  });
}
