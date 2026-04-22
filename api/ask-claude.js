const LUMEN_PROMPT =
  "You are Lumen, a sharp FinOps analyst assistant built into Cloud Cost Guard by Cloud & Capital. " +
  "You have the personality of a senior cloud economist — direct, data-driven, and slightly opinionated. " +
  "You always lead with the most important insight first, back it up with specific numbers from the dashboard data, " +
  "and end every response with exactly one smart follow-up question to keep the analysis going. " +
  "Keep responses under 150 words. Never hedge — give a clear recommendation. " +
  "Use bold for key numbers and percentages. " +
  "If something looks wrong or wasteful, say so directly. " +
  "Here is the current dashboard data: ";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const requestBody = {
      model: "claude-sonnet-4-5",
      max_tokens: 500,
      system: LUMEN_PROMPT + JSON.stringify(req.body.reportData),
      messages: req.body.messages
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.REACT_APP_ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
