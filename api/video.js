function cleanModelName(model) {
    return model.startsWith("models/") ? model.slice(7) : model;
}

function extractText(data) {
    if (!data || typeof data !== "object") {
        return "";
    }

    if (typeof data.text === "string") {
        return data.text;
    }
    if (typeof data.output_text === "string") {
        return data.output_text;
    }

    const candidates = Array.isArray(data.candidates) ? data.candidates : [];
    for (const candidate of candidates) {
        const parts = candidate?.content?.parts || [];
        const text = parts
            .filter((part) => typeof part.text === "string")
            .map((part) => part.text)
            .join("\n")
            .trim();
        if (text) {
            return text;
        }
    }

    const output = Array.isArray(data.output) ? data.output : [];
    for (const item of output) {
        if (typeof item.text === "string") {
            return item.text;
        }
        const content = Array.isArray(item.content) ? item.content : [];
        const text = content
            .filter((part) => typeof part.text === "string")
            .map((part) => part.text)
            .join("\n")
            .trim();
        if (text) {
            return text;
        }
    }

    const steps = Array.isArray(data.steps) ? data.steps : [];
    for (const step of steps) {
        const content = Array.isArray(step.content) ? step.content : [];
        const text = content
            .filter((part) => typeof part.text === "string")
            .map((part) => part.text)
            .join("\n")
            .trim();
        if (text) {
            return text;
        }
    }

    return "";
}

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

    const { model, video_url, prompt, system_instruction } = req.body;
    if (!model) {
        return res.status(400).json({ error: "Field 'model' is required" });
    }
    if (!video_url) {
        return res.status(400).json({ error: "Field 'video_url' is required" });
    }
    if (!prompt) {
        return res.status(400).json({ error: "Field 'prompt' is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    }

    const cleanModel = cleanModelName(model);
    const userPrompt = [
        prompt,
        "",
        "Analyze the YouTube video from the provided video input. If you cannot access the video, say that directly instead of guessing.",
    ].join("\n");

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 240000);

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: cleanModel,
                    input: [
                        { type: "text", text: userPrompt },
                        { type: "video", uri: video_url },
                    ],
                    ...(system_instruction ? { system_instruction } : {}),
                }),
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
                error: "Invalid response from Gemini API",
                detail: text.slice(0, 500),
            });
        }

        const text = extractText(data);
        return res.status(response.status).json({ ...data, text });
    } catch (err) {
        if (err.name === "AbortError") {
            return res.status(504).json({ error: "Gemini video request timed out" });
        }
        return res.status(500).json({ error: err.message });
    }
}
