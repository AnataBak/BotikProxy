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

    const { model, ...body } = req.body;

    if (!model) {
        return res.status(400).json({ error: "Field 'model' is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        // Убираем префикс "models/" из model, если он есть,
        // чтобы не получить models/models/...
        const cleanModel = model.startsWith("models/") ? model.slice(7) : model;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`,
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
                error: "Invalid response from Gemini API",
                detail: text.slice(0, 500),
            });
        }

        // Возвращаем ВЕСЬ ответ Gemini как есть, включая ошибки
        return res.status(response.status).json(data);

    } catch (err) {
        if (err.name === "AbortError") {
            return res.status(504).json({ error: "Gemini API request timed out" });
        }
        return res.status(500).json({ error: err.message });
    }
}