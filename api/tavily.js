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

    const { api_key, query, max_results } = req.body;
    if (!api_key) {
        return res.status(400).json({ error: "Field 'api_key' is required" });
    }
    if (!query) {
        return res.status(400).json({ error: "Field 'query' is required" });
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                api_key: api_key,
                query: query,
                max_results: max_results || 5,
                include_answer: true,
                include_raw_content: false,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        let data;
        try {
            data = await response.json();
        } catch {
            const text = await response.text();
            return res.status(response.status).json({
                error: "Invalid response from Tavily API",
                detail: text.slice(0, 500),
            });
        }

        return res.status(response.status).json(data);

    } catch (err) {
        if (err.name === "AbortError") {
            return res.status(504).json({ error: "Tavily API request timed out" });
        }
        return res.status(500).json({ error: err.message });
    }
}