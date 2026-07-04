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
        const timeout = setTimeout(() => controller.abort(), 60000);

        // Убираем префикс "models/" из model, если он есть
        const cleanModel = model.startsWith("models/") ? model.slice(7) : model;

        // Определяем, TTS ли это модель
        const isTTS = cleanModel.includes("tts");

        let endpoint;
        if (isTTS) {
            // TTS модели используют другой endpoint
            endpoint = `https://generativelanguage.googleapis.com/v1/models/${cleanModel}:generateContent?key=${apiKey}`;
        } else {
            endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;
        }

        const response = await fetch(
            endpoint,
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

        // Если v1beta вернул 404 и это TTS модель — пробуем v1
        if (!isTTS && response.status === 404 && cleanModel.includes("tts")) {
            clearTimeout(timeout);
            const controller2 = new AbortController();
            const timeout2 = setTimeout(() => controller2.abort(), 60000);
            
            const response2 = await fetch(
                `https://generativelanguage.googleapis.com/v1/models/${cleanModel}:generateContent?key=${apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                    signal: controller2.signal,
                }
            );
            clearTimeout(timeout2);
            
            try {
                data = await response2.json();
            } catch {
                const text = await response2.text();
                return res.status(response2.status).json({
                    error: "Invalid response from Gemini API",
                    detail: text.slice(0, 500),
                });
            }
            return res.status(response2.status).json(data);
        }

        // Возвращаем ВЕСЬ ответ Gemini как есть
        return res.status(response.status).json(data);

    } catch (err) {
        if (err.name === "AbortError") {
            return res.status(504).json({ error: "Gemini API request timed out" });
        }
        return res.status(500).json({ error: err.message });
    }
}