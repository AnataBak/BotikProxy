export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { endpoint_url, ...body } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    }

    // URL для Cloud TTS API
    const ttsEndpoint = endpoint_url || "https://texttospeech.googleapis.com/v1/text:synthesize";

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(
            `${ttsEndpoint}?key=${apiKey}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            }
        );

        clearTimeout(timeout);

        let data;
        try {
            data = await response.json();
        } catch {
            const text = await response.text();
            return res.status(response.status).json({
                error: "Invalid response from Cloud TTS API",
                detail: text.slice(0, 500),
            });
        }

        return res.status(response.status).json(data);

    } catch (err) {
        if (err.name === "AbortError") {
            return res.status(504).json({ error: "Cloud TTS API request timed out" });
        }
        return res.status(500).json({ error: err.message });
    }
}